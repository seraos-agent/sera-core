import { GoalProposal, CandidateCategory } from './types';

export interface ProposalGovernancePolicy {
  id: string;
  minCandidates: number;
  requiredCategories: CandidateCategory[];
}

export class ProposalGovernance {
  private activePolicy: ProposalGovernancePolicy;
  
  private metrics = {
    proposalsEvaluated: 0,
    proposalsPassed: 0,
    proposalsExpired: 0,
    proposalsSuperseded: 0
  };

  constructor(policy?: ProposalGovernancePolicy) {
    this.activePolicy = policy || {
      id: 'default-diversity-policy',
      minCandidates: 3,
      requiredCategories: ['ALIGNED', 'OBJECTIVE', 'EXPLORATORY']
    };
  }

  evaluate(proposal: GoalProposal): { valid: boolean; reasons: string[] } {
    this.metrics.proposalsEvaluated++;
    const reasons: string[] = [];

    if (proposal.candidates.length < this.activePolicy.minCandidates) {
      reasons.push(`Proposal has ${proposal.candidates.length} candidates, minimum required is ${this.activePolicy.minCandidates}.`);
    }

    const categoriesPresent = new Set(proposal.candidates.map(c => c.category));
    for (const req of this.activePolicy.requiredCategories) {
      if (!categoriesPresent.has(req)) {
        reasons.push(`Proposal is missing required candidate category: ${req}.`);
      }
    }

    const valid = reasons.length === 0;
    if (valid) {
      this.metrics.proposalsPassed++;
    }

    return {
      valid,
      reasons
    };
  }
  
  recordExpiration() { this.metrics.proposalsExpired++; }
  recordSupercession() { this.metrics.proposalsSuperseded++; }
  getMetrics() { return { ...this.metrics }; }
}
