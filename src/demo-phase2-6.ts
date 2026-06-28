import { MemoryStore } from './memory/MemoryStore';
import { MemoryPolicyEngine } from './memory/MemoryPolicyEngine';

async function main() {
  console.log('=== SERA Core - Stage 2.6: Memory Policy Engine Demo ===\n');

  const memoryStore = new MemoryStore();
  const policyEngine = new MemoryPolicyEngine(memoryStore);

  console.log('--- Setup: Create Hypothesis ---');
  const hypothesis = policyEngine.proposeHypothesis('User prefers short drafts first', 'SEMANTIC', 'evt-initial-1');

  console.log('\n--- Case 3: Insufficient Evidence ---');
  policyEngine.evaluateBelief(hypothesis.id);
  console.log(`Current Status: ${memoryStore.getBelief(hypothesis.id)?.epistemicStatus}`);

  console.log('\n--- Case 1 & Case 4: Repeated Evidence -> Promotion ---');
  policyEngine.addEvidence(hypothesis.id, 'evt-evidence-2');
  console.log(`Current Status: ${memoryStore.getBelief(hypothesis.id)?.epistemicStatus}`);

  console.log('\n--- Case 2: Contradictory Evidence ---');
  policyEngine.addContradiction(hypothesis.id, 'evt-contradiction-1');
  
  const finalBelief = memoryStore.getBelief(hypothesis.id);
  console.log('\n--- Final Belief State ---');
  console.log(JSON.stringify(finalBelief, null, 2));

  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);
