import { GoalProposal, GoalProposalStatus } from './types';

export class ProposalStore {
  private stores: Map<string, Map<string, GoalProposal>> = new Map();
  private activeContext: string = 'dev';

  constructor() {
    this.stores.set(this.activeContext, new Map());
  }

  public switchUser(userAddress?: string): void {
    const contextId = userAddress ? userAddress.toLowerCase() : 'dev';
    if (!this.stores.has(contextId)) {
      this.stores.set(contextId, new Map());
    }
    this.activeContext = contextId;
    console.log(`[ProposalStore] Switched context to ${contextId}`);
  }

  private get proposals(): Map<string, GoalProposal> {
    return this.stores.get(this.activeContext)!;
  }

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

  getStaleProposals(currentPhysicalTime: number, maxAgeMs: number = 3600000): GoalProposal[] {
    return Array.from(this.proposals.values()).filter(
      p => p.status === 'PENDING_REVIEW' && (currentPhysicalTime - p.createdAt > maxAgeMs)
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
