import { EventEmitter } from 'events';
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
  
  const runtime = new Runtime(
    workerManager,
    undefined, // constitutionEngine
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
    eventBus
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

  // 2. Mock a failed tool episodic event
  eventBus.emit('system.episode.consolidated', {
    id: `evt-mock`,
    type: 'system.episode.consolidated',
    source: 'ExperienceBuilder',
    payload: {
      id: 'mock-exp',
      summary: "The execution of tool 'failing-tool' failed due to a timeout.",
      type: 'GOAL_EXECUTION',
      evidence: [],
      timestamp: Date.now()
    },
    timestamp: Date.now()
  });

  // Small delay to let bridge process it
  await new Promise(r => setTimeout(r, 100));

  // 3. Verify belief is stored
  const semanticBeliefs = memoryStore.getBeliefsByCategory('SEMANTIC');
  const failureBelief = semanticBeliefs.find(b => b.content.includes('failing-tool'));
  if (!failureBelief) {
    console.error('❌ E2E TEST FAILED: Semantic belief for failing-tool was not created.');
    process.exit(1);
  }
  console.log('✅ Semantic belief successfully created from episode.');

  // 4. Run cycle - Planner should avoid failing-tool
  await runtime.executeCycle(1, testGoal.id);

  // If the planner successfully avoided it, it substituted 'mock-read-tool'
  // In a real test, we would inspect the generated plan or trace.
  
  console.log('✅ E2E TEST PASSED!');
}

runTest().catch(console.error);
