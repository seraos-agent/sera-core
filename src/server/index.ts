import 'dotenv/config';
import { EventEmitter } from 'events';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

import { DialogueEngine, SERA_EVENTS } from '../capabilities/dialogue/DialogueEngine';
import { chatHistoryStore } from '../capabilities/dialogue/ChatHistoryStore';
import { GoalBridge } from '../runtime/GoalBridge';
import { StandardEvent, EventTypes } from '../core/events/types';
import { TemporalClockService } from '../core/temporal/TemporalClockService';
import { TriggerEngine } from '../core/triggers/TriggerEngine';
import { InMemoryTriggerStore } from '../core/triggers/InMemoryTriggerStore';
import { Runtime } from '../runtime/Runtime';
import { ExecutionDispatcher } from '../runtime/ExecutionDispatcher';

import { observationStore } from '../core/perception/ObservationStore';
import { CognitiveCompressor } from '../core/perception/CognitiveCompressor';
import { AuditLogger } from '../core/telemetry/AuditLogger';
import { ExperienceBuilder } from '../core/memory/ExperienceBuilder';
import { EpisodicSemanticBridge } from '../core/memory/EpisodicSemanticBridge';
import { CapabilityCatalog } from '../core/capabilities/CapabilityCatalog';
import { SeraTool } from '../core/cognitive/Tool';
import { Planner } from '../core/planner/Planner';
import { StrategyStore } from '../core/strategy/StrategyStore';
import { StrategyEngine } from '../core/strategy/StrategyEngine';
import { GoalEngine } from '../core/goals/GoalEngine';
import { AttentionEngine } from '../core/attention/AttentionEngine';
import { MemoryStore } from '../memory/MemoryStore';
import { ExecutionTraceStore } from '../core/execution/ExecutionTraceStore';
import { CoherenceMonitor } from '../core/cognition/CoherenceMonitor';
import { ProposalEvaluator } from '../core/intents/ProposalEvaluator';
import { CalibrationEvaluationEngine } from '../core/cognition/CalibrationEvaluationEngine';
import { GovernanceOutcomeTracker } from '../core/governance/GovernanceOutcomeTracker';
import { GovernanceReflectionEngine } from '../core/governance/GovernanceReflectionEngine';
import { GovernanceCalibrationEngine } from '../core/governance/GovernanceCalibrationEngine';
import { MetaGovernanceReview } from '../core/governance/MetaGovernanceReview';
import { GovernanceCoordinator } from '../core/governance/GovernanceCoordinator';
import { ConstitutionEngine } from '../constitution/ConstitutionEngine';
import { IrreversibleActionRule } from '../constitution/rules/IrreversibleActionRule';
import { DestructiveActionRule } from '../constitution/rules/DestructiveActionRule';
import { UnsafeActionRule } from '../constitution/rules/UnsafeActionRule';
import { SignalArbitrator } from '../core/feedback/SignalArbitrator';
import { MemoryPolicyEngine as EpistemicPolicyEngine } from '../memory/MemoryPolicyEngine';
import { MemoryIngress } from '../core/memory/MemoryIngress';
import { FeedbackPipeline } from '../core/feedback/FeedbackPipeline';
import { IntentEngine } from '../core/intents/IntentEngine';
import { IntentStore } from '../core/intents/IntentStore';
import { ProposalStore } from '../core/intents/ProposalStore';
import { InMemoryMetricsStore } from '../core/telemetry/MetricsStore';
import { MetricsAggregator } from '../core/telemetry/MetricsAggregator';
import { GoalSynthesizer } from '../core/intents/GoalSynthesizer';
import { ProposalGovernance } from '../core/intents/ProposalGovernance';

