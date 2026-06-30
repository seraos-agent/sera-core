import { MetaCognitiveRecommendation, GovernanceDecision } from '../cognition/types';
import { MemoryStore } from '../../memory/MemoryStore';

export class MetaGovernanceReview {
  private pendingRecommendations: Map<string, MetaCognitiveRecommendation> = new Map();

  constructor(private memoryStore: MemoryStore) {}

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

    // Store the governance decision as a first-class memory artifact
    // This allows future reflection layers to learn from the human judgment process
    this.memoryStore.storeBelief({
      id: `belief-${govDecision.id}`,
      category: 'GOVERNANCE_DECISION_RECORD',
      content: JSON.stringify(govDecision),
      epistemicStatus: 'CONFIRMED',
      confidence: 1.0, // It is an objective fact that this decision occurred
      evidenceIds: [],
      contradictionIds: [],
      createdAt: govDecision.timestamp,
      updatedAt: govDecision.timestamp
    });

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
