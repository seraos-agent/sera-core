import { Runtime } from './runtime/Runtime';
import { Goal } from './core/goals/types';
import { DelegationScope } from './delegation/types';
import { WorkerManager } from './workers/WorkerManager';
import { MockWorker } from './workers/MockWorker';

async function main() {
  console.log('=== SERA Core - Phase 1 Foundation ===');
  
  const workerManager = new WorkerManager();
  workerManager.register(new MockWorker('system-worker'));

  const runtime = new Runtime(workerManager);

  console.log('\nInitial WorldState:', runtime.getWorldState().data);

  // 1. Create a Goal
  const goal: Goal = {
    id: `goal-${Date.now()}`,
    description: 'Establish foundational knowledge base',
    targetState: {
      knowledgeBaseInitialized: true,
      coreConceptsUnderstood: 5
    },
    status: 'PENDING',
    priority: 1.0,
    stabilityIndex: 1.0,
    createdAt: Date.now()
  };

  const defaultScope: DelegationScope = {
    id: 'scope-default',
    principalId: 'system',
    allowedPermissions: [{ action: 'execute_work_item' }],
    requiresApprovalPermissions: []
  };

  // Run the loop
  await runtime.processGoal(goal, defaultScope);

  console.log('\nFinal WorldState:', runtime.getWorldState().data);
  console.log('Memory Store Events:', runtime.getMemory().length);
  
  console.log('\n=== Run Completed Successfully ===');
}

main().catch(console.error);
