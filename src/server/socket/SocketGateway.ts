import { Server as SocketIOServer, Socket } from 'socket.io';
import { StandardEvent, EventTypes } from '../../core/events/types';
import { SocketGatewayDependencies, SocketSessionContext } from './handlers/types';
import { registerAuthHandlers } from './handlers/AuthSocketHandler';
import { registerChatHandlers } from './handlers/ChatSocketHandler';
import { registerIntegrationHandlers } from './handlers/IntegrationSocketHandler';
import { registerWalletHandlers } from './handlers/WalletSocketHandler';
import { WalletLinkChallenge } from './socketAuth';

export { SocketGatewayDependencies };

let msgIdCounter = Date.now();

/**
 * Main WebSocket gateway connecting Web UI clients to the SERA Core Agent Runtime.
 * Delegates specialized protocol handling to modular sub-handlers (Auth, Chat, Integrations, Wallet).
 */
export function registerSocketGateway(io: SocketIOServer, deps: SocketGatewayDependencies): void {
  const {
    agentManager,
    googleDriveOAuthService,
    threadsOAuthService,
    telegramBotManager,
    whatsAppManager
  } = deps;

  io.on('connection', (socket: Socket) => {
    console.log(`[Server] UI Client connected: ${socket.id}`);

    // By default, connections are unauthenticated and point to 'dev' to prevent null reference errors
    socket.data.sessionId = 'dev';
    socket.data.isAuthenticated = false;

    let instance = agentManager.getOrCreateInstance('dev');
    let walletLinkChallenge: WalletLinkChallenge | undefined;
    let socketObservationBuffer: any[] = [];
    let sessionCognitiveSteps: any[] = [];
    let currentTurnStartTime = Date.now();

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

        void whatsAppManager.getStatus(socket.data.sessionId)
          .then((status) => {
            socket.emit('whatsapp:status', status);
            if (status.status === 'CONNECTED') {
              const inst = agentManager.getOrCreateInstance(socket.data.sessionId!);
              if (inst?.runtime?.capabilityCatalog && !inst.runtime.capabilityCatalog.isConnectorActive('whatsapp')) {
                inst.runtime.capabilityCatalog.activateConnector('whatsapp');
                socket.emit('connector:catalog', inst.runtime.capabilityCatalog.allConnectorSummaries());
              }
            }
          })
          .catch(() => socket.emit('whatsapp:status', { provider: 'WHATSAPP', status: 'UNAVAILABLE' }));
      } else {
        socket.emit('threads:status', { provider: 'THREADS', status: 'UNAVAILABLE' });
        socket.emit('telegram:status', { provider: 'TELEGRAM', status: 'UNAVAILABLE' });
        socket.emit('whatsapp:status', { provider: 'WHATSAPP', status: 'UNAVAILABLE' });
      }
    };

    // ── EventBus Bridge Forwarders ───────────────────────────────────────────
    const onAgentSpeak = (event: any) => {
      const payload = event.payload || event;
      const ctx = payload.responseContext;
      if (ctx && ctx.platform && ctx.platform !== 'ui' && ctx.platform !== 'socket') return;

      const msgId = payload.id || Math.max(Date.now(), msgIdCounter + 1);
      msgIdCounter = Math.max(msgIdCounter, msgId);
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

      socket.emit('chat:reply', replyData);
      socket.emit('chat:activity', null);

      if (socket.data.sessionId && socket.data.sessionId !== 'dev') {
        socket.broadcast.to(`user:${socket.data.sessionId}`).emit('chat:reply', replyData);
        socket.broadcast.to(`user:${socket.data.sessionId}`).emit('chat:activity', null);
      }

      const existingMsgs = instance.chatHistoryStore.getUiMessages();
      const alreadySaved = existingMsgs.some((m: any) => m.id === msgId || (m.role === 'agent' && m.content === payload.text && Math.abs((m.id || 0) - msgId) < 5000));
      if (!alreadySaved) {
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
      if (ctx && ctx.platform && ctx.platform !== 'ui' && ctx.platform !== 'socket') return;

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

      socket.emit('chat:activity', activityData);
      if (socket.data.sessionId && socket.data.sessionId !== 'dev') {
        socket.broadcast.to(`user:${socket.data.sessionId}`).emit('chat:activity', activityData);
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
      const ctx = payload.responseContext || payload.parameters?._responseContext || payload.parameters?.responseContext;
      if (ctx && ctx.platform && ctx.platform !== 'ui' && ctx.platform !== 'socket') return;

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

    const context: SocketSessionContext = {
      socket,
      deps,
      getInstance: () => instance,
      setInstance: (newInstance) => { instance = newInstance; },
      sendInitialState,
      bindListeners,
      unbindListeners,
      getWalletLinkChallenge: () => walletLinkChallenge,
      setWalletLinkChallenge: (ch) => { walletLinkChallenge = ch; },
      getSocketObservationBuffer: () => socketObservationBuffer,
      clearSocketObservationBuffer: () => { socketObservationBuffer = []; },
      getSessionCognitiveSteps: () => sessionCognitiveSteps,
      setSessionCognitiveSteps: (steps) => { sessionCognitiveSteps = steps; },
      getCurrentTurnStartTime: () => currentTurnStartTime,
      setCurrentTurnStartTime: (time) => { currentTurnStartTime = time; },
      getNextMsgId: () => ++msgIdCounter,
      updateMsgIdCounter: (id) => { msgIdCounter = Math.max(msgIdCounter, id); }
    };

    // Register modular domain socket handlers
    registerAuthHandlers(context);
    registerChatHandlers(context);
    registerIntegrationHandlers(context);
    registerWalletHandlers(context);

    socket.on('disconnect', () => {
      console.log(`[Server] UI Client disconnected: ${socket.id}`);
      unbindListeners();
    });
  });
}
