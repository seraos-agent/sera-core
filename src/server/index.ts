import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { isAddress } from 'viem';
import { randomUUID } from 'crypto';
import { StandardEvent, EventTypes } from '../core/events/types';
import { App as BoltApp } from '@slack/bolt';
import { SlackAdapter } from '../capabilities/communication/adapters/SlackAdapter';
import { agentManager, SubscriptionRequiredError } from './AgentManager';
import { isAllowedOrigin, serverConfig } from './config';
import { requireAuthenticatedSession } from './SessionGuard';
import { createHmac, randomBytes } from 'crypto';
import { SeraUserContext } from '../core/identity/types';
import { resolveVerifiedWalletIdentity } from '../core/identity/WalletIdentityResolver';
import { SupabaseIdentityService } from '../core/identity/SupabaseIdentityService';
import { ReownWalletIdentityService, WalletAlreadyLinkedError } from '../core/identity/ReownWalletIdentityService';
import { verifyWalletSignature } from './WalletSignatureVerifier';
import { GoogleDriveOAuthService } from '../core/integrations/google-drive/GoogleDriveOAuthService';

const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const supabaseIdentityService = SupabaseIdentityService.fromEnvironment();
const reownWalletIdentityService = ReownWalletIdentityService.fromEnvironment();
const googleDriveOAuthService = GoogleDriveOAuthService.fromEnvironment();

interface SessionTokenPrincipal {
  userId: string;
  personalWalletAddress?: string;
  expiry: number;
}

interface WalletLinkChallenge {
  address: string;
  message: string;
  expiresAt: number;
}

function generateSessionToken(principal: Omit<SessionTokenPrincipal, 'expiry'>): string {
  const expiry = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = Buffer.from(JSON.stringify({ ...principal, expiry })).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string): SessionTokenPrincipal | null {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expectedSig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    if (signature !== expectedSig) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionTokenPrincipal;
    if (!parsed.userId || !parsed.expiry || Date.now() > parsed.expiry) return null;
    return parsed;
  } catch {
    return null;
  }
}

const app = express();
// Lightweight, unauthenticated probe for deployment platforms. It deliberately
// does not instantiate or expose any agent state.
app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'sera-core' });
});
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
  },
});

function renderGoogleDriveCallbackPage(title: string, message: string, isSuccess: boolean): string {
  const color = isSuccess ? '#28795B' : '#B23B3B';
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]!));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F7F4;color:#18221D;font-family:Inter,system-ui,sans-serif"><main style="width:min(90vw,440px);padding:32px;border:1px solid #D9DDD6;border-radius:18px;background:#FFF"><div style="color:${color};font-weight:700;font-size:12px;letter-spacing:.08em">SERA GOOGLE DRIVE</div><h1 style="font-size:24px;margin:12px 0">${escapeHtml(title)}</h1><p style="color:#58635B;line-height:1.55;margin:0">${escapeHtml(message)}</p><p style="color:#58635B;font-size:13px;margin:20px 0 0">You can close this window.</p></main><script>window.opener?.postMessage({type:'sera:google-drive:complete',success:${isSuccess}}, '*');</script></body></html>`;
}

app.get('/auth/google-drive/callback', async (request, response) => {
  if (!googleDriveOAuthService) {
    response.status(503).type('html').send(renderGoogleDriveCallbackPage('Google Drive is not configured', 'SERA Core is missing its Google Drive OAuth configuration.', false));
    return;
  }

  const code = typeof request.query.code === 'string' ? request.query.code : undefined;
  const state = typeof request.query.state === 'string' ? request.query.state : undefined;
  const authorizationError = typeof request.query.error === 'string' ? request.query.error : undefined;
  if (authorizationError || !code || !state) {
    response.status(400).type('html').send(renderGoogleDriveCallbackPage('Google Drive was not connected', authorizationError || 'The authorization response was incomplete.', false));
    return;
  }

  try {
    const completed = await googleDriveOAuthService.completeAuthorization(code, state);
    io.to(`user:${completed.userId}`).emit('google_drive:status', completed.status);
    response.type('html').send(renderGoogleDriveCallbackPage('Google Drive connected', 'Your SERA Vault folder is ready. SERA stores only validated memory projections there.', true));
  } catch (error) {
    console.error('[GoogleDrive] OAuth callback failed:', error);
    const message = error instanceof Error ? error.message : 'The connection could not be completed.';
    response.status(400).type('html').send(renderGoogleDriveCallbackPage('Google Drive was not connected', message, false));
  }
});

let msgIdCounter = Date.now();

