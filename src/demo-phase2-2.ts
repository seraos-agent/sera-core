import { Runtime } from './runtime/Runtime';
import { Goal } from './core/goals/types';
import { DelegationScope } from './delegation/types';
import { WorkerManager } from './workers/WorkerManager';
import { MockWorker } from './workers/MockWorker';

async function main() {
  console.log('=== SERA Core - Stage 2.2: Worker Orchestration Demo ===');
  
  // 1. Setup Execution Layer (Workers)
  const workerManager = new WorkerManager();
  const worker = new MockWorker('demo-orchestration-worker');
  workerManager.register(worker);

  // 2. Setup Decision Layer (Runtime)
  const runtime = new Runtime(workerManager);
  
  const principalId = 'user-999';

  const goal: Goal = {
    id: `goal-${Date.now()}`,
    description: 'Execute a delegated task via Worker Orchestration',
    targetState: { taskCompletedByWorker: true },
    status: 'PENDING',
    createdAt: Date.now()
  };

  const allowedScope: DelegationScope = {
    id: 'scope-orchestration',
    principalId,
    allowedPermissions: [{ action: 'execute_work_item' }],
    requiresApprovalPermissions: [],
  };

  console.log('\n--- Test: Authorized Worker Execution ---');
  await runtime.processGoal(goal, allowedScope);

  console.log('\n--- Final Runtime State ---');
  console.log('WorldState:', runtime.getWorldState().data);
  console.log('Memory Events Length:', runtime.getMemory().length);
  
  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);
