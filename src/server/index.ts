import 'dotenv/config';
import { EventEmitter } from 'events';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

import { DialogueEngine, SERA_EVENTS } from '../capabilities/dialogue/DialogueEngine';
import { GoalBridge } from '../runtime/GoalBridge';
import { StandardEvent, EventTypes } from '../core/events/types';
import { ExecutionEventBus } from '../core/events/ExecutionEventBus';
import { TemporalClockService } from '../core/temporal/TemporalClockService';
import { TriggerEngine } from '../core/triggers/TriggerEngine';
import { InMemoryTriggerStore } from '../core/triggers/InMemoryTriggerStore';
import { Runtime } from '../runtime/Runtime';
import { ExecutionDispatcher } from '../runtime/ExecutionDispatcher';
import { WorkerManager } from '../workers/WorkerManager';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// The shared Event Bus — the nervous system of SERA
const eventBus = new EventEmitter();
const executionEventBus = new ExecutionEventBus();

// Core Services
const workerManager = new WorkerManager();
const triggerStore = new InMemoryTriggerStore();
const triggerEngine = new TriggerEngine(triggerStore, executionEventBus);
const goalBridge = new GoalBridge(eventBus);
const executionDispatcher = new ExecutionDispatcher(executionEventBus, goalBridge);
const runtime = new Runtime(workerManager);
runtime.setEventBus(executionEventBus);
runtime.setExecutionDispatcher(executionDispatcher);
const temporalClockService = new TemporalClockService(executionEventBus);

// Expose TriggerEngine to global for GoalBridge to register
(globalThis as any).__triggerEngine = triggerEngine;

// Start Engines
triggerEngine.start();
temporalClockService.start();

// Boot Capabilities
new DialogueEngine(eventBus);

let msgIdCounter = Date.now();
let lastWalletState: any = null;

eventBus.on(EventTypes.DOMAIN_WALLET_STATE, (event: StandardEvent) => {
  lastWalletState = event.payload;
  io.emit('wallet:update', event.payload);
});

// ─── Socket.io Bridge (Sensory Layer) ────────────────────────────────────────
// This server is ONLY responsible for:
//   1. EARS: Translating incoming Socket messages → SERA Events
//   2. MOUTH: Translating SERA Events → outgoing Socket messages
// No cognitive logic lives here.

io.on('connection', (socket: Socket) => {
  console.log(`[Server] UI Client connected: ${socket.id}`);

  // Send the latest wallet state immediately upon connection
  if (lastWalletState) {
    socket.emit('wallet:update', lastWalletState);
  }

  // ── EARS: user message → USER_OBSERVATION event ───────────────────────────
  socket.on('chat:message', (message: string) => {
    console.log(`[Server] Received chat:message → dispatching USER_OBSERVATION`);

    const event: StandardEvent = {
      id: `evt-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'SocketServer',
      payload: { message },
      timestamp: Date.now(),
    };

    eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);
  });

  // ── MOUTH: SERA events → socket messages ─────────────────────────────────

  const onAgentSpeak = (event: StandardEvent) => {
    socket.emit('chat:reply', {
      id: ++msgIdCounter,
      content: event.payload.text,
    });
  };

  const onActivity = (event: StandardEvent) => {
    socket.emit('chat:activity', {
      id: ++msgIdCounter,
      content: event.payload.content,
    });
  };

  const onUiCommand = (event: StandardEvent) => {
    // Translate SERA Event → UI command format the React app understands
    socket.emit('ui:command', {
      type: 'SET_THEME',
      payload: event.payload.value,
    });
  };

  const onProposalGenerated = (event: StandardEvent) => {
    socket.emit('chat:proposal', {
      id: ++msgIdCounter,
      proposalId: event.payload.proposalId,
      intent: event.payload.intent,
      parameters: event.payload.parameters
    });
  };

  eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
  eventBus.on(EventTypes.DIALOGUE_ACTIVITY, onActivity);
  eventBus.on(EventTypes.UI_COMMAND, onUiCommand);
  eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);

  // ── EARS: Proposal Responses ──────────────────────────────────────────────
  socket.on('chat:proposal_response', (payload: { proposalId: string; action: 'APPROVE' | 'REJECT' }) => {
    console.log(`[Server] Received proposal response for ${payload.proposalId}: ${payload.action}`);
    
    if (payload.action === 'APPROVE') {
      eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_APPROVED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { proposalId: payload.proposalId }
      } as StandardEvent);
    } else {
      eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_REJECTED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { proposalId: payload.proposalId }
      } as StandardEvent);
    }
  });

  // ── EARS: Fetch Automations ──────────────────────────────────────────────
  socket.on('automations:fetch', () => {
    const allTriggers = triggerStore.getAll();
    socket.emit('automations:update', allTriggers);
  });

  // ── EARS: wallet transfer request from UI ────────────────────────────────
  socket.on('wallet:transfer', async (payload: { to: string; amount: string; asset: string }) => {
    console.log(`[Server] wallet:transfer requested → ${payload.amount} ${payload.asset} to ${payload.to}`);
    socket.emit('wallet:transfer:pending', { message: 'Broadcasting transaction...' });

    try {
      const goalBridgeInstance = (globalThis as any).__goalBridge as import('../runtime/GoalBridge').GoalBridge | undefined;
      if (!goalBridgeInstance) {
        socket.emit('wallet:transfer:result', { status: 'FAILED', error: 'Wallet not initialized' });
        return;
      }

      const result = await goalBridgeInstance.directTransfer({
        recipientAddress: payload.to,
        amount: parseFloat(payload.amount),
        asset: payload.asset,
      });

      socket.emit('wallet:transfer:result', result);

      // Refresh wallet balance after transfer
      const updatedBalance = await goalBridgeInstance.refreshBalance();
      if (updatedBalance) {
        io.emit('wallet:update', updatedBalance);
      }
    } catch (err: any) {
      console.error('[Server] wallet:transfer error:', err);
      socket.emit('wallet:transfer:result', { status: 'FAILED', error: err.message || 'Unknown error' });
    }
  });

  socket.on('disconnect', () => {
    // Clean up listeners when client disconnects to prevent memory leaks
    eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
    eventBus.off(EventTypes.DIALOGUE_ACTIVITY, onActivity);
    eventBus.off(EventTypes.UI_COMMAND, onUiCommand);
    eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);
    console.log(`[Server] UI Client disconnected: ${socket.id}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 SERA Core Server is running on port ${PORT}`);
  console.log(`   Architecture: Sensory Layer (Socket.io Bridge) ↔ Event Bus ↔ Dialogue Capability (Qwen)\n`);
});
