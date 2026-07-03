import 'dotenv/config';
import { EventEmitter } from 'events';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

import { DialogueEngine, SERA_EVENTS } from '../capabilities/dialogue/DialogueEngine';
import { GoalBridge } from '../runtime/GoalBridge';
import { Event, EventTypes } from '../core/events/types';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// The shared Event Bus — the nervous system of SERA
const eventBus = new EventEmitter();

// Boot Capabilities & Runtime Bridge (all share the same EventBus)
new DialogueEngine(eventBus);
new GoalBridge(eventBus);

let msgIdCounter = Date.now();
let lastWalletState: any = null;

eventBus.on(EventTypes.WALLET_STATE, (event: Event) => {
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

    const event: Event = {
      id: `evt-${Date.now()}`,
      type: SERA_EVENTS.USER_OBSERVATION,
      payload: { message },
      timestamp: Date.now(),
    };

    eventBus.emit(SERA_EVENTS.USER_OBSERVATION, event);
  });

  // ── MOUTH: SERA events → socket messages ─────────────────────────────────

  const onAgentSpeak = (event: Event) => {
    socket.emit('chat:reply', {
      id: ++msgIdCounter,
      content: event.payload.text,
    });
  };

  const onActivity = (event: Event) => {
    socket.emit('chat:activity', {
      id: ++msgIdCounter,
      content: event.payload.content,
    });
  };

  const onUiCommand = (event: Event) => {
    // Translate SERA Event → UI command format the React app understands
    socket.emit('ui:command', {
      type: 'SET_THEME',
      payload: event.payload.value,
    });
  };

  eventBus.on(SERA_EVENTS.AGENT_SPEAK, onAgentSpeak);
  eventBus.on(SERA_EVENTS.ACTIVITY, onActivity);
  eventBus.on(SERA_EVENTS.UI_COMMAND, onUiCommand);

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
    eventBus.off(SERA_EVENTS.AGENT_SPEAK, onAgentSpeak);
    eventBus.off(SERA_EVENTS.ACTIVITY, onActivity);
    eventBus.off(SERA_EVENTS.UI_COMMAND, onUiCommand);
    console.log(`[Server] UI Client disconnected: ${socket.id}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 SERA Core Server is running on port ${PORT}`);
  console.log(`   Architecture: Sensory Layer (Socket.io Bridge) ↔ Event Bus ↔ Dialogue Capability (Qwen)\n`);
});
