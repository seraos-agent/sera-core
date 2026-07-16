import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { isAddress, verifyMessage } from 'viem';
import { randomUUID } from 'crypto';
import { StandardEvent, EventTypes } from '../core/events/types';
import { App as BoltApp } from '@slack/bolt';
import { SlackAdapter } from '../capabilities/communication/adapters/SlackAdapter';
import { agentManager, SubscriptionRequiredError } from './AgentManager';
import { isAllowedOrigin, serverConfig } from './config';
import { requireAuthenticatedSession } from './SessionGuard';
import { createHmac, randomBytes } from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

function generateSessionToken(address: string): string {
  const expiry = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = `${address}:${expiry}`;
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}:${signature}`;
}

function verifySessionToken(token: string): string | null {
  try {
    const [address, expiryStr, signature] = token.split(':');
    if (!address || !expiryStr || !signature) return null;
    if (Date.now() > parseInt(expiryStr)) return null;
    const expectedSig = createHmac('sha256', SESSION_SECRET).update(`${address}:${expiryStr}`).digest('hex');
    if (signature === expectedSig) return address;
    return null;
  } catch {
    return null;
  }
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
  },
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
    socket.emit('chat:history', instance.chatHistoryStore.getUiMessages());
    socket.emit('observations:history', instance.observationStore.getAll());
    socket.emit('automations:update', instance.triggerStore.getAll());
  };

  // Do NOT send initial state or bind listeners upon raw connection!
  // Doing so leaks 'dev' state to users who are reconnecting via Wagmi 
  // before their auth:login completes. Wait for auth:login.

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
    instance.eventBus.on(EventTypes.GOAL_REQUIRES_APPROVAL, (payload: any) => socket.emit('governance:approval_needed', payload));
    instance.eventBus.on(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);
    instance.eventBus.on(EventTypes.DOMAIN_WALLET_STATE, onWalletUpdate);
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
  };

  // Listeners are only bound after successful auth:login.
  
  socket.on('auth:challenge', issueLoginChallenge);

  socket.on('auth:login', async (payload: { address?: string; message?: string; signature?: `0x${string}`; token?: string }) => {
    let address = payload?.address?.toLowerCase();
    
    // Check token authentication
    if (payload.token) {
      const recoveredAddress = verifySessionToken(payload.token);
      if (recoveredAddress && (!address || recoveredAddress === address)) {
        address = recoveredAddress;
      } else {
        socket.emit('auth:error', { message: 'Session expired or invalid. Please sign in again.', code: 'INVALID_TOKEN' });
        return;
      }
    } else {
      address = address || 'dev';
      console.log(`[Server] Received auth:login via signature for user: ${address}`);

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

        const isValidSignature = await verifyMessage({
          address: address as `0x${string}`,
          message: payload.message,
          signature: payload.signature,
        });
        if (!isValidSignature) {
          socket.emit('auth:error', { message: 'Wallet signature could not be verified.' });
          return;
        }
      }
    }

    // Now emit the success token to the client so they can save it
    const newToken = generateSessionToken(address);
    socket.emit('auth:success', { token: newToken });

    // Switch to new context BEFORE checking entitlement so we don't leak dev state
    unbindListeners();
    socket.data.sessionId = address;
    socket.data.loginMessage = undefined;
    instance = agentManager.getOrCreateInstance(address);
    bindListeners();
    sendInitialState();

    try {
      agentManager.checkEntitlement(address);
    } catch (err) {
      if (err instanceof SubscriptionRequiredError) {
        socket.data.isAuthenticated = false;
        socket.emit('subscription:required', { address });
        return;
      }
      throw err;
    }
    
    socket.data.isAuthenticated = true;
  });

  socket.on('billing:fetch', (payload: { address: string }) => {
    if (!socket.data.sessionId || payload.address.toLowerCase() !== socket.data.sessionId) return;
    const address = socket.data.sessionId;
    const periods = agentManager.getSubscriptionService().getRemainingPeriods(address);
    socket.emit('billing:update', { periods });
  });

  socket.on('billing:topup_dev_mock', (payload: { address: string, amountUsdc: number }) => {
    if (!socket.data.sessionId || payload.address.toLowerCase() !== socket.data.sessionId) return;
    if (!serverConfig.allowDevFeatures) {
      socket.emit('billing:error', { message: 'Development billing is disabled.' });
      return;
    }
    const address = payload.address;
    const amountUsdc = payload.amountUsdc;
    console.log(`[Server] Received mock topup for ${address} amount: ${amountUsdc} USDC`);
    try {
      agentManager.getSubscriptionService().recordTopUp(address, amountUsdc);
      const periods = agentManager.getSubscriptionService().getRemainingPeriods(address);
      socket.emit('billing:update', { periods });
      
      // Attempt to re-verify entitlement after topup
      try {
        agentManager.checkEntitlement(address);
        socket.data.isAuthenticated = true;
        socket.emit('auth:success', { token: generateSessionToken(address) });
      } catch (err) {
        // Still not enough
      }
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('chat:message', (message: string) => {
    if (!requireAuthenticatedSession(socket, 'chat:message', instance?.eventBus)) return;
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