// ─── Socket.io Bridge (Sensory Layer) ────────────────────────────────────────
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

  const issueLoginChallenge = () => {
    const nonce = randomUUID();
    const message = `Sign in to Sera\nNonce: ${nonce}`;
    socket.data.loginMessage = message;
    socket.emit('auth:challenge', { message });
  };

  const sendInitialState = () => {
    const walletState = instance.worldStateService.getWalletState();
    if (walletState && walletState.address) {
      socket.emit('wallet:update', walletState);
    }
    socket.emit('memory:vault_status', instance.memoryVault);
    socket.emit('chat:history', instance.chatHistoryStore.getUiMessages());
    socket.emit('observations:history', instance.observationStore.getAll());
    socket.emit('automations:update', instance.triggerStore.getAll());
    socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
    if (googleDriveOAuthService && socket.data.sessionId && socket.data.sessionId !== 'dev') {
      void googleDriveOAuthService.getStatus(socket.data.sessionId)
        .then((status) => socket.emit('google_drive:status', status))
        .catch(() => socket.emit('google_drive:status', { provider: 'GOOGLE_DRIVE', status: 'UNAVAILABLE' }));
    } else {
      socket.emit('google_drive:status', { provider: 'GOOGLE_DRIVE', status: 'UNAVAILABLE' });
    }
  };

  // Do NOT send initial state or bind listeners upon raw connection!
  // Doing so leaks 'dev' state to users who are reconnecting via Wagmi 
  // before their auth:login completes. Wait for auth:login.

  // Socket-specific listener references to allow proper unbinding
  const onAgentSpeak = (event: StandardEvent) => {
    const msgId = ++msgIdCounter;
    const currentObs = [...socketObservationBuffer];
    socketObservationBuffer = [];
    
    socket.emit('chat:reply', {
      id: msgId,
      content: event.payload.text,
      actionLinks: event.payload.actionLinks,
    });
    instance.chatHistoryStore.appendUiMessage({
      id: msgId,
      role: 'agent',
      content: event.payload.text,
      actionLinks: event.payload.actionLinks,
      observations: currentObs.length > 0 ? currentObs : undefined,
    });
  };

  const onActivity = (event: StandardEvent) => {
    const msgId = ++msgIdCounter;
    socket.emit('chat:activity', {
      id: msgId,
      content: event.payload.content,
    });
  };

  const onUiCommand = (event: StandardEvent) => {
    socket.emit('ui:command', {
      type: event.payload.command,
      payload: event.payload.value,
    });
  };

  const onProposalGenerated = (event: StandardEvent) => {
    const msgId = ++msgIdCounter;
    const currentObs = [...socketObservationBuffer];
    socketObservationBuffer = [];
    
    const proposalData = {
      id: msgId,
      proposalId: event.payload.proposalId,
      intent: event.payload.intent,
      parameters: event.payload.parameters,
      candidates: event.payload.candidates
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
  };

  // Listeners are only bound after successful auth:login.

  socket.on('auth:challenge', issueLoginChallenge);

  socket.on('auth:login', async (payload: { address?: string; message?: string; signature?: `0x${string}`; token?: string; supabaseAccessToken?: string }) => {
    let address = payload?.address?.toLowerCase();
    let principal: SeraUserContext;

    // Check token authentication
    if (payload.token) {
      const recoveredPrincipal = verifySessionToken(payload.token);
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

      if (serverConfig.isProduction && address !== 'dev') {
        if (!payload?.message || !payload?.signature || payload.message !== socket.data.loginMessage) {
          socket.emit('auth:error', { message: 'A valid wallet signature is required.' });
          return;
        }

        const isValidSignature = await verifyWalletSignature(
          address as `0x${string}`,
          payload.message,
          payload.signature,
        );
        if (!isValidSignature) {
          socket.emit('auth:error', { message: 'Wallet signature could not be verified.' });
          return;
        }
      }

      if (address === 'dev') {
        principal = { userId: 'dev' };
      } else if (serverConfig.isProduction && reownWalletIdentityService) {
        try {
          principal = await reownWalletIdentityService.resolveVerifiedWallet(address);
        } catch (error) {
          console.error('[Server] Reown identity persistence failed:', error);
          socket.emit('auth:error', { message: 'Your identity could not be prepared. Please try again.', code: 'IDENTITY_PERSISTENCE_FAILED' });
          return;
        }
      } else {
        // Local compatibility mode until a configured production Supabase
        // service is available. This path never writes user data remotely.
        principal = resolveVerifiedWalletIdentity(address);
      }
    }

    // Now emit the success token to the client so they can save it
    const newToken = generateSessionToken(principal!);
    socket.emit('auth:success', { token: newToken });

    // Switch to new context BEFORE checking entitlement so we don't leak dev state
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
        socket.data.isAuthenticated = false;
        socket.emit('subscription:required', { address });
        return;
      }
      throw err;
    }

    socket.data.isAuthenticated = true;
    socket.join(`user:${principal!.userId}`);
  });

  socket.on('auth:logout', () => {
    // A wallet disconnect must also terminate SERA's socket session. Leaving
    // the socket authenticated would make a shared-device logout misleading.
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
    if (!googleDriveOAuthService || socket.data.sessionId === 'dev') {
      socket.emit('google_drive:error', { message: 'Google Drive connection is not configured for this environment.' });
      return;
    }
    socket.emit('google_drive:authorization', { authorizationUrl: googleDriveOAuthService.beginAuthorization(socket.data.sessionId!) });
  });

  socket.on('google_drive:disconnect', async () => {
    if (!requireAuthenticatedSession(socket, 'google_drive:disconnect', instance?.eventBus)) return;
    if (!googleDriveOAuthService || socket.data.sessionId === 'dev') {
      socket.emit('google_drive:error', { message: 'Google Drive connection is not configured for this environment.' });
      return;
    }
    try {
      socket.emit('google_drive:status', await googleDriveOAuthService.disconnect(socket.data.sessionId!));
    } catch (error) {
      socket.emit('google_drive:error', { message: error instanceof Error ? error.message : 'Unable to disconnect Google Drive.' });
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
    walletLinkChallenge = undefined; // Single-use, regardless of outcome.
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
    } catch (error) {
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
    socket.emit('billing:update', { periods });
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
      socket.emit('billing:update', { periods });

      // Attempt to re-verify entitlement after topup
      try {
        agentManager.checkEntitlement(principalId);
        socket.data.isAuthenticated = true;
        socket.emit('auth:success', { token: generateSessionToken({ userId: principalId, personalWalletAddress: socket.data.personalWalletAddress }) });
      } catch (err) {
        // Still not enough
      }
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('chat:message', (message: string) => {
    if (!requireAuthenticatedSession(socket, 'chat:message', instance?.eventBus)) return;
    socketObservationBuffer = [];
    console.log(`[Server] Received chat:message → dispatching USER_OBSERVATION for ${socket.data.sessionId}`);

    if (serverConfig.allowDevFeatures && serverConfig.demoIntentCommand && message.toLowerCase().trim() === serverConfig.demoIntentCommand) {
      const intentId = `intent-${Date.now()}`;
      instance.runtime.intentStore?.registerIntent({
        id: intentId,
        description: 'Grow Asset Value',
        status: 'ALIVE',
        terminality: 'CONTINUOUS',
        createdAt: Date.now()
      });
      instance.runtime.executeCycle(Date.now()).catch(console.error);
    }

    const event: StandardEvent = {
      id: `evt-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'SocketServer',
      payload: { message },
      timestamp: Date.now(),
    };

    instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);

    instance.chatHistoryStore.appendUiMessage({
      id: event.timestamp,
      role: 'user',
      content: message,
    });
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

  socket.on('automations:fetch', () => {
    if (!requireAuthenticatedSession(socket, 'automations:fetch', instance?.eventBus)) return;
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

  socket.on('governance:approve_task', (payload: { taskId: string }) => {
    if (!requireAuthenticatedSession(socket, 'governance:approve_task', instance?.eventBus)) return;
    if (instance) {
      instance.runtime.executionCoordinator.approveTask(payload.taskId);
    }
  });

  socket.on('governance:reject_task', (payload: { taskId: string }) => {
    if (!requireAuthenticatedSession(socket, 'governance:reject_task', instance?.eventBus)) return;
    if (instance) {
      instance.runtime.executionCoordinator.rejectTask(payload.taskId);
    }
  });

  socket.on('disconnect', () => {
    unbindListeners();
    console.log(`[Server] UI Client disconnected: ${socket.id}`);
  });
});

// ── Slack Socket Mode Bootstrap ───────────────────────────────────────────────
const slackBotToken = process.env.SLACK_BOT_TOKEN;
const slackSocketToken = process.env.SERA_SLACK_SOCKET;

// The Slack Bot exclusively connects to the DEV instance
const devInstance = agentManager.getOrCreateInstance('dev');

if (slackBotToken && slackSocketToken) {
  const boltApp = new BoltApp({
    token: slackBotToken,
    appToken: slackSocketToken,
    socketMode: true,
    logLevel: 'error' as any
  });

  const slackAdapter = new SlackAdapter(boltApp, devInstance.eventBus);
  devInstance.communicationBridge.registerAdapter('slack', slackAdapter);

  boltApp.start()
    .then(() => console.log('[SERA] Slack Socket Mode connected. Routed to DEV instance.'))
    .catch((err: any) => console.error('[SERA] Slack Socket Mode failed to start:', err.message));
} else {
  console.warn('[SERA] SLACK_BOT_TOKEN or SERA_SLACK_SOCKET not set. Slack adapter running in MOCK mode.');
  const slackAdapter = new SlackAdapter(null, devInstance.eventBus);
  devInstance.communicationBridge.registerAdapter('slack', slackAdapter);
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
agentManager.startBillingTick();
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Sera Core Server is running on port ${PORT}`);
  console.log(`   Architecture: Actor Model Router (SeraAgentInstance)\n`);
});

const shutdown = () => {
  console.log('[SERA] Shutting down gracefully.');
  agentManager.shutdownAll();
  io.close();
  httpServer.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

