import { Runtime } from './runtime/Runtime';
import { Goal } from './core/goals/types';
import { DelegationScope } from './delegation/types';
import { WorkerManager } from './workers/WorkerManager';
import { MockWorker } from './workers/MockWorker';

async function main() {
  console.log('=== SERA Core - Phase 2: Authority Layer Demo ===');
  
  const workerManager = new WorkerManager();
  workerManager.register(new MockWorker('demo-worker'));

  const runtime = new Runtime(workerManager);
  const principalId = 'user-123';

  // Define our test goal
  const goal: Goal = {
    id: `goal-${Date.now()}`,
    description: 'Process various work items to test authority',
    targetState: { testComplete: true },
    status: 'PENDING',
    priority: 1.0,
    stabilityIndex: 1.0,
    createdAt: Date.now()
  };

  console.log('\n--- Test 1: Execution ALLOWED ---');
  const allowedScope: DelegationScope = {
    id: 'scope-1',
    principalId,
    allowedPermissions: [{ action: 'execute_work_item' }],
    requiresApprovalPermissions: [],
  };
  await runtime.processGoal({ ...goal, id: 'goal-allowed' }, allowedScope);

  console.log('\n--- Test 2: Execution DENIED ---');
  const deniedScope: DelegationScope = {
    id: 'scope-2',
    principalId,
    allowedPermissions: [{ action: 'read_world_state' }], // Missing execute_work_item
    requiresApprovalPermissions: [],
  };
  await runtime.processGoal({ ...goal, id: 'goal-denied' }, deniedScope);

  console.log('\n--- Test 3: Execution REQUIRES_APPROVAL ---');
  const approvalScope: DelegationScope = {
    id: 'scope-3',
    principalId,
    allowedPermissions: [],
    requiresApprovalPermissions: [{ action: 'execute_work_item' }],
  };
  await runtime.processGoal({ ...goal, id: 'goal-approval' }, approvalScope);

  console.log('\n--- Final Runtime State ---');
  console.log('WorldState:', runtime.getWorldState().data);
  console.log('Memory Events Length:', runtime.getMemory().length);
  
  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);
