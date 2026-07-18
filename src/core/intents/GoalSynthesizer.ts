import { CandidateCategory, CandidatePlanStep, CandidateStrategy, GoalCandidate, GoalProposal, Intent, RepresentationGap } from './types';

export class GoalSynthesizer {
  generateProposal(intent: Intent, gap: RepresentationGap, worldState: any): GoalProposal {
    console.log(`[GoalSynthesizer] Synthesizing Goal Proposal for Intent: ${intent.id} (Gap: ${gap.reason})`);

    const timestamp = gap.detectedAt;
    const stateDomains = this.worldStateDomains(worldState);
    const candidates = (['ALIGNED', 'OBJECTIVE', 'EXPLORATORY'] as CandidateCategory[])
      .map(category => this.createCandidate(intent, category, timestamp, stateDomains));

    return {
      id: `prop-${timestamp}`,
      parentIntentId: intent.id,
      candidates,
      status: 'PENDING_REVIEW',
      createdAt: gap.detectedAt
    };
  }

  private createCandidate(intent: Intent, category: CandidateCategory, timestamp: number, worldStateDomains: string[]): GoalCandidate {
    const strategy = this.createStrategy(intent, category, worldStateDomains);
    const suffix = category.toLowerCase();
    const titles: Record<CandidateCategory, string> = {
      ALIGNED: `Preserve alignment for: ${intent.description}`,
      OBJECTIVE: `Build a validated baseline for: ${intent.description}`,
      EXPLORATORY: `Compare safe alternatives for: ${intent.description}`
    };
    const rationales: Record<CandidateCategory, string> = {
      ALIGNED: 'Prioritizes intent preservation while the current state is observed and assumptions remain explicit.',
      OBJECTIVE: 'Produces a direct, reviewable baseline with validation before any action can be proposed.',
      EXPLORATORY: 'Separates observation and comparison so alternatives can be reviewed without committing to one prematurely.'
    };

    return {
      id: `cand-${timestamp}-${suffix}`,
      category,
      title: titles[category],
      rationale: rationales[category],
      strategy,
      // Runtime continues to consume this compatibility metadata. It contains no executable capability.
      strategyMetadata: {
        action: 'PROPOSE_STRATEGY',
        intentId: intent.id,
        worldStateDomains,
        plan: strategy.steps
      }
    };
  }

  private createStrategy(intent: Intent, category: CandidateCategory, worldStateDomains: string[]): CandidateStrategy {
    const objectiveByCategory: Record<CandidateCategory, string> = {
      ALIGNED: `Maintain fidelity to the user's stated intent: ${intent.description}`,
      OBJECTIVE: `Establish the most direct validated path toward: ${intent.description}`,
      EXPLORATORY: `Evaluate distinct, low-commitment paths toward: ${intent.description}`
    };

    const stepsByCategory: Record<CandidateCategory, CandidatePlanStep[]> = {
      ALIGNED: [
        { id: 'observe-state', kind: 'OBSERVE', title: 'Observe relevant current state', dependsOn: [] },
        { id: 'check-assumptions', kind: 'ANALYZE', title: 'Check stated assumptions against observations', dependsOn: ['observe-state'] },
        { id: 'prepare-review', kind: 'PROPOSE', title: 'Prepare an alignment-preserving proposal for review', dependsOn: ['check-assumptions'] }
      ],
      OBJECTIVE: [
        { id: 'observe-state', kind: 'OBSERVE', title: 'Observe relevant current state', dependsOn: [] },
        { id: 'validate-feasibility', kind: 'ANALYZE', title: 'Validate feasibility and constraints', dependsOn: ['observe-state'] },
        { id: 'prepare-baseline', kind: 'PROPOSE', title: 'Prepare the baseline proposal for review', dependsOn: ['validate-feasibility'] }
      ],
      EXPLORATORY: [
        { id: 'observe-state', kind: 'OBSERVE', title: 'Observe relevant current state', dependsOn: [] },
        { id: 'analyze-option-a', kind: 'ANALYZE', title: 'Analyze the direct option', dependsOn: ['observe-state'] },
        { id: 'analyze-option-b', kind: 'COMPARE', title: 'Analyze an alternative option', dependsOn: ['observe-state'] },
        { id: 'compare-options', kind: 'COMPARE', title: 'Compare trade-offs and unresolved risks', dependsOn: ['analyze-option-a', 'analyze-option-b'] },
        { id: 'prepare-options', kind: 'PROPOSE', title: 'Prepare alternatives for human review', dependsOn: ['compare-options'] }
      ]
    };

    return {
      objective: objectiveByCategory[category],
      assumptions: [
        'The observed world state may change before approval.',
        'No irreversible action is authorized by strategy synthesis alone.'
      ],
      risks: [
        'Incomplete or stale observations can invalidate the proposal.',
        'Human approval remains required before a goal is registered.'
      ],
      steps: stepsByCategory[category],
      requiredCapabilities: [],
      requiresHumanApproval: true,
      worldStateDomains
    };
  }

  private worldStateDomains(worldState: unknown): string[] {
    if (!worldState || typeof worldState !== 'object' || Array.isArray(worldState)) return [];
    return Object.keys(worldState as Record<string, unknown>).sort();
  }
}
