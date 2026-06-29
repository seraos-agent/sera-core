import { MemoryPolicyEngine } from '../../memory/MemoryPolicyEngine';
import { BeliefUpdateProposal } from './types';

export class ReflectionProposalProcessor {
  constructor(private memoryPolicyEngine: MemoryPolicyEngine) {}

  process(proposals: BeliefUpdateProposal[]): void {
    if (proposals.length === 0) return;
    
    console.log(`\n[ReflectionProposalProcessor] Processing ${proposals.length} proposals...`);
    
    for (const proposal of proposals) {
      console.log(`  -> Processing Proposal [${proposal.id}]: Action=${proposal.action} | Conf=${proposal.confidence.toFixed(2)}`);
      
      switch (proposal.action) {
        case 'PROPOSE_HYPOTHESIS':
          if (!proposal.content || !proposal.category) {
            console.error(`  [Error] Missing content or category for hypothesis proposal: ${proposal.id}`);
            continue;
          }
          // The processor forwards the semantic reasoning as the content
          const belief = this.memoryPolicyEngine.proposeHypothesis(
            proposal.content,
            proposal.category,
            proposal.evidenceIds[0] // Link first trace as initial evidence
          );
          
          // Optionally, add the rest of the traces as additional evidence
          for (let i = 1; i < proposal.evidenceIds.length; i++) {
            this.memoryPolicyEngine.addEvidence(belief.id, proposal.evidenceIds[i], 0.1); // Small boost per trace
          }
          break;
          
        case 'ADD_EVIDENCE':
          if (!proposal.beliefId) {
            console.error(`  [Error] Missing beliefId for evidence proposal: ${proposal.id}`);
            continue;
          }
          for (const evId of proposal.evidenceIds) {
            this.memoryPolicyEngine.addEvidence(proposal.beliefId, evId, 0.1);
          }
          break;
          
        case 'ADD_CONTRADICTION':
          if (!proposal.beliefId) {
            console.error(`  [Error] Missing beliefId for contradiction proposal: ${proposal.id}`);
            continue;
          }
          for (const evId of proposal.evidenceIds) {
            this.memoryPolicyEngine.addContradiction(proposal.beliefId, evId, 0.1);
          }
          break;
      }
    }
  }
}
