import { EventEmitter } from 'events';
import { ConstitutionEngine } from '../src/constitution/ConstitutionEngine';
import { Runtime } from '../src/runtime/Runtime';
import { WorkerManager } from '../src/workers/WorkerManager';
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
  const workerManager = new WorkerManager();
  
  const memoryStore = new MemoryStore();
  const planner = new Planner();
  const strategyStore = new StrategyStore();
  const strategyEngine = new StrategyEngine(strategyStore);
  const goalEngine = new GoalEngine();
  const attentionEngine = new AttentionEngine(goalEngine, strategyStore);
  
  const constitutionEngine = new ConstitutionEngine();
  
  const runtime = new Runtime(
    workerManager,
    constitutionEngine, // constitutionEngine
    undefined, // feedbackPipeline
    undefined, // coherenceMonitor
    undefined, // metaEvaluation
    undefined, // executionTraceStore
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

  // Spy on WorkerManager to verify which tool was actually dispatched
  let dispatchedTool = '';
  const originalDispatch = workerManager.dispatch.bind(workerManager);
  workerManager.dispatch = async (workItem: any) => {
    if (workItem.payload?.toolId) {
      dispatchedTool = workItem.payload.toolId;
    }
    return { status: 'SUCCESS', result: {}, events: [] };
  };

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

  // Assertion: Check if the planner substituted the failing-tool
  if (dispatchedTool !== 'mock-read-tool') {
    console.error(`❌ E2E TEST FAILED: Planner dispatched '${dispatchedTool}' instead of fallback 'mock-read-tool'`);
    process.exit(1);
  }
  console.log('✅ Planner successfully substituted failing-tool with mock-read-tool.');

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

  console.log('✅ E2E TEST PASSED!');
}

runTest().catch(console.error);
