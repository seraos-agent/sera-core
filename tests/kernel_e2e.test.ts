import { EventEmitter } from 'events';
import { ConstitutionEngine } from '../src/constitution/ConstitutionEngine';
import { Runtime } from '../src/runtime/Runtime';
import { ExecutionTraceStore } from '../src/core/execution/ExecutionTraceStore';

import { MemoryStore } from '../src/memory/MemoryStore';
import { Planner } from '../src/core/planner/Planner';
import { StrategyStore } from '../src/core/strategy/StrategyStore';
import { StrategyEngine } from '../src/core/strategy/StrategyEngine';
import { GoalEngine } from '../src/core/goals/GoalEngine';
import { AttentionEngine } from '../src/core/attention/AttentionEngine';
import { ExperienceBuilder } from '../src/core/memory/ExperienceBuilder';
import { EpisodicSemanticBridge } from '../src/core/memory/EpisodicSemanticBridge';
import { Goal } from '../src/core/goals/types';

async function runTest() {
  console.log('--- Starting Kernel E2E Integration Test ---');
  
  const eventBus = new EventEmitter();

  const memoryStore = new MemoryStore();
  const planner = new Planner();
  const strategyStore = new StrategyStore();
  const strategyEngine = new StrategyEngine(strategyStore);
  const goalEngine = new GoalEngine();
  const attentionEngine = new AttentionEngine(goalEngine, strategyStore);
  
  const constitutionEngine = new ConstitutionEngine();
  
  const runtime = new Runtime(
    constitutionEngine, // constitutionEngine
    undefined, // feedbackPipeline
    undefined, // coherenceMonitor
    undefined, // metaEvaluation
    new ExecutionTraceStore(eventBus), // executionTraceStore
    planner,
    strategyStore,
    strategyEngine,
    attentionEngine,
    goalEngine,
    undefined, // intentEngine
    undefined, // intentStore
    undefined, // proposalStore
    undefined, // goalSynthesizer
    undefined, // proposalGovernance
    undefined, // proposalEvaluator
    undefined, // governanceOutcomeTracker
    undefined, // governanceReflectionEngine
    undefined, // governanceCalibrationEngine
    undefined, // adaptationPlanner
    undefined, // adaptationExecutor
    eventBus,
    undefined, // dispatcher
    memoryStore
  );

  // Initialize bridges
  const expBuilder = new ExperienceBuilder(eventBus);
  const semanticBridge = new EpisodicSemanticBridge(eventBus, memoryStore);

  // 1. Manually add a goal that uses a failing tool
  const testGoal: Goal = {
    id: 'goal-test-1',
    description: 'Use the mock tool to demonstrate failure',
    priority: 1.0,
    status: 'PENDING',
    stabilityIndex: 1.0,
    createdAt: Date.now(),
    targetState: { toolId: 'failing-tool' }
  };
  goalEngine.registerGoal(testGoal);

  // Mock GoalBridge / Capability execution by listening to eventBus
  let dispatchedTool = '';
  eventBus.on('domain.action.dispatched', (event: any) => {
    if (event.payload?.actionPayload?.toolId) {
      dispatchedTool = event.payload.actionPayload.toolId;
    }
    
    // Simulate async execution and response
    setTimeout(() => {
      eventBus.emit('domain.goal.result', {
        id: `evt-res-${Date.now()}`,
        type: 'domain.goal.result',
        source: 'MockGoalBridge',
        correlationId: event.payload.context.triggerId,
        payload: {
          requestId: event.payload.context.triggerId,
          success: true,
          data: {},
        },
        timestamp: Date.now()
      });
    }, 10);
  });

  // 2. Mock a failed tool episodic event 3 times to make it CONFIRMED
  for (let i = 0; i < 3; i++) {
    eventBus.emit('system.episode.consolidated', {
      id: `evt-mock-${i}`,
      type: 'system.episode.consolidated',
      source: 'ExperienceBuilder',
      payload: {
        id: `mock-exp-${i}`,
        summary: "The execution of tool 'failing-tool' failed due to a timeout.",
        type: 'GOAL_EXECUTION',
        evidence: [],
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });
  }

  // Small delay to let bridge process it
  await new Promise(r => setTimeout(r, 100));

  // 3. Verify belief is stored and CONFIRMED
  const semanticBeliefs = memoryStore.getBeliefsByCategory('SEMANTIC');
  const failureBelief = semanticBeliefs.find(b => b.content.includes('failing-tool'));
  if (!failureBelief || failureBelief.epistemicStatus !== 'CONFIRMED') {
    console.error('❌ E2E TEST FAILED: Semantic belief for failing-tool was not created or not CONFIRMED.');
    process.exit(1);
  }
  console.log('✅ Semantic belief successfully created and CONFIRMED from episodes.');

  // 4. Run cycle - Planner should avoid failing-tool
  await runtime.executeCycle(1, testGoal.id);

  // Small delay to let async scheduler process the queued task
  await new Promise(r => setTimeout(r, 100));

  // Assertion: Check if the planner substituted the failing-tool
  if (dispatchedTool !== 'mock-read-tool') {
    console.error(`❌ E2E TEST FAILED: Planner dispatched '${dispatchedTool}' instead of fallback 'mock-read-tool'`);
    process.exit(1);
  }
  console.log('✅ Planner successfully substituted failing-tool with mock-read-tool.');

  // Check ExecutionTraceStore observability
  console.log('--- Testing Execution Observability (Phase 3) ---');
  const traceStore = runtime['executionCoordinator']['executionTraceStore'];
  if (!traceStore) {
    console.error('❌ E2E TEST FAILED: ExecutionTraceStore not initialized in coordinator.');
    process.exit(1);
  }
  
  const allTraces = traceStore.getAll();
  if (allTraces.length === 0) {
    console.error('❌ E2E TEST FAILED: No execution trace was stored.');
    process.exit(1);
  }

  const trace = allTraces[0];
  if (trace.timeline.length < 2) {
    console.error('❌ E2E TEST FAILED: Trace timeline was not populated by events.');
    process.exit(1);
  }
  
  if (trace.finalOutcome !== 'SUCCESS') {
    console.error(`❌ E2E TEST FAILED: Trace finalOutcome is ${trace.finalOutcome}, expected SUCCESS.`);
    process.exit(1);
  }
  
  console.log('✅ ExecutionTraceStore successfully tracked timeline and outcome via events.');

  // 4b. Test Adaptive Execution (Phase 4)
  console.log('--- Testing Adaptive Execution (Phase 4) ---');
  // Simulate 3 FAILED traces for 'fragile-tool' to trigger REPEATED_FAILURE adaptation
  for (let i = 0; i < 3; i++) {
    traceStore.store({
      id: `trace-fragile-${i}`,
      taskId: `task-fragile-${i}`,
      goalId: 'dummy-goal',
      toolCalls: ['fragile-tool'],
      workerAssignments: [],
      intermediateResults: [],
      failures: [],
      costTracking: 0,
      finalOutcome: 'FAILED',
      verificationResult: false,
      settlementStatus: 'NONE',
      timeline: [],
      decisionSnapshots: [],
      intentSnapshot: {},
      plan: {},
      createdAt: Date.now()
    });
  }

  // Run the reflection engine explicitly
  runtime['executionReflectionEngine']?.evaluate();
  
  // Verify adaptation belief was created
  const adaptations = memoryStore.getBeliefsByCategory('EXECUTION_POLICY_ADAPTATION');
  const fragileAdaptation = adaptations.find(b => b.key === 'adaptation:fragile-tool');
  
  if (!fragileAdaptation) {
    console.error('❌ E2E TEST FAILED: ExecutionReflectionEngine failed to create adaptation for fragile-tool.');
    process.exit(1);
  }

  const parsedAdaptation = JSON.parse(fragileAdaptation.content);
  if (parsedAdaptation.policy?.retry?.maxRetries !== 0) {
    console.error('❌ E2E TEST FAILED: Adaptation did not reduce maxRetries to 0 for fragile-tool.');
    process.exit(1);
  }

  console.log('✅ ExecutionReflectionEngine successfully created adaptive policy based on trace anomalies.');

  // 5. Test wallet mutation rejection
  console.log('--- Testing Wallet Mutation Policy ---');
  const walletBelief: any = {
    id: 'wallet-test',
    category: 'STATE',
    key: 'wallet.address',
    content: { address: '0x123' },
    epistemicStatus: 'CONFIRMED',
    confidence: 1.0,
    evidenceIds: [],
    contradictionIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  try {
    memoryStore.storeBelief(walletBelief);
    console.error('❌ E2E TEST FAILED: wallet mutation was not rejected by policy.');
    process.exit(1);
  } catch (e: any) {
    if (e.message.includes('rejected storage of wallet.address')) {
      console.log('✅ Wallet mutation correctly rejected by policy engine.');
    } else {
      console.error('❌ E2E TEST FAILED with unknown error:', e);
      process.exit(1);
    }
  }

  // 6. Test DialogueEngine Memory Injection
  console.log('--- Testing DialogueEngine Memory Injection ---');
  runtime.setGlobalEventBus(eventBus); // Initialize dialogueEngine
  
  const messages = (runtime.dialogueEngine as any).buildWorkingMemory();
  const systemMsg = messages.find((m: any) => m.content.includes('[COGNITIVE STATE (WORKING MEMORY)]'));
  
  if (!systemMsg) {
    console.error('❌ E2E TEST FAILED: System message containing cognitive state not found.');
    process.exit(1);
  }
  
  if (!systemMsg.content.includes('failing-tool')) {
    console.error('❌ E2E TEST FAILED: DialogueEngine did not inject CONFIRMED belief into working memory.');
    process.exit(1);
  }

  if (systemMsg.content.includes('wallet.address') || systemMsg.content.includes('0x123')) {
    console.error('❌ E2E TEST FAILED: DialogueEngine inadvertently injected wallet key into working memory.');
    process.exit(1);
  }
  
  console.log('✅ DialogueEngine successfully injected semantic memory while excluding protected keys.');



  console.log('✅ E2E TEST PASSED!');
}

runTest().catch(console.error);
