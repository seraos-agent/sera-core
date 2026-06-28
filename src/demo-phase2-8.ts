import { Runtime } from './runtime/Runtime';
import { Goal } from './core/goals/types';
import { GoalEngine } from './core/goals/GoalEngine';
import { DelegationScope } from './delegation/types';
import { WorkerManager } from './workers/WorkerManager';
import { ToolWorker } from './workers/ToolWorker';
import { ToolRegistry } from './tools/ToolRegistry';
import { ToolRuntime } from './tools/ToolRuntime';
import { VerificationService } from './tools/VerificationService';
import { MockReadTool } from './tools/MockReadTool';
import { MockFailVerificationTool } from './tools/MockFailVerificationTool';
import { ConstitutionEngine } from './constitution/ConstitutionEngine';
import { TreasuryService } from './treasury/TreasuryService';
import { PaymentAuthorityService } from './treasury/PaymentAuthorityService';
import { MemoryStore } from './memory/MemoryStore';
import { MemoryPolicyEngine } from './memory/MemoryPolicyEngine';
import { FeedbackPipeline } from './core/feedback/FeedbackPipeline';
import { SignalArbitrator } from './core/feedback/SignalArbitrator';
import { CoherenceMonitor } from './core/cognition/CoherenceMonitor';
import { MetaEvaluationEngine } from './core/meta/MetaEvaluationEngine';

async function main() {
  console.log('=== SERA Core - Stage 2.8: Meta-Evaluation Layer Demo ===\n');

  // Setup Tools & Workers
  const registry = new ToolRegistry();
  registry.register(new MockReadTool());
  registry.register(new MockFailVerificationTool());
  const toolRuntime = new ToolRuntime(registry);
  const verificationService = new VerificationService();
  const workerManager = new WorkerManager();
  workerManager.register(new ToolWorker('demo-worker', toolRuntime, verificationService));

  // Setup Cognition Layer
  const memoryStore = new MemoryStore();
  const memoryPolicyEngine = new MemoryPolicyEngine(memoryStore);
  const goalEngine = new GoalEngine();
  const coherenceMonitor = new CoherenceMonitor();
  const arbitrator = new SignalArbitrator();
  const feedbackPipeline = new FeedbackPipeline(arbitrator, memoryPolicyEngine, goalEngine, coherenceMonitor);
  const metaEvaluationEngine = new MetaEvaluationEngine();

  // Setup Runtime
  const runtime = new Runtime(
    workerManager,
    new ConstitutionEngine(),
    new TreasuryService(),
    new PaymentAuthorityService(),
    feedbackPipeline,
    coherenceMonitor,
    metaEvaluationEngine
  );

  const allowedScope: DelegationScope = {
    id: 'scope-allowed',
    principalId: 'user-1',
    allowedPermissions: [{ action: 'execute_work_item' }],
    requiresApprovalPermissions: [],
  };

  const createSuccessGoal = (i: number): Goal => ({
    id: `g-succ-${i}`,
    description: `Success Task ${i}`,
    targetState: { toolId: 'mock-read-tool' },
    status: 'PENDING',
    priority: 1.0,
    stabilityIndex: 1.0,
    createdAt: Date.now()
  });

  const createFailGoal = (i: number): Goal => ({
    id: `g-fail-${i}`,
    description: `Fail Task ${i}`,
    targetState: { toolId: 'mock-fail-verification-tool' },
    status: 'PENDING',
    priority: 1.0,
    stabilityIndex: 1.0,
    createdAt: Date.now()
  });

  console.log('--- Phase A: Steady State (Cycles 1-3) ---');
  for (let i = 1; i <= 3; i++) {
    const goal = createSuccessGoal(i);
    goalEngine.registerGoal(goal);
    await runtime.processGoal(goal, allowedScope, 'execute_work_item');
  }
  // Trigger Eval 1
  runtime.triggerMetaEvaluation(memoryStore, goalEngine, arbitrator);

  console.log('\n--- Phase B: Cognitive Drift (Cycles 4-6) ---');
  for (let i = 4; i <= 6; i++) {
    const goal = createFailGoal(i);
    goalEngine.registerGoal(goal);
    await runtime.processGoal(goal, allowedScope, 'execute_work_item');
  }
  // Trigger Eval 2
  runtime.triggerMetaEvaluation(memoryStore, goalEngine, arbitrator);

  console.log('\n--- Final System State ---');
  console.log(`System Coherence Score: ${coherenceMonitor.getState().score.toFixed(2)}`);
  console.log(`Is Exploration Restricted?: ${!coherenceMonitor.getState().explorationMode}`);
  
  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);
