import { Server as SocketIOServer, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { isAddress } from 'viem';
import { EventEmitter } from 'events';
import { AgentManager, SubscriptionRequiredError } from '../AgentManager';
import { serverConfig } from '../config';
import { requireAuthenticatedSession } from '../SessionGuard';
import { verifyWalletSignature } from '../WalletSignatureVerifier';
import { resolveVerifiedWalletIdentity } from '../../core/identity/WalletIdentityResolver';
import { SupabaseIdentityService } from '../../core/identity/SupabaseIdentityService';
import { ReownWalletIdentityService, WalletAlreadyLinkedError } from '../../core/identity/ReownWalletIdentityService';
import { GoogleDriveOAuthService } from '../../core/integrations/google-drive/GoogleDriveOAuthService';
import { ThreadsOAuthService } from '../auth/threadsAuth';
import { TelegramBotManager } from '../../capabilities/communication/adapters/TelegramBotManager';
import { McpApiKeyStore } from '../../mcp/McpApiKeyStore';
import { OAuthStore } from '../auth/oauth/OAuthStore';
import { StandardEvent, EventTypes } from '../../core/events/types';
import { SeraUserContext } from '../../core/identity/types';
import { BaseAdapter } from '../../capabilities/wallet/chains/BaseAdapter';
import { generateSessionToken, verifySessionToken, WalletLinkChallenge } from './socketAuth';
import { DocumentParserService, ParsedDocumentResult } from '../../core/ingestion/DocumentParserService';

export interface SocketGatewayDependencies {
  agentManager: AgentManager;
  googleDriveOAuthService: GoogleDriveOAuthService | null;
  threadsOAuthService: ThreadsOAuthService;
  telegramBotManager: TelegramBotManager;
  mcpApiKeyStore: McpApiKeyStore;
  globalOAuthStore: OAuthStore;
  globalSecretManager: any;
  supabaseIdentityService: SupabaseIdentityService | null;
  reownWalletIdentityService: ReownWalletIdentityService | null;
}

let msgIdCounter = Date.now();

export function registerSocketGateway(io: SocketIOServer, deps: SocketGatewayDependencies): void {
  const {
    agentManager,
    googleDriveOAuthService,
    threadsOAuthService,
    telegramBotManager,
    mcpApiKeyStore,
    globalOAuthStore,
    globalSecretManager,
    supabaseIdentityService,
    reownWalletIdentityService
  } = deps;

  io.on('connection', (socket: Socket) => {
    console.log(`[Server] UI Client connected: ${socket.id}`);

    // By default, connections are unauthenticated and bound to nothing.
    // We point them to 'dev' to prevent null reference errors, but they cannot 
    // interact or read its state until auth:login succeeds.
    socket.data.sessionId = 'dev';
    socket.data.isAuthenticated = false;
    let instance = agentManager.getOrCreateInstance('dev');
    let walletLinkChallenge: WalletLinkChallenge | undefined;
    let socketObservationBuffer: any[] = [];
    let currentTurnStartTime = Date.now();

    const challengeCache = new Map<string, string>();

    const issueLoginChallenge = (payload?: { address?: string }) => {
      const address = payload?.address?.toLowerCase();
      if (address && challengeCache.has(address)) {
        const message = challengeCache.get(address)!;
        socket.data.loginMessage = message;
        socket.emit('auth:challenge', { message });
        return;
      }
      
      const nonce = randomUUID();
      const message = `Sign in to Sera\nNonce: ${nonce}`;
      socket.data.loginMessage = message;
      if (address) {
        challengeCache.set(address, message);
        // Clean up after 5 minutes
        setTimeout(() => challengeCache.delete(address), 5 * 60 * 1000);
      }
      socket.emit('auth:challenge', { message });
    };

    const sendInitialState = async () => {
      try {
        await instance.chatHistoryStore.ensureLoaded();
        await instance.triggerStore.ensureLoaded();

        // Session Handoff: If this is an authenticated wallet session and history is empty,
        // seamlessly migrate any recent conversation from the anonymous session
        if (socket.data.sessionId && socket.data.sessionId !== 'anonymous') {
          const anonInstance = agentManager.getInstance('anonymous');
          if (anonInstance && instance.chatHistoryStore.getUiMessages().length === 0) {
            instance.chatHistoryStore.migrateFrom(anonInstance.chatHistoryStore);
          }
        }
      } catch (e) {
        console.warn('[Server] Failed to ensure chat history / triggers loaded:', e);
      }
      const walletState = instance.worldStateService.getWalletState();
      if (walletState && walletState.address) {
        socket.emit('wallet:update', walletState);
      }
      socket.emit('memory:vault_status', instance.memoryVault);
      socket.emit('chat:history', instance.chatHistoryStore.getUiMessages());
      socket.emit('observations:history', instance.observationStore.getAll());
      socket.emit('automations:update', instance.triggerStore.getAll());
      socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
      if (googleDriveOAuthService && socket.data.sessionId) {
        void googleDriveOAuthService.getStatus(socket.data.sessionId)
          .then((status) => {
            console.log(`[GoogleDrive] Status for ${socket.data.sessionId}:`, status);
            socket.emit('google_drive:status', status);
          })
          .catch((e) => {
            console.error(`[GoogleDrive] Error getting status for ${socket.data.sessionId}:`, e);
            socket.emit('google_drive:status', { provider: 'GOOGLE_DRIVE', status: 'UNAVAILABLE' });
          });
      } else {
        console.log(`[GoogleDrive] UNAVAILABLE because:`, { serviceExists: !!googleDriveOAuthService, sessionId: socket.data.sessionId });
        socket.emit('google_drive:status', { provider: 'GOOGLE_DRIVE', status: 'UNAVAILABLE' });
      }
      if (socket.data.sessionId) {
        void threadsOAuthService.getStatus(socket.data.sessionId)
          .then((status) => socket.emit('threads:status', status))
          .catch(() => socket.emit('threads:status', { provider: 'THREADS', status: 'UNAVAILABLE' }));
        
        void telegramBotManager.getStatus(socket.data.sessionId)
          .then((status) => {
            socket.emit('telegram:status', status);
            if (status.status === 'CONNECTED') {
              const inst = agentManager.getOrCreateInstance(socket.data.sessionId!);
              if (inst?.runtime?.capabilityCatalog && !inst.runtime.capabilityCatalog.isConnectorActive('telegram')) {
                inst.runtime.capabilityCatalog.activateConnector('telegram');
                socket.emit('connector:catalog', inst.runtime.capabilityCatalog.allConnectorSummaries());
              }
            }
          })
          .catch(() => socket.emit('telegram:status', { provider: 'TELEGRAM', status: 'UNAVAILABLE' }));
      } else {
        socket.emit('threads:status', { provider: 'THREADS', status: 'UNAVAILABLE' });
        socket.emit('telegram:status', { provider: 'TELEGRAM', status: 'UNAVAILABLE' });
      }
    };

    let sessionCognitiveSteps: any[] = [];

    // Socket-specific listener references to allow proper unbinding
    const onAgentSpeak = (event: any) => {
      const payload = event.payload || event;

      // Channel Segregation: If response is destined for an external platform (e.g. Telegram, MCP, Threads),
      // do not broadcast to Web UI socket and do not pollute UI chatHistoryStore.
      const ctx = payload.responseContext;
      if (ctx && ctx.platform && ctx.platform !== 'ui' && ctx.platform !== 'socket') {
        return;
      }

      msgIdCounter = Math.max(Date.now(), msgIdCounter + 1);
      const msgId = msgIdCounter;
      const currentObs = [...socketObservationBuffer];
      socketObservationBuffer = [];
      sessionCognitiveSteps = [];
      
      const measuredSeconds = Math.max(1, Math.round((Date.now() - currentTurnStartTime) / 1000));
      const finalDuration = (typeof payload.durationSeconds === 'number' && payload.durationSeconds > 0)
        ? payload.durationSeconds
        : measuredSeconds;
      const hadTools = Boolean(payload.hadTools || (payload.cognitiveSteps && payload.cognitiveSteps.length > 1));
      const cognitiveSteps = payload.cognitiveSteps || (currentObs.length > 0 ? currentObs.map((o: any) => ({ title: o.name || 'Observasi Kognitif', detail: o.summary || o.type })) : undefined);

      const replyData = {
        id: msgId,
        content: payload.text,
        actionLinks: payload.actionLinks,
        cognitiveSteps,
        durationSeconds: finalDuration,
        hadTools,
      };

      if (socket.data.sessionId && socket.data.sessionId !== 'dev') {
        io.to(`user:${socket.data.sessionId}`).emit('chat:reply', replyData);
        io.to(`user:${socket.data.sessionId}`).emit('chat:activity', null);
      } else {
        socket.emit('chat:reply', replyData);
        socket.emit('chat:activity', null);
      }

      const existingMsgs = instance.chatHistoryStore.getUiMessages();
      if (!existingMsgs.some((m: any) => m.id === msgId)) {
        instance.chatHistoryStore.appendUiMessage({
          id: msgId,
          role: 'agent',
          content: payload.text,
          actionLinks: payload.actionLinks,
          observations: currentObs.length > 0 ? currentObs : undefined,
          cognitiveSteps,
          durationSeconds: finalDuration,
          hadTools,
        });
      }
    };

    const onActivity = (event: any) => {
      const payload = event.payload || event;
      const ctx = payload.responseContext;
      if (ctx && ctx.platform && ctx.platform !== 'ui' && ctx.platform !== 'socket') {
        return;
      }

      if (Array.isArray(payload.cognitiveSteps) && payload.cognitiveSteps.length > 0) {
        sessionCognitiveSteps = payload.cognitiveSteps;
      }

      const msgId = ++msgIdCounter;
      const activityData = {
        id: msgId,
        content: payload.content || (payload.phase === 'WORKING' ? 'Working' : 'Thinking'),
        phase: payload.phase || (String(payload.content || '').toLowerCase().includes('working') ? 'WORKING' : 'THINKING'),
        subText: payload.subText || payload.content || 'Analyzing request...',
        cognitiveSteps: (Array.isArray(payload.cognitiveSteps) && payload.cognitiveSteps.length > 0)
          ? payload.cognitiveSteps
          : (sessionCognitiveSteps.length > 0 ? sessionCognitiveSteps : []),
        startTime: payload.startTime,
      };

      if (socket.data.sessionId && socket.data.sessionId !== 'dev') {
        io.to(`user:${socket.data.sessionId}`).emit('chat:activity', activityData);
      } else {
        socket.emit('chat:activity', activityData);
      }
    };

    const onUiCommand = (event: any) => {
      const payload = event.payload || event;
      socket.emit('ui:command', {
        type: payload.command,
        payload: payload.value,
      });
    };

    const onProposalGenerated = (event: any) => {
      const payload = event.payload || event;
      const ctx = payload.responseContext;
      if (ctx && ctx.platform && ctx.platform !== 'ui' && ctx.platform !== 'socket') {
        return;
      }

      const msgId = ++msgIdCounter;
      const currentObs = [...socketObservationBuffer];
      socketObservationBuffer = [];
      
      const proposalData = {
        id: msgId,
        proposalId: payload.proposalId,
        intent: payload.intent,
        parameters: payload.parameters,
        candidates: payload.candidates
      };
      socket.emit('chat:proposal', proposalData);
      instance.chatHistoryStore.appendUiMessage({
        id: msgId,
        role: 'agent',
        proposal: proposalData,
        observations: currentObs.length > 0 ? currentObs : undefined,
      });
    };

    const onGoalResult = (event: StandardEvent) => {
      const result = event.payload;
      const trigger = instance.triggerStore.get(result.requestId);
      if (trigger) {
        trigger.lastExecutionResult = {
          success: result.success,
          errorMessage: result.errorMessage
        };
        instance.triggerStore.save(trigger);
        socket.emit('automations:update', instance.triggerStore.getAll());
      }
    };

    const onCognitiveObservation = (event: StandardEvent) => {
      instance.observationStore.append(event);
      socketObservationBuffer.push({ ...event.payload, timestamp: event.timestamp });
      socket.emit('observations:new', { ...event.payload, timestamp: event.timestamp });
    };

    const onWalletUpdate = (event: StandardEvent) => {
      socket.emit('wallet:update', event.payload);
    };

    const onAutonomyAgreementChanged = () => {
      socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
    };

    const onBillingCreditsUpdated = (event: StandardEvent) => {
      socket.emit('billing:update', event.payload);
    };

    const onTriggerRegistered = () => {
      socket.emit('automations:update', instance.triggerStore.getAll());
    };

    const bindListeners = () => {
      instance.eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
      instance.eventBus.on(EventTypes.DIALOGUE_ACTIVITY, onActivity);
      instance.eventBus.on(EventTypes.UI_COMMAND, onUiCommand);
      instance.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);
      instance.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);
      instance.eventBus.on(EventTypes.GOAL_REQUIRES_APPROVAL, (payload: any) => socket.emit('governance:approval_needed', payload));
      instance.eventBus.on(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);
      instance.eventBus.on(EventTypes.DOMAIN_WALLET_STATE, onWalletUpdate);
      instance.eventBus.on(EventTypes.AUTONOMY_AGREEMENT_ACTIVATED, onAutonomyAgreementChanged);
      instance.eventBus.on(EventTypes.AUTONOMY_AGREEMENT_REVOKED, onAutonomyAgreementChanged);
      instance.eventBus.on(EventTypes.BILLING_CREDITS_UPDATED, onBillingCreditsUpdated);
      instance.eventBus.on('system.trigger.registered', onTriggerRegistered);
    };

    const unbindListeners = () => {
      instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
      instance.eventBus.off(EventTypes.DIALOGUE_ACTIVITY, onActivity);
      instance.eventBus.off(EventTypes.UI_COMMAND, onUiCommand);
      instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);
      instance.eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);
      instance.eventBus.removeAllListeners(EventTypes.GOAL_REQUIRES_APPROVAL);
      instance.eventBus.off(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);
      instance.eventBus.off(EventTypes.DOMAIN_WALLET_STATE, onWalletUpdate);
      instance.eventBus.off(EventTypes.AUTONOMY_AGREEMENT_ACTIVATED, onAutonomyAgreementChanged);
      instance.eventBus.off(EventTypes.AUTONOMY_AGREEMENT_REVOKED, onAutonomyAgreementChanged);
      instance.eventBus.off(EventTypes.BILLING_CREDITS_UPDATED, onBillingCreditsUpdated);
      instance.eventBus.off('system.trigger.registered', onTriggerRegistered);
    };

    socket.on('auth:challenge', issueLoginChallenge);

    socket.on('auth:login', async (payload: { address?: string; message?: string; signature?: `0x${string}`; token?: string; supabaseAccessToken?: string; telegramInitData?: string }) => {
      let address = payload?.address?.toLowerCase();
      let principal: SeraUserContext;

      if (payload.token) {
        const recoveredPrincipal = verifySessionToken(payload.token);
        
        if (recoveredPrincipal?.userId.startsWith('wallet:')) {
          socket.emit('auth:error', { message: 'Your session has been upgraded. Please sign in again to sync with the database.', code: 'INVALID_TOKEN' });
          return;
        }

        if (recoveredPrincipal && (!address || recoveredPrincipal.personalWalletAddress === address)) {
          address = recoveredPrincipal.personalWalletAddress;
          principal = {
            userId: recoveredPrincipal.userId,
            personalWalletAddress: recoveredPrincipal.personalWalletAddress,
          };
        } else {
          socket.emit('auth:error', { message: 'Session expired or invalid. Please sign in again.', code: 'INVALID_TOKEN' });
          return;
        }

      } else if (payload.supabaseAccessToken) {
        if (!supabaseIdentityService) {
          socket.emit('auth:error', { message: 'Supabase identity is not configured on this server.', code: 'IDENTITY_UNAVAILABLE' });
          return;
        }
        try {
          principal = await supabaseIdentityService.resolve(payload.supabaseAccessToken, address);
        } catch (error) {
          console.error('[Server] Supabase identity verification failed:', error);
          socket.emit('auth:error', { message: 'Your sign-in session could not be verified. Please sign in again.', code: 'INVALID_IDENTITY_TOKEN' });
          return;
        }
      } else {
        address = address || 'dev';
        console.log(`[Server] Received auth:login via signature for wallet: ${address}`);

        if (address === 'dev' && !serverConfig.allowDevFeatures) {
          socket.emit('auth:error', { message: 'Development login is disabled.' });
          return;
        }

        if (address !== 'dev' && !isAddress(address)) {
          socket.emit('auth:error', { message: 'A valid wallet address is required.' });
          return;
        }

        if (address !== 'dev' && serverConfig.isProduction) {
          console.log(`[Server] Validating signature for ${address} in production...`);
          if (!payload?.message || !payload?.signature) {
            console.log(`[Server] Missing message or signature for ${address}`);
            socket.emit('auth:error', { message: 'A valid wallet signature is required.' });
            return;
          }
          
          const expectedMessage = challengeCache.get(address) || socket.data.loginMessage;
          if (payload.message !== expectedMessage) {
            console.log(`[Server] Message mismatch for ${address}. Expected: ${expectedMessage}, Got: ${payload.message}`);
            
            if (!payload.message.startsWith('Sign in to Sera\nNonce:')) {
              socket.emit('auth:error', { message: 'A valid wallet signature is required.' });
              return;
            }
            console.log(`[Server] Format is valid, proceeding to verify fallback signature.`);
          }

          try {
            const isValidSignature = await verifyWalletSignature(
              address as `0x${string}`,
              payload.message,
              payload.signature,
            );
            console.log(`[Server] Signature verification result: ${isValidSignature}`);
            if (!isValidSignature) {
              socket.emit('auth:error', { message: 'Wallet signature could not be verified.' });
              return;
            }
          } catch (error) {
            console.error(`[Server] Signature verification threw an error:`, error);
            socket.emit('auth:error', { message: 'Wallet signature could not be verified due to a network error.' });
            return;
          }
        } else if (address !== 'dev') {
          console.log(`[Server] Bypassing strict signature validation for ${address} in development mode.`);
        }

        if (address === 'dev') {
          principal = { userId: 'dev' };
        } else if (reownWalletIdentityService) {
          try {
            principal = await reownWalletIdentityService.resolveVerifiedWallet(address);
          } catch (error) {
            console.error('[Server] Reown identity persistence failed:', error);
            socket.emit('auth:error', { message: 'Your identity could not be prepared. Please try again.', code: 'IDENTITY_PERSISTENCE_FAILED' });
            return;
          }
        } else {
          principal = resolveVerifiedWalletIdentity(address);
        }
      }

      const newToken = generateSessionToken(principal!);
      socket.emit('auth:success', { token: newToken });

      if (socket.data.sessionId && socket.data.sessionId !== 'dev') socket.leave(`user:${socket.data.sessionId}`);
      unbindListeners();
      socket.data.sessionId = principal!.userId;
      socket.data.personalWalletAddress = principal!.personalWalletAddress;
      socket.data.loginMessage = undefined;
      instance = agentManager.getOrCreateInstance(principal!);
      bindListeners();
      sendInitialState();

      try {
        agentManager.checkEntitlement(principal!.userId);
      } catch (err) {
        if (err instanceof SubscriptionRequiredError) {
          agentManager.getSubscriptionService().addCreditsDirectly(principal!.userId, 1000000);
          console.log(`[Server] Granted 1,000,000 welcome tokens to ${principal!.userId}`);
          
          instance.eventBus.emit(EventTypes.BILLING_CREDITS_UPDATED, {
            id: `evt-billing-${Date.now()}`,
            type: EventTypes.BILLING_CREDITS_UPDATED,
            source: 'Server',
            payload: {
              address: principal!.userId,
              agentCredits: 1000000,
              periods: 1
            },
            timestamp: Date.now()
          });
        } else {
          throw err;
        }
      }

      socket.data.isAuthenticated = true;
      socket.join(`user:${principal!.userId}`);

      if (instance?.goalBridge) {
        instance.goalBridge.syncWalletState().catch(err => {
          console.warn('[Server] Failed to refresh wallet balance on login:', err);
        });
      }
    });

    socket.on('auth:logout', () => {
      unbindListeners();
      if (socket.data.sessionId && socket.data.sessionId !== 'dev') socket.leave(`user:${socket.data.sessionId}`);
      walletLinkChallenge = undefined;
      socket.data.isAuthenticated = false;
      socket.data.sessionId = 'dev';
      socket.data.personalWalletAddress = undefined;
      socket.data.loginMessage = undefined;
      instance = agentManager.getOrCreateInstance('dev');
      socket.emit('auth:logged_out');
    });

    socket.on('google_drive:connect', () => {
      if (!requireAuthenticatedSession(socket, 'google_drive:connect', instance?.eventBus)) return;
      if (!googleDriveOAuthService) {
        socket.emit('google_drive:error', { message: 'Google Drive connection is not configured for this environment.' });
        return;
      }
      socket.emit('google_drive:authorization', { authorizationUrl: googleDriveOAuthService.beginAuthorization(socket.data.sessionId!) });
    });

    socket.on('google_drive:disconnect', async () => {
      if (!requireAuthenticatedSession(socket, 'google_drive:disconnect', instance?.eventBus)) return;
      if (!googleDriveOAuthService) {
        socket.emit('google_drive:error', { message: 'Google Drive connection is not configured for this environment.' });
        return;
      }
      try {
        socket.emit('google_drive:status', await googleDriveOAuthService.disconnect(socket.data.sessionId!));
      } catch (error) {
        socket.emit('google_drive:error', { message: error instanceof Error ? error.message : 'Unable to disconnect Google Drive.' });
      }
    });

    socket.on('telegram:generate_link', async () => {
      if (!requireAuthenticatedSession(socket, 'telegram:generate_link', instance?.eventBus)) return;
      if (!telegramBotManager.isEnabled()) {
        socket.emit('telegram:error', { message: 'Telegram Bot is not configured on this server.' });
        return;
      }
      const code = await telegramBotManager.generateLinkCode(socket.data.sessionId);
      socket.emit('telegram:link_generated', { code });
    });

    socket.on('threads:connect', () => {
      if (!requireAuthenticatedSession(socket, 'threads:connect', instance?.eventBus)) return;
      if (socket.data.sessionId === 'dev' || !threadsOAuthService.appId) {
        socket.emit('threads:error', { message: 'Threads connection is not configured for this environment.' });
        return;
      }
      try {
        const authorizationUrl = threadsOAuthService.beginAuthorization(socket.data.sessionId!);
        socket.emit('threads:authorization', { authorizationUrl });
      } catch (err: any) {
        socket.emit('threads:error', { message: err.message || 'Failed to generate Threads authorization URL.' });
      }
    });

    socket.on('threads:disconnect', async () => {
      if (!requireAuthenticatedSession(socket, 'threads:disconnect', instance?.eventBus)) return;
      if (socket.data.sessionId === 'dev') {
        socket.emit('threads:status', { provider: 'THREADS', status: 'NOT_CONNECTED' });
        return;
      }
      try {
        const status = await threadsOAuthService.disconnect(socket.data.sessionId!);
        socket.emit('threads:status', status);
        if (instance?.runtime?.capabilityCatalog) {
          socket.emit('connector:status_changed', instance.runtime.capabilityCatalog.allConnectorSummaries());
        }
      } catch (err: any) {
        socket.emit('threads:error', { message: err.message || 'Failed to disconnect Threads.' });
      }
    });

    socket.on('threads:get_settings', async () => {
      console.log(`[Server] Received threads:get_settings from socket ${socket.id}`);
      if (!requireAuthenticatedSession(socket, 'threads:get_settings', instance?.eventBus)) {
        console.log(`[Server] requireAuthenticatedSession failed for ${socket.id}`);
        return;
      }
      try {
        console.log(`[Server] Fetching secrets for ${socket.data.sessionId}`);
        const settingsStr = await globalSecretManager.getSecret(`THREADS_SETTINGS_${socket.data.sessionId}`);
        console.log(`[Server] Secret result: ${settingsStr}`);
        const settings = settingsStr ? JSON.parse(settingsStr) : {
          allowPublishing: true,
          vipReplies: true,
          gatekeeper: true
        };
        socket.emit('threads:settings', settings);
        console.log(`[Server] Emitted threads:settings to ${socket.id}`);
      } catch (err: any) {
        console.error(`[Server] Error in threads:get_settings:`, err);
        socket.emit('threads:error', { message: err.message || 'Failed to fetch Threads settings.' });
      }
    });

    socket.on('threads:update_settings', async (settings) => {
      if (!requireAuthenticatedSession(socket, 'threads:update_settings', instance?.eventBus)) return;
      try {
        await globalSecretManager.setSecret(`THREADS_SETTINGS_${socket.data.sessionId}`, JSON.stringify(settings));
        socket.emit('threads:settings_updated', settings);
      } catch (err: any) {
        socket.emit('threads:error', { message: err.message || 'Failed to update Threads settings.' });
      }
    });

    socket.on('identity:link_wallet_challenge', (payload: { address?: string }) => {
      if (!requireAuthenticatedSession(socket, 'identity:link_wallet_challenge', instance?.eventBus)) return;
      if (!serverConfig.isProduction || !reownWalletIdentityService) {
        socket.emit('identity:link_error', {
          code: 'IDENTITY_LINKING_UNAVAILABLE',
          message: 'Wallet linking is available after the production identity service is configured.',
        });
        return;
      }

      const address = payload?.address?.toLowerCase();
      if (!address || !isAddress(address)) {
        socket.emit('identity:link_error', { code: 'INVALID_WALLET', message: 'A valid wallet address is required.' });
        return;
      }

      const expiresAt = Date.now() + 5 * 60 * 1000;
      const message = `Link this wallet to your SERA account\nNonce: ${randomUUID()}\nExpires: ${new Date(expiresAt).toISOString()}`;
      walletLinkChallenge = { address, message, expiresAt };
      socket.emit('identity:link_wallet_challenge', { address, message, expiresAt });
    });

    socket.on('identity:link_wallet', async (payload: { address?: string; message?: string; signature?: `0x${string}` }) => {
      if (!requireAuthenticatedSession(socket, 'identity:link_wallet', instance?.eventBus)) return;
      if (!serverConfig.isProduction || !reownWalletIdentityService) {
        socket.emit('identity:link_error', {
          code: 'IDENTITY_LINKING_UNAVAILABLE',
          message: 'Wallet linking is available after the production identity service is configured.',
        });
        return;
      }

      const address = payload?.address?.toLowerCase();
      const challenge = walletLinkChallenge;
      walletLinkChallenge = undefined;
      if (!challenge || Date.now() > challenge.expiresAt || address !== challenge.address || payload.message !== challenge.message || !payload.signature) {
        socket.emit('identity:link_error', { code: 'INVALID_LINK_PROOF', message: 'The wallet-linking request expired or is invalid. Please try again.' });
        return;
      }

      const isValidSignature = await verifyWalletSignature(
        address as `0x${string}`,
        challenge.message,
        payload.signature,
      );
      if (!isValidSignature) {
        socket.emit('identity:link_error', { code: 'INVALID_LINK_PROOF', message: 'Wallet ownership could not be verified.' });
        return;
      }

      try {
        const identity = await reownWalletIdentityService.linkVerifiedWallet(socket.data.sessionId!, address);
        socket.emit('identity:link_success', { address: identity.subject, kind: identity.kind });
      } catch (error: any) {
        if (error instanceof WalletAlreadyLinkedError) {
          socket.emit('identity:link_error', { code: 'WALLET_ALREADY_LINKED', message: error.message });
          return;
        }
        console.error('[Server] Wallet identity linking failed:', error);
        socket.emit('identity:link_error', { code: 'IDENTITY_LINK_FAILED', message: 'The wallet could not be linked. Please try again.' });
      }
    });

    socket.on('billing:fetch', (payload: { address: string }) => {
      if (!socket.data.sessionId || (socket.data.personalWalletAddress && payload.address.toLowerCase() !== socket.data.personalWalletAddress)) return;
      const periods = agentManager.getSubscriptionService().getRemainingPeriods(socket.data.sessionId);
      const credits = agentManager.getSubscriptionService().getAgentCredits(socket.data.sessionId);
      const agentCredits = credits === Infinity ? -1 : credits;
      socket.emit('billing:update', { periods, agentCredits });
    });

    socket.on('billing:topup_dev_mock', (payload: { address: string, amountUsdc: number }) => {
      if (!socket.data.sessionId || (socket.data.personalWalletAddress && payload.address.toLowerCase() !== socket.data.personalWalletAddress)) return;
      if (!serverConfig.allowDevFeatures) {
        socket.emit('billing:error', { message: 'Development billing is disabled.' });
        return;
      }
      const principalId = socket.data.sessionId;
      const amountUsdc = payload.amountUsdc;
      console.log(`[Server] Received mock topup for ${principalId} amount: ${amountUsdc} USDC`);
      try {
        agentManager.getSubscriptionService().recordTopUp(principalId, amountUsdc);
        const periods = agentManager.getSubscriptionService().getRemainingPeriods(principalId);
        const credits = agentManager.getSubscriptionService().getAgentCredits(principalId);
        const agentCredits = credits === Infinity ? -1 : credits;
        socket.emit('billing:update', { periods, agentCredits });

        try {
          agentManager.checkEntitlement(principalId);
          socket.data.isAuthenticated = true;
          socket.emit('auth:success', { token: generateSessionToken({ userId: principalId, personalWalletAddress: socket.data.personalWalletAddress }) });
        } catch (err) {}
      } catch (e) {
        console.error(e);
      }
    });

    const processChatMessage = async (rawPayload: any) => {
      let message = '';
      let clientMessageId: string | undefined = undefined;
      let images: string[] | undefined = undefined;
      let documents: ParsedDocumentResult[] | undefined = undefined;

      if (typeof rawPayload === 'string') {
        message = rawPayload;
      } else if (rawPayload && typeof rawPayload === 'object') {
        message = rawPayload.message || rawPayload.text || '';
        clientMessageId = rawPayload.clientMessageId;
        if (Array.isArray(rawPayload.images) && rawPayload.images.length > 0) {
          images = rawPayload.images;
        } else if (rawPayload.imageUrl) {
          images = [rawPayload.imageUrl];
        }

        if (Array.isArray(rawPayload.documents) && rawPayload.documents.length > 0) {
          const parsedList: ParsedDocumentResult[] = [];
          for (const doc of rawPayload.documents) {
            if (doc.formattedMarkdownTable && doc.detectedType) {
              parsedList.push(doc);
            } else if (doc.content || doc.base64) {
              try {
                const parsed = await DocumentParserService.parseDocument(
                  doc.base64 ? Buffer.from(doc.base64, 'base64') : (doc.content || ''),
                  doc.name || doc.filename || 'document.csv',
                  doc.mimeType || doc.type || 'text/csv'
                );
                parsedList.push(parsed);
              } catch (err: any) {
                console.warn('[SocketGateway] Failed to parse attached document:', err.message);
              }
            }
          }
          if (parsedList.length > 0) documents = parsedList;
        }
      }

      if (!message && (!images || images.length === 0) && (!documents || documents.length === 0)) return;

      socketObservationBuffer = [];
      sessionCognitiveSteps = [];
      console.log(`[Server] Received chat:message → dispatching USER_OBSERVATION for ${socket.data.sessionId}`);

      const msgTimestamp = Date.now();
      currentTurnStartTime = msgTimestamp;

      socket.emit('chat:ack', {
        clientMessageId,
        id: msgTimestamp,
        timestamp: msgTimestamp
      });

      const event: StandardEvent = {
        id: `evt-${msgTimestamp}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'SocketServer',
        payload: { message, images, documents },
        timestamp: msgTimestamp,
      };

      instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);

      instance.chatHistoryStore.appendUiMessage({
        id: msgTimestamp,
        clientMessageId,
        role: 'user',
        content: message || (images && images.length > 0 ? '[Image Attached]' : (documents && documents.length > 0 ? '[Document Attached]' : '')),
        images,
        documents
      });
    };

    socket.on('chat:message', async (rawPayload: any) => {
      if (!rawPayload) return;

      if (!socket.data.isAuthenticated) {
        let waited = 0;
        const checkInterval = 150;
        const maxWait = 3000;
        while (!socket.data.isAuthenticated && waited < maxWait) {
          await new Promise(r => setTimeout(r, checkInterval));
          waited += checkInterval;
        }
      }

      if (!requireAuthenticatedSession(socket, 'chat:message', instance?.eventBus)) return;
      await processChatMessage(rawPayload);
    });

    socket.on('chat:clear', () => {
      if (!requireAuthenticatedSession(socket, 'chat:clear', instance?.eventBus)) return;
      console.log(`[Server] Clearing chat history for ${socket.data.sessionId}`);
      instance.chatHistoryStore.clear();
      instance.runtime.dialogueEngine.clearHistory();
      socket.emit('chat:history', []);
    });

    socket.on('chat:cancel', () => {
      if (!requireAuthenticatedSession(socket, 'chat:cancel', instance?.eventBus)) return;
      console.log(`[Server] Received chat:cancel → dispatching DIALOGUE_USER_CANCELLED for ${socket.data.sessionId}`);
      if (socket.data.sessionId && socket.data.sessionId !== 'dev') {
        io.to(`user:${socket.data.sessionId}`).emit('chat:activity', null);
      } else {
        socket.emit('chat:activity', null);
      }
      const event: StandardEvent = {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_CANCELLED,
        source: 'SocketServer',
        payload: {},
        timestamp: Date.now(),
      };
      instance.eventBus.emit(EventTypes.DIALOGUE_USER_CANCELLED, event);
    });

    socket.on('chat:proposal_response', (data: { proposalId: string; action: 'APPROVE' | 'REJECT'; candidateId?: string }) => {
      if (!requireAuthenticatedSession(socket, 'chat:proposal_response', instance?.eventBus)) return;
      const { proposalId, action, candidateId } = data;
      console.log(`[Server] Received proposal response for ${proposalId}: ${action} (candidateId: ${candidateId})`);

      const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      instance.chatHistoryStore.updateProposalStatus(proposalId, status);

      if (action === 'APPROVE') {
        instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, {
          id: `evt-${Date.now()}`,
          type: EventTypes.DIALOGUE_PROPOSAL_APPROVED,
          source: 'SocketServer',
          timestamp: Date.now(),
          payload: { proposalId: proposalId, candidateId }
        } as StandardEvent);
      } else {
        instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, {
          id: `evt-${Date.now()}`,
          type: EventTypes.DIALOGUE_PROPOSAL_REJECTED,
          source: 'SocketServer',
          timestamp: Date.now(),
          payload: { proposalId: proposalId }
        } as StandardEvent);
      }
    });

    socket.on('automations:fetch', async () => {
      if (!requireAuthenticatedSession(socket, 'automations:fetch', instance?.eventBus)) return;
      try {
        await instance.triggerStore.ensureLoaded();
      } catch {}
      socket.emit('automations:update', instance.triggerStore.getAll());
    });

    socket.on('automations:delete', (id: string) => {
      if (!requireAuthenticatedSession(socket, 'automations:delete', instance?.eventBus)) return;
      instance.triggerStore.delete(id);
      socket.emit('automations:update', instance.triggerStore.getAll());
    });

    socket.on('autonomy-agreements:fetch', () => {
      if (!requireAuthenticatedSession(socket, 'autonomy-agreements:fetch', instance?.eventBus)) return;
      socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
    });

    socket.on('autonomy-agreements:revoke', (id: string) => {
      if (!requireAuthenticatedSession(socket, 'autonomy-agreements:revoke', instance?.eventBus)) return;
      try {
        const agreement = instance.autonomyAgreementStore.revoke(id);
        instance.eventBus.emit(EventTypes.AUTONOMY_AGREEMENT_REVOKED, {
          id: `evt-${Date.now()}`,
          type: EventTypes.AUTONOMY_AGREEMENT_REVOKED,
          source: 'SocketServer',
          timestamp: Date.now(),
          payload: { agreementId: agreement.id, principalId: agreement.principalId }
        } as StandardEvent);
        socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
      } catch (error) {
        socket.emit('autonomy-agreements:error', { message: error instanceof Error ? error.message : 'Unable to revoke agreement.' });
      }
    });

    socket.on('wallet:transfer', async (payload: { to: string; amount: string; asset: string }) => {
      if (!requireAuthenticatedSession(socket, 'wallet:transfer', instance?.eventBus)) return;
      console.log(`[Server] wallet:transfer requested → ${payload.amount} ${payload.asset} to ${payload.to}`);
      socket.emit('wallet:transfer:pending', { message: 'Broadcasting transaction...' });

      try {
        if (!instance.goalBridge) {
          socket.emit('wallet:transfer:result', { status: 'FAILED', error: 'Wallet not initialized' });
          return;
        }

        const result = await instance.goalBridge.directTransfer({
          recipientAddress: payload.to,
          amount: parseFloat(payload.amount),
          asset: payload.asset,
        });

        socket.emit('wallet:transfer:result', result);
      } catch (err: any) {
        console.error('[Server] wallet:transfer error:', err);
        socket.emit('wallet:transfer:result', { status: 'FAILED', error: err.message || 'Unknown error' });
      }
    });

    socket.on('wallet:deposit:gasless', async (payload: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
      signature?: string;
      v?: number;
      r?: string;
      s?: string;
    }) => {
      if (!requireAuthenticatedSession(socket, 'wallet:deposit:gasless', instance?.eventBus)) return;
      console.log(`[Server] wallet:deposit:gasless requested by ${payload.from} → ${payload.value} units to ${payload.to}`);
      socket.emit('wallet:transfer:pending', { message: 'Sponsoring and broadcasting gasless deposit on Base...' });

      try {
        if (!instance.goalBridge) {
          socket.emit('wallet:transfer:result', { status: 'FAILED', error: 'Wallet not initialized' });
          return;
        }

        const result = await instance.goalBridge.executeGaslessDeposit(payload);
        socket.emit('wallet:transfer:result', result);
        if (result.status === 'SUCCESS') {
          await instance.goalBridge.syncWalletState();
        }
      } catch (err: any) {
        console.error('[Server] wallet:deposit:gasless error:', err);
        socket.emit('wallet:transfer:result', { status: 'FAILED', error: err.message || 'Unknown error' });
      }
    });

    socket.on('wallet:sponsor_user_gas', async (payload: { address: string }, callback?: (res: any) => void) => {
      try {
        if (payload?.address && isAddress(payload.address)) {
          console.log(`[Server] ⛽ Checking / Sponsoring gas for personal wallet: ${payload.address}`);
          const baseAdapter = new BaseAdapter();
          const success = await baseAdapter.ensureAddressGas(payload.address as `0x${string}`);
          console.log(`[Server] Gas sponsor result for ${payload.address}: ${success}`);
          if (typeof callback === 'function') callback({ status: success ? 'SUCCESS' : 'SKIPPED' });
        } else {
          if (typeof callback === 'function') callback({ status: 'SKIPPED' });
        }
      } catch (err: any) {
        console.warn('[Server] Failed to sponsor gas for user:', err.message);
        if (typeof callback === 'function') callback({ status: 'FAILED', error: err.message });
      }
    });

    socket.on('wallet:refresh', async () => {
      if (instance?.goalBridge) {
        try {
          await instance.goalBridge.syncWalletState();
        } catch (err) {
          console.warn('[Server] Error refreshing wallet balance:', err);
        }
      }
    });

    socket.on('wallet:fetch', async () => {
      if (instance?.goalBridge) {
        try {
          await instance.goalBridge.syncWalletState();
        } catch (err) {
          console.warn('[Server] Error fetching wallet balance:', err);
        }
      }
    });

    // ── MCP API Key Management ────────────────────────────────────────────────
    socket.on('mcp:generate_key', () => {
      if (!requireAuthenticatedSession(socket, 'mcp:generate_key', instance?.eventBus)) return;
      const key = mcpApiKeyStore.generateKey(socket.data.sessionId!);
      socket.emit('mcp:key_generated', { key });
      socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
    });

    socket.on('mcp:revoke_key', (payload: { key: string }) => {
      if (!requireAuthenticatedSession(socket, 'mcp:revoke_key', instance?.eventBus)) return;
      mcpApiKeyStore.revokeKey(payload.key);
      socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
    });

    socket.on('mcp:list_keys', () => {
      if (!requireAuthenticatedSession(socket, 'mcp:list_keys', instance?.eventBus)) return;
      socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
    });

    // ── MCP 6-Digit Link Code & Platform Management ──────────────────────────
    socket.on('mcp:generate_link_code', () => {
      if (!requireAuthenticatedSession(socket, 'mcp:generate_link_code', instance?.eventBus)) return;
      try {
        const codeData = globalOAuthStore.createLinkCode(socket.data.sessionId!.toLowerCase());
        socket.emit('mcp:link_code_generated', codeData);
      } catch (err: any) {
        socket.emit('mcp:link_code_error', { message: err.message });
      }
    });

    socket.on('mcp:list_platforms', () => {
      if (!requireAuthenticatedSession(socket, 'mcp:list_platforms', instance?.eventBus)) return;
      const platforms = globalOAuthStore.listConnectedPlatforms(socket.data.sessionId!.toLowerCase());
      socket.emit('mcp:platforms_list', platforms);
    });

    socket.on('mcp:disconnect_platform', (payload: { clientId?: string }) => {
      if (!requireAuthenticatedSession(socket, 'mcp:disconnect_platform', instance?.eventBus)) return;
      globalOAuthStore.revokePlatformSession(socket.data.sessionId!.toLowerCase(), payload?.clientId);
      const platforms = globalOAuthStore.listConnectedPlatforms(socket.data.sessionId!.toLowerCase());
      socket.emit('mcp:platforms_list', platforms);
    });

    // ── Connector Marketplace Events ────────────────────────────────────────
    socket.on('connector:list', async () => {
      if (!instance?.runtime?.capabilityCatalog) return;
      await instance.runtime.capabilityCatalog.waitForLoad();
      const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
      socket.emit('connector:catalog', summaries);
    });

    socket.on('connector:activate', (payload: { connectorId: string }) => {
      if (!requireAuthenticatedSession(socket, 'connector:activate', instance?.eventBus)) return;
      if (!instance?.runtime?.capabilityCatalog) return;
      instance.runtime.capabilityCatalog.activateConnector(payload.connectorId);
      const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
      socket.emit('connector:status_changed', summaries);
      console.log(`[Server] Connector activated: ${payload.connectorId}`);
    });

    socket.on('connector:deactivate', (payload: { connectorId: string }) => {
      if (!requireAuthenticatedSession(socket, 'connector:deactivate', instance?.eventBus)) return;
      if (!instance?.runtime?.capabilityCatalog) return;
      instance.runtime.capabilityCatalog.deactivateConnector(payload.connectorId);
      const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
      socket.emit('connector:status_changed', summaries);
      console.log(`[Server] Connector deactivated: ${payload.connectorId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Server] UI Client disconnected: ${socket.id}`);
      unbindListeners();
    });
  });
}
