import { CandidatePlanStep, CandidateCategory, CandidateStrategy, GoalProposal } from './types';

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
      reasons.push(...this.evaluateStrategy(candidate.strategy).map(reason => `Candidate ${candidate.id} ${reason}`));
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

  /** Reusable boundary check for any component that consumes a candidate strategy. */
  public evaluateStrategy(strategy: CandidateStrategy | undefined): string[] {
    if (!strategy || strategy.requiresHumanApproval !== true) {
      return ['is missing a human-approved strategy boundary.'];
    }
    if (strategy.requiredCapabilities.length > 0) {
      return ['declares capabilities before capability validation is available.'];
    }
    if (strategy.steps.length === 0) {
      return ['has no reviewable plan steps.'];
    }
    if (!this.isValidDag(strategy.steps)) {
      return ['has invalid or cyclic plan dependencies.'];
    }
    return [];
  }

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
