import { CandidatePlanStep, CandidateCategory, GoalProposal } from './types';

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

    for (const candidate of proposal.candidates) {
      if (!candidate.strategy || candidate.strategy.requiresHumanApproval !== true) {
        reasons.push(`Candidate ${candidate.id} is missing a human-approved strategy boundary.`);
        continue;
      }
      if (candidate.strategy.requiredCapabilities.length > 0) {
        reasons.push(`Candidate ${candidate.id} declares capabilities before capability validation is available.`);
      }
      if (candidate.strategy.steps.length === 0) {
        reasons.push(`Candidate ${candidate.id} has no reviewable plan steps.`);
      } else if (!this.isValidDag(candidate.strategy.steps)) {
        reasons.push(`Candidate ${candidate.id} has invalid or cyclic plan dependencies.`);
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

  private isValidDag(steps: CandidatePlanStep[]): boolean {
    const byId = new Map(steps.map(step => [step.id, step]));
    if (byId.size !== steps.length) return false;
    if (steps.some(step => step.dependsOn.some(dependency => !byId.has(dependency)))) return false;

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (stepId: string): boolean => {
      if (visited.has(stepId)) return true;
      if (visiting.has(stepId)) return false;
      visiting.add(stepId);
      const step = byId.get(stepId)!;
      for (const dependency of step.dependsOn) {
        if (!visit(dependency)) return false;
      }
      visiting.delete(stepId);
      visited.add(stepId);
      return true;
    };

    return steps.every(step => visit(step.id));
  }
}
