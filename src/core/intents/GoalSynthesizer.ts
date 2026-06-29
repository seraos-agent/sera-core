import { GoalProposal, Intent, RepresentationGap, GoalCandidate } from './types';

export class GoalSynthesizer {
  generateProposal(intent: Intent, gap: RepresentationGap, worldState: any): GoalProposal {
    // In Phase 4.1, we use mock generation logic
    console.log(`[GoalSynthesizer] Synthesizing Goal Proposal for Intent: ${intent.id} (Gap: ${gap.reason})`);

    const candidates: GoalCandidate[] = [
      {
        id: `cand-${Date.now()}-wait`,
        title: 'Wait for market correction',
        rationale: `Current maxBTCPrice is ${worldState.maxBTCPrice || 'high'}. Waiting is safer.`,
        confidence: 0.72,
        strategyMetadata: { targetMaxPrice: 100000 }
      },
      {
        id: `cand-${Date.now()}-dca`,
        title: 'DCA Weekly',
        rationale: 'Ignore short-term volatility and accumulate progressively.',
        confidence: 0.65,
        strategyMetadata: { weeklyAllocation: 1000 }
      }
    ];

    return {
      id: `prop-${Date.now()}`,
      parentIntentId: intent.id,
      candidates,
      status: 'PENDING_REVIEW',
      createdAt: gap.detectedAt
    };
  }
}