// Communication Capability
import { CommunicationBridge } from '../capabilities/communication/CommunicationBridge';
import { CommunicationToolCapability } from '../capabilities/communication/CommunicationToolCapability';
import { SlackAdapter } from '../capabilities/communication/adapters/SlackAdapter';
import { App as BoltApp } from '@slack/bolt';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ── MCP Internal REST API ───────────────────────────────────────────────────
// This API is ONLY accessible to the local MCP Server Proxy (localhost)
app.use('/api/mcp', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') {
    return res.status(403).json({ error: 'Access denied: Localhost only' });
  }
  if (!process.env.SERA_MCP_SECRET || authHeader !== `Bearer ${process.env.SERA_MCP_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid SERA_MCP_SECRET' });
  }
  next();
});

// Expose memory for external agents (read-only, confirmed beliefs)
app.get('/api/mcp/memory', (req, res) => {
  const store = (globalThis as any).__memoryStore as import('../memory/MemoryStore').MemoryStore | undefined;
  if (!store) return res.status(503).json({ error: 'MemoryStore not ready' });
  
  const allBeliefs = store.getAllBeliefs();
  const summary = allBeliefs.map(b => `[${b.category}] ${b.key}: ${b.content}`).join('\n');
  res.json({ text: summary });
});

// Propose actions (goes through Governance)
app.post('/api/mcp/proposal', (req, res) => {
  const { action, target, amount, asset, description } = req.body;
  if (!action || !description) return res.status(400).json({ error: 'Missing action or description' });
  
  // Submit via ProposalManager / IntentStore
  // We emit a new Intent so the Cognitive Coordinator evaluates it
  const intentId = `intent-mcp-${Date.now()}`;
  const runtimeInstance = (globalThis as any).__runtime as import('../runtime/Runtime').Runtime | undefined;
  
  if (runtimeInstance && runtimeInstance.intentStore) {
    runtimeInstance.intentStore.registerIntent({
      id: intentId,
      description: `[MCP PROPOSAL] ${action}: ${description} (Target: ${target}, Amount: ${amount} ${asset})`,
      status: 'ALIVE',
      terminality: 'DISCRETE',
      createdAt: Date.now()
    });
    
    // Trigger cycle evaluation
    runtimeInstance.executeCycle(Date.now()).catch(console.error);
    return res.json({ status: 'PROPOSAL_SUBMITTED', intentId });
  } else {
    return res.status(503).json({ error: 'Runtime intentStore not ready' });
  }
});


const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const eventBus = new EventEmitter();

// Core Services

const triggerStore = new InMemoryTriggerStore();
const triggerEngine = new TriggerEngine(triggerStore, eventBus);
const goalBridge = new GoalBridge(eventBus);
const executionDispatcher = new ExecutionDispatcher(eventBus);
const planner = new Planner();
const strategyStore = new StrategyStore();
const strategyEngine = new StrategyEngine(strategyStore);
const goalEngine = new GoalEngine();
const attentionEngine = new AttentionEngine(goalEngine, strategyStore);

const intentStore = new IntentStore();
const proposalStore = new ProposalStore();
const intentEngine = new IntentEngine(intentStore, goalEngine);
const goalSynthesizer = new GoalSynthesizer();
const proposalGovernance = new ProposalGovernance();

const memoryStore = new MemoryStore(eventBus);
const memoryIngress = new MemoryIngress(eventBus, memoryStore);

const executionTraceStore = new ExecutionTraceStore(eventBus);
const coherenceMonitor = new CoherenceMonitor();
const proposalEvaluator = new ProposalEvaluator(memoryStore);
const calibrationEvaluationEngine = new CalibrationEvaluationEngine(memoryStore);
const governanceOutcomeTracker = new GovernanceOutcomeTracker(memoryStore, eventBus);
const governanceReflectionEngine = new GovernanceReflectionEngine(memoryStore, eventBus);
const governanceCalibrationEngine = new GovernanceCalibrationEngine(memoryStore);
const metaGovernanceReview = new MetaGovernanceReview(eventBus);

const governanceCoordinator = new GovernanceCoordinator(
  eventBus,
  governanceOutcomeTracker,
  governanceReflectionEngine,
  calibrationEvaluationEngine,
  governanceCalibrationEngine,
  metaGovernanceReview
);

const constitutionEngine = new ConstitutionEngine();
constitutionEngine.register(new IrreversibleActionRule());
constitutionEngine.register(new DestructiveActionRule());
constitutionEngine.register(new UnsafeActionRule());


const signalArbitrator = new SignalArbitrator();
const epistemicPolicyEngine = new EpistemicPolicyEngine(memoryStore);
const feedbackPipeline = new FeedbackPipeline(signalArbitrator, epistemicPolicyEngine, goalEngine, coherenceMonitor);

const runtime = new Runtime(

  constitutionEngine,
  feedbackPipeline,
  coherenceMonitor,
  calibrationEvaluationEngine,
  executionTraceStore,
  planner,
  strategyStore,
  strategyEngine,
  attentionEngine,
  goalEngine,
  intentEngine,
  intentStore,
  proposalStore,
  goalSynthesizer,
  proposalGovernance,
  proposalEvaluator,
  governanceOutcomeTracker,
  governanceReflectionEngine,
  governanceCalibrationEngine,
  undefined,
  undefined,
  eventBus,
  executionDispatcher,
  memoryStore
);
(globalThis as any).__runtime = runtime;
(globalThis as any).__memoryStore = memoryStore;

runtime.setGlobalEventBus(eventBus);

const temporalClockService = new TemporalClockService(eventBus, 10000);
const cognitiveCompressor = new CognitiveCompressor(eventBus);
const auditLogger = new AuditLogger(eventBus);
const experienceBuilder = new ExperienceBuilder(eventBus);
const episodicSemanticBridge = new EpisodicSemanticBridge(eventBus, memoryStore);

const metricsStore = new InMemoryMetricsStore();
const metricsAggregator = new MetricsAggregator(eventBus, metricsStore);

// Log metrics periodically for internal observability
setInterval(() => {
  const m = metricsStore.getMetrics();
  console.log('\n--- INTERNAL COGNITIVE TELEMETRY ---');
  console.log(`Memory: Verified=${m.memory.verified} | Superseded=${m.memory.superseded} | Invalidated=${m.memory.invalidated}`);
  console.log(`Governance: Reviewed=${m.governance.actionsReviewed} | Allowed=${m.governance.allowed} | Denied=${m.governance.denied} | FalsePositives=${m.governance.falsePositive}`);
  console.log(`Reflection: Patterns=${m.reflection.patternsLearned} | Wrong=${m.reflection.wrongPatterns}`);
  console.log(`Worker: Success=${m.worker.success} | Failure=${m.worker.failure} | WinRate=${(m.worker.goalCompletionRate * 100).toFixed(1)}%`);
  console.log(`Execution: TotalTasks=${m.execution.totalExecuted} | AvgLatency=${m.execution.avgLatencyMs.toFixed(0)}ms`);
  console.log('------------------------------------\n');
}, 30000); // Every 30 seconds

export { runtime };

// Initialize OS Capability Catalog
const catalog = new CapabilityCatalog();
const dummyPingTool: SeraTool = {
  name: 'system_ping',
  description: 'Pings the system to check if it is responsive. Use this when the user asks to ping the system.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Optional message to attach to the ping' }
    }
  }
};
catalog.registerTools([dummyPingTool]);

// Initialize Communication Capability
const communicationBridge = new CommunicationBridge(eventBus);

// ── Slack Socket Mode Bootstrap ───────────────────────────────────────────────
// Architecture: Slack is a sensory + operational interface ONLY.
// The Bolt App is injected into SlackAdapter; Core has zero dependency on Slack.
const slackBotToken = process.env.SLACK_BOT_TOKEN;
const slackSocketToken = process.env.SERA_SLACK_SOCKET;

if (slackBotToken && slackSocketToken) {
  const boltApp = new BoltApp({
    token: slackBotToken,
    appToken: slackSocketToken,
    socketMode: true,
    // Disable default Bolt logging to keep console clean; SERA logs are the authority
    logLevel: 'error' as any
  });

  const slackAdapter = new SlackAdapter(boltApp, eventBus);
  communicationBridge.registerAdapter('slack', slackAdapter);

  // Start Bolt after registering so message listeners are bound before connection opens
  boltApp.start()
    .then(() => console.log('[SERA] Slack Socket Mode connected. Listening for events...'))
    .catch((err: any) => console.error('[SERA] Slack Socket Mode failed to start:', err.message));
} else {
  console.warn('[SERA] SLACK_BOT_TOKEN or SERA_SLACK_SOCKET not set. Slack adapter running in MOCK mode.');
  const slackAdapter = new SlackAdapter(null, eventBus);
  communicationBridge.registerAdapter('slack', slackAdapter);
}

// Expose TriggerEngine to global for GoalBridge to register
(globalThis as any).__triggerEngine = triggerEngine;

// Start Engines
triggerEngine.start();
temporalClockService.start();
governanceCoordinator.start();

let msgIdCounter = Date.now();

eventBus.on(EventTypes.DOMAIN_WALLET_STATE, (event: StandardEvent) => {
  io.emit('wallet:update', event.payload);
});

// ─── Socket.io Bridge (Sensory Layer) ────────────────────────────────────────
// This server is ONLY responsible for:
//   1. EARS: Translating incoming Socket messages → Sera Events
//   2. MOUTH: Translating Sera Events → outgoing Socket messages
// No cognitive logic lives here.

io.on('connection', (socket: Socket) => {
  console.log(`[Server] UI Client connected: ${socket.id}`);

  const walletState = runtime.worldStateService.getWalletState();
  if (walletState && walletState.address) {
    socket.emit('wallet:update', walletState);
  }

  // Send the persisted chat history
  socket.emit('chat:history', chatHistoryStore.getUiMessages());

  // Send the initial observations history
  socket.emit('observations:history', observationStore.getAll());

  // ── EARS: user message → USER_OBSERVATION event ───────────────────────────
  socket.on('chat:message', (message: string) => {
    // Legacy manual observation simulations removed
    console.log(`[Server] Received chat:message → dispatching USER_OBSERVATION`);

    // Phase 4.1 Manual Trigger
    if (message.toLowerCase().trim() === 'sera, evaluasi peluang baru') {
      console.log(`[Server] Manual Trigger for Phase 4.1 detected!`);
      const intentId = `intent-${Date.now()}`;
      runtime.intentStore?.registerIntent({
        id: intentId,
        description: 'Grow Asset Value',
        status: 'ALIVE',
        terminality: 'CONTINUOUS',
        createdAt: Date.now()
      });
      runtime.executeCycle(Date.now()).catch(console.error);
    }

    const event: StandardEvent = {
      id: `evt-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'SocketServer',
      payload: { message },
      timestamp: Date.now(),
    };

    eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);

    chatHistoryStore.appendUiMessage({
      id: event.timestamp,
      role: 'user',
      content: message,
    });
  });

  socket.on('chat:clear', () => {
    console.log(`[Server] Clearing chat history`);
    chatHistoryStore.clear();
    runtime.dialogueEngine.clearHistory();
    // Broadcast clear event to all clients
    io.emit('chat:history', []);
  });

  // ── MOUTH: Sera events → socket messages ─────────────────────────────────

  const onAgentSpeak = (event: StandardEvent) => {
    const msgId = ++msgIdCounter;
    socket.emit('chat:reply', {
      id: msgId,
      content: event.payload.text,
      actionLinks: event.payload.actionLinks,
    });
    chatHistoryStore.appendUiMessage({
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
    // Translate Sera Event → UI command format the React app understands
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
    chatHistoryStore.appendUiMessage({
      id: msgId,
      role: 'agent',
      proposal: proposalData
    });
  };

  eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
  eventBus.on(EventTypes.DIALOGUE_ACTIVITY, onActivity);
  eventBus.on(EventTypes.UI_COMMAND, onUiCommand);
  eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);

  const onGoalResult = (event: StandardEvent) => {
    const result = event.payload;
    const trigger = triggerStore.get(result.requestId);
    if (trigger) {
      trigger.lastExecutionResult = {
        success: result.success,
        errorMessage: result.errorMessage
      };
      triggerStore.save(trigger);
      io.emit('automations:update', triggerStore.getAll());
    }
  };
  eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);

  const onCognitiveObservation = (event: StandardEvent) => {
    observationStore.append(event);
    socket.emit('observations:new', { ...event.payload, timestamp: event.timestamp });
  };
  eventBus.on(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);

  // ── EARS: Proposal Responses ──────────────────────────────────────────────
  socket.on('chat:proposal_response', (data: { proposalId: string; action: 'APPROVE' | 'REJECT'; candidateId?: string }) => {
    const { proposalId, action, candidateId } = data;
    console.log(`[Server] Received proposal response for ${proposalId}: ${action} (candidateId: ${candidateId})`);
    
    const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    chatHistoryStore.updateProposalStatus(proposalId, status);
    
    if (action === 'APPROVE') {
      eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_APPROVED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { proposalId: proposalId, candidateId }
      } as StandardEvent);
    } else {
      eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_REJECTED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { proposalId: proposalId }
      } as StandardEvent);
    }
  });

  // ── EARS: Fetch Automations ──────────────────────────────────────────────
  socket.on('automations:fetch', () => {
    const allTriggers = triggerStore.getAll();
    socket.emit('automations:update', allTriggers);
  });

  socket.on('automations:delete', (id: string) => {
    triggerStore.delete(id);
    io.emit('automations:update', triggerStore.getAll());
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
      // Note: wallet state is already emitted by GoalBridge.directTransfer after TX confirmation
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
    eventBus.off(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);
    console.log(`[Server] UI Client disconnected: ${socket.id}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Sera Core Server is running on port ${PORT}`);
  console.log(`   Architecture: Sensory Layer (Socket.io Bridge) ↔ Event Bus ↔ Dialogue Capability (Qwen)\n`);
});
