import { Runtime } from './runtime/Runtime';
import { Goal } from './core/goals/types';

async function main() {
  console.log('=== SERA Core - Phase 1 Foundation ===');
  
  const runtime = new Runtime();

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
    createdAt: Date.now()
  };

  // Run the loop
  await runtime.processGoal(goal);

  console.log('\nFinal WorldState:', runtime.getWorldState().data);
  console.log('Memory Store Events:', runtime.getMemory().length);
  
  console.log('\n=== Run Completed Successfully ===');
}

main().catch(console.error);
