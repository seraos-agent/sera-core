import { Runtime } from './runtime/Runtime';
import { Goal } from './core/goals/types';
import { DelegationScope } from './delegation/types';
import { WorkerManager } from './workers/WorkerManager';
import { ToolWorker } from './workers/ToolWorker';
import { ToolRegistry } from './tools/ToolRegistry';
import { ToolRuntime } from './tools/ToolRuntime';
import { VerificationService } from './tools/VerificationService';
import { MockReadTool } from './tools/MockReadTool';

async function main() {
  console.log('=== SERA Core - Stage 2.3: Tool Runtime Demo ===');
  
  // 1. Setup Tool Layer
  const registry = new ToolRegistry();
  registry.register(new MockReadTool());
  const toolRuntime = new ToolRuntime(registry);
  const verificationService = new VerificationService();

  // 2. Setup Execution Layer (Workers)
  const workerManager = new WorkerManager();
  const worker = new ToolWorker('demo-tool-worker', toolRuntime, verificationService);
  workerManager.register(worker);

  // 3. Setup Decision Layer (Runtime)
  const runtime = new Runtime(workerManager);
  
  const principalId = 'user-999';

  const goal: Goal = {
    id: `goal-${Date.now()}`,
    description: 'Execute a delegated task via Tool Runtime',
    targetState: { readTaskCompleted: true },
    status: 'PENDING',
    priority: 1.0,
    stabilityIndex: 1.0,
    createdAt: Date.now()
  };

  const allowedScope: DelegationScope = {
    id: 'scope-tool-runtime',
    principalId,
    allowedPermissions: [{ action: 'execute_work_item' }],
    requiresApprovalPermissions: [],
  };

  console.log('\n--- Test: Tool Execution with Verification ---');
  await runtime.processGoal(goal, allowedScope);

  console.log('\n--- Final Runtime State ---');
  console.log('WorldState:', JSON.stringify(runtime.getWorldState().data, null, 2));
  console.log('Memory Events Length:', runtime.getMemory().length);
  
  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);
