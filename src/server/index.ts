import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { StandardEvent, EventTypes } from '../core/events/types';
import { App as BoltApp } from '@slack/bolt';
import { SlackAdapter } from '../capabilities/communication/adapters/SlackAdapter';
import { agentManager } from './AgentManager';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

let msgIdCounter = Date.now();

// ─── Socket.io Bridge (Sensory Layer) ────────────────────────────────────────
io.on('connection', (socket: Socket) => {
  console.log(`[Server] UI Client connected: ${socket.id}`);
  
  // By default, connect to dev context until auth:login occurs
  socket.data.sessionId = 'dev';
  let instance = agentManager.getOrCreateInstance('dev');

  const sendInitialState = () => {
    const walletState = instance.worldStateService.getWalletState();
    if (walletState && walletState.address) {
      socket.emit('wallet:update', walletState);
    }
    socket.emit('chat:history', instance.chatHistoryStore.getUiMessages());
    socket.emit('observations:history', instance.observationStore.getAll());
    socket.emit('automations:update', instance.triggerStore.getAll());
  };

  sendInitialState();

  // Socket-specific listener references to allow proper unbinding
  const onAgentSpeak = (event: StandardEvent) => {
    const msgId = ++msgIdCounter;
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
      proposal: proposalData
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
    socket.emit('observations:new', { ...event.payload, timestamp: event.timestamp });
  };

  const onWalletUpdate = (event: StandardEvent) => {
    socket.emit('wallet:update', event.payload);
  };

  const bindListeners = () => {
    instance.eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
    instance.eventBus.on(EventTypes.DIALOGUE_ACTIVITY, onActivity);
    instance.eventBus.on(EventTypes.UI_COMMAND, onUiCommand);
    instance.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);
    instance.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);
    instance.eventBus.on(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);
    instance.eventBus.on(EventTypes.DOMAIN_WALLET_STATE, onWalletUpdate);
  };

  const unbindListeners = () => {
    instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
    instance.eventBus.off(EventTypes.DIALOGUE_ACTIVITY, onActivity);
    instance.eventBus.off(EventTypes.UI_COMMAND, onUiCommand);
    instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);
    instance.eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);
    instance.eventBus.off(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);
    instance.eventBus.off(EventTypes.DOMAIN_WALLET_STATE, onWalletUpdate);
  };

  bindListeners();

  socket.on('auth:login', async (payload: { address?: string }) => {
    const address = payload?.address || 'dev';
    console.log(`[Server] Received auth:login for user: ${address}`);
    
    // Switch to new context
    unbindListeners();
    socket.data.sessionId = address;
    instance = agentManager.getOrCreateInstance(address);
    bindListeners();

    sendInitialState();
  });

  socket.on('chat:message', (message: string) => {
    console.log(`[Server] Received chat:message → dispatching USER_OBSERVATION for ${socket.data.sessionId}`);

    if (message.toLowerCase().trim() === 'sera, evaluasi peluang baru') {
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
    console.log(`[Server] Clearing chat history for ${socket.data.sessionId}`);
    instance.chatHistoryStore.clear();
    instance.runtime.dialogueEngine.clearHistory();
    socket.emit('chat:history', []);
  });

  socket.on('chat:cancel', () => {
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
    socket.emit('automations:update', instance.triggerStore.getAll());
  });

  socket.on('automations:delete', (id: string) => {
    instance.triggerStore.delete(id);
    socket.emit('automations:update', instance.triggerStore.getAll());
  });

  socket.on('wallet:transfer', async (payload: { to: string; amount: string; asset: string }) => {
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
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Sera Core Server is running on port ${PORT}`);
  console.log(`   Architecture: Actor Model Router (SeraAgentInstance)\n`);
});
