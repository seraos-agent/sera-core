import { Runtime } from './runtime/Runtime';
import { WorkerManager } from './workers/WorkerManager';
import { ToolWorker } from './workers/ToolWorker';
import { ToolRegistry } from './tools/ToolRegistry';
import { ToolRuntime } from './tools/ToolRuntime';
import { VerificationService } from './tools/VerificationService';
import { MockReadTool } from './tools/MockReadTool';
import { Goal } from './core/goals/types';
import { ConstitutionEngine } from './constitution/ConstitutionEngine';
import { TreasuryService } from './treasury/TreasuryService';
import { PaymentAuthorityService } from './treasury/PaymentAuthorityService';
import { DelegationScope } from './delegation/types';
import { MemoryStore } from './memory/MemoryStore';
import { GoalEngine } from './core/goals/GoalEngine';
import { FeedbackPipeline } from './core/feedback/FeedbackPipeline';
import { CoherenceMonitor } from './core/cognition/CoherenceMonitor';
import { SignalArbitrator } from './core/feedback/SignalArbitrator';
import { MemoryPolicyEngine } from './memory/MemoryPolicyEngine';
import { MetaEvaluationHistory } from './core/meta/MetaEvaluationHistory';
import { MetaEvaluationEngine } from './core/meta/MetaEvaluationEngine';
import { ExecutionTraceStore } from './core/execution/ExecutionTraceStore';

import { CognitiveQueryService } from './core/reflection/CognitiveQueryService';
import { PatternExtractor } from './core/reflection/PatternExtractor';
import { ReflectionEngine } from './core/reflection/ReflectionEngine';
import { ReflectionProposalProcessor } from './core/reflection/ReflectionProposalProcessor';
import { ReflectionScheduler } from './core/reflection/ReflectionScheduler';

// Mock Tool that always fails
class MockFailTool extends MockReadTool {
  id = 'mock-fail-tool';
  async execute(input: any): Promise<any> {
    throw new Error('Simulated tool failure');
  }
}

async function main() {
  console.log('=== SERA Core - Phase 3.0: Controlled Reflection Engine Demo ===\n');

  // 1. Core Infrastructure
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new MockFailTool());
  
  const toolRuntime = new ToolRuntime(toolRegistry);
  const verificationService = new VerificationService();

  const workerManager = new WorkerManager();
  workerManager.register(new ToolWorker('demo-worker', toolRuntime, verificationService));

  // 2. Cognitive Substrate
  const memoryStore = new MemoryStore();
  const traceStore = new ExecutionTraceStore();
  const metaHistory = new MetaEvaluationHistory();
  
  const goalEngine = new GoalEngine();
  const memoryPolicyEngine = new MemoryPolicyEngine(memoryStore);
  const arbitrator = new SignalArbitrator();
  const coherenceMonitor = new CoherenceMonitor();
  const feedbackPipeline = new FeedbackPipeline(arbitrator, memoryPolicyEngine, goalEngine, coherenceMonitor);
  const metaEvaluationEngine = new MetaEvaluationEngine(
    memoryStore,
    goalEngine,
    arbitrator,
    coherenceMonitor,
    metaHistory
  );

  // 3. Phase 3.0: Reflection Layer
  const queryService = new CognitiveQueryService(memoryStore, traceStore, metaHistory);
  const patternExtractor = new PatternExtractor();
  const reflectionEngine = new ReflectionEngine(queryService, patternExtractor);
  const reflectionProcessor = new ReflectionProposalProcessor(memoryPolicyEngine);
  const reflectionScheduler = new ReflectionScheduler(reflectionEngine, reflectionProcessor);

  // 4. Runtime
  const runtime = new Runtime(
    workerManager,
    new ConstitutionEngine(),
    new TreasuryService(),
    new PaymentAuthorityService(),
    feedbackPipeline,
    coherenceMonitor,
    metaEvaluationEngine,
    traceStore,
    reflectionScheduler
  );

  const allowedScope: DelegationScope = {
    id: 'scope-admin',
    principalId: 'user-1',
    allowedPermissions: [{ action: 'execute_work_item' }],
    requiresApprovalPermissions: []
  };

  console.log('--- Inducing Repeated Failures (Cycles 1-5) ---');
  for (let i = 1; i <= 5; i++) {
    const goal: Goal = {
      id: `g-fail-${i}`,
      description: `Task ${i}`,
      targetState: { toolId: 'mock-fail-tool' },
      status: 'PENDING',
      priority: 0.8,
      stabilityIndex: 1.0,
      createdAt: Date.now()
    };
    goalEngine.registerGoal(goal);
    await runtime.processGoal(goal, allowedScope, 'execute_work_item');
  }

  console.log('\n--- Final System State ---');
  const beliefs = memoryStore.getAllBeliefs();
  console.log(`Total Beliefs: ${beliefs.length}`);
  beliefs.forEach(b => {
    console.log(`- [${b.epistemicStatus}] ${b.content} (Conf: ${b.confidence.toFixed(2)})`);
  });

  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);
