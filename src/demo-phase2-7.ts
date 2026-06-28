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
import { AttentionRebalancer } from './core/attention/AttentionRebalancer';

async function main() {
  console.log('=== SERA Core - Stage 2.7: Closed-Loop Cognition Demo ===\n');

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
  const attentionRebalancer = new AttentionRebalancer();

  // Setup Runtime
  const runtime = new Runtime(
    workerManager,
    new ConstitutionEngine(),
    new TreasuryService(),
    new PaymentAuthorityService(),
    feedbackPipeline,
    coherenceMonitor
  );

  const allowedScope: DelegationScope = {
    id: 'scope-allowed',
    principalId: 'user-1',
    allowedPermissions: [{ action: 'execute_work_item' }],
    requiresApprovalPermissions: [],
  };

  const goal1: Goal = {
    id: `g1`,
    description: 'Successful Task',
    targetState: { toolId: 'mock-read-tool' },
    status: 'PENDING',
    priority: 1.0,
    stabilityIndex: 1.0,
    createdAt: Date.now()
  };
  
  const goal2: Goal = {
    id: `g2`,
    description: 'Failing Task (Verification Mismatch)',
    targetState: { toolId: 'mock-fail-verification-tool' },
    status: 'PENDING',
    priority: 1.0,
    stabilityIndex: 1.0,
    createdAt: Date.now()
  };

  goalEngine.registerGoal(goal1);
  goalEngine.registerGoal(goal2);

  console.log('--- Phase A: Execution and Trace Routing (Success) ---');
  let queue = attentionRebalancer.prioritize(goalEngine.getAllGoals(), memoryStore);
  console.log(`Current Top Priority Goal: ${queue[0].description} (Priority: ${queue[0].priority.toFixed(2)})`);
  
  await runtime.processGoal(queue[0], allowedScope, 'execute_work_item');

  console.log('\n--- Phase B: Execution and Trace Routing (Failure) ---');
  // Re-prioritize to fetch next pending goal
  queue = attentionRebalancer.prioritize(goalEngine.getAllGoals().filter(g => g.status === 'PENDING'), memoryStore);
  console.log(`Current Top Priority Goal: ${queue[0].description} (Priority: ${queue[0].priority.toFixed(2)})`);
  
  await runtime.processGoal(queue[0], allowedScope, 'execute_work_item');

  console.log('\n--- Phase C: Repeated Failure & Adaptive Arbitration ---');
  // We manually reset goal2 status to run it again to trigger learning
  goalEngine.updateStatus('g2', 'PENDING');
  queue = attentionRebalancer.prioritize(goalEngine.getAllGoals().filter(g => g.status === 'PENDING'), memoryStore);
  await runtime.processGoal(queue[0], allowedScope, 'execute_work_item');

  console.log('\n--- Final System State ---');
  console.log(`System Coherence Score: ${coherenceMonitor.getState().score.toFixed(2)}`);
  console.log(`Is Exploration Restricted?: ${!coherenceMonitor.getState().explorationMode}`);
  
  console.log('\nGoal Engine State:');
  goalEngine.getAllGoals().forEach(g => {
    console.log(`- ${g.id} | Priority: ${g.priority.toFixed(2)} | Stability: ${g.stabilityIndex.toFixed(2)} | Status: ${g.status}`);
  });
  
  console.log('\nMemory Policy Engine Beliefs:');
  memoryStore.getAllBeliefs().forEach(b => {
    console.log(`- ${b.content} | EpistemicStatus: ${b.epistemicStatus} | Confidence: ${b.confidence.toFixed(2)}`);
  });

  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);
