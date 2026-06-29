import { GoalProposal, GoalProposalStatus } from './types';

export class ProposalStore {
  private proposals: Map<string, GoalProposal> = new Map();

  register(proposal: GoalProposal): void {
    if (this.proposals.has(proposal.id)) {
      throw new Error(`Proposal with id ${proposal.id} is already registered.`);
    }
    this.proposals.set(proposal.id, proposal);
    console.log(`[ProposalStore] Registered new GoalProposal: ${proposal.id}`);
  }

  getProposal(proposalId: string): GoalProposal | undefined {
    return this.proposals.get(proposalId);
  }

  getActiveProposalForIntent(intentId: string): GoalProposal | undefined {
    return Array.from(this.proposals.values()).find(
      p => p.parentIntentId === intentId && p.status === 'PENDING_REVIEW'
    );
  }

  updateStatus(proposalId: string, status: GoalProposalStatus, selectedCandidateId?: string): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return;
    proposal.status = status;
    if (selectedCandidateId) {
      proposal.selectedCandidateId = selectedCandidateId;
    }
    console.log(`[ProposalStore] Proposal ${proposalId} status updated to ${status}`);
  }
}
