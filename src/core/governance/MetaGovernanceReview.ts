import { MetaCognitiveRecommendation, GovernanceDecision } from '../cognition/types';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../events/types';

export class MetaGovernanceReview {
  private pendingRecommendations: Map<string, MetaCognitiveRecommendation> = new Map();

  constructor(private eventBus: EventEmitter) {}

  submitRecommendation(rec: MetaCognitiveRecommendation): void {
    if (rec.status !== 'PENDING_GOVERNANCE_REVIEW') return;
    this.pendingRecommendations.set(rec.id, rec);
    console.log(`\n[MetaGovernanceReview] Recommendation ${rec.id} submitted for governance review.`);
  }

  recordDecision(
    recommendationId: string, 
    decision: 'APPROVED' | 'REJECTED' | 'MODIFIED', 
    rationale?: string,
    additionalContext?: any
  ): GovernanceDecision | null {
    const rec = this.pendingRecommendations.get(recommendationId);
    if (!rec) {
      console.log(`[MetaGovernanceReview] Error: Recommendation ${recommendationId} not found or already processed.`);
      return null;
    }

    // Update recommendation status
    rec.status = decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    this.pendingRecommendations.delete(recommendationId);

    // Formulate the GovernanceDecision
    const govDecision: GovernanceDecision = {
      id: `gov-dec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      recommendationId: rec.id,
      decision,
      rationale,
      governanceContext: {
        interventionType: rec.target,
        interventionContext: rec.targetContext,
        evidenceCount: rec.evidenceCount,
        recommendationConfidence: rec.confidence,
        ...additionalContext
      },
      timestamp: Date.now()
    };

    // Emit the governance decision as an event instead of writing directly to memory
    const event: StandardEvent<GovernanceDecision> = {
      id: `evt-${govDecision.id}`,
      type: EventTypes.GOVERNANCE_DECISION_RECORDED,
      source: 'MetaGovernanceReview',
      timestamp: govDecision.timestamp,
      payload: govDecision
    };
    
    this.eventBus.emit(EventTypes.GOVERNANCE_DECISION_RECORDED, event);

    console.log(`\n[MetaGovernanceReview] Human Judgment Recorded: ${decision} for Recommendation ${rec.id}`);
    if (rationale) {
      console.log(`  -> Rationale: ${rationale}`);
    }

    return govDecision;
  }

  getPendingRecommendations(): MetaCognitiveRecommendation[] {
    return Array.from(this.pendingRecommendations.values());
  }
}
