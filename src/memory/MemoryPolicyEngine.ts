import { MemoryStore } from './MemoryStore';
import { Belief, MemoryCategory, EpistemicStatus } from './types';

export class MemoryPolicyEngine {
  private store: MemoryStore;
  
  // Configuration
  private readonly PROMOTION_THRESHOLD = 0.8;
  private readonly DEFAULT_BOOST = 0.3;
  private readonly DEFAULT_DROP = 0.4;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  proposeHypothesis(content: string, category: MemoryCategory, initialEvidenceId?: string): Belief {
    const belief: Belief = {
      id: `belief-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      category,
      content,
      epistemicStatus: 'HYPOTHESIS',
      confidence: 0.5, // Start as neutral hypothesis
      evidenceIds: initialEvidenceId ? [initialEvidenceId] : [],
      contradictionIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.store.storeBelief(belief);
    console.log(`[MemoryPolicyEngine] Proposed Hypothesis [${belief.id}]: "${content}" (Confidence: ${belief.confidence})`);
    return belief;
  }

  addEvidence(beliefId: string, evidenceId: string, boost: number = this.DEFAULT_BOOST): void {
    const belief = this.store.getBelief(beliefId);
    if (!belief) return;

    if (!belief.evidenceIds.includes(evidenceId)) {
      belief.evidenceIds.push(evidenceId);
    }
    
    belief.confidence = Math.min(1.0, belief.confidence + boost);
    belief.updatedAt = Date.now();
    
    this.store.updateBelief(belief);
    console.log(`[MemoryPolicyEngine] Added evidence to [${belief.id}]. New Confidence: ${belief.confidence.toFixed(2)}`);
    
    this.evaluateBelief(belief.id);
  }

  addContradiction(beliefId: string, contradictionId: string, drop: number = this.DEFAULT_DROP): void {
    const belief = this.store.getBelief(beliefId);
    if (!belief) return;

    if (!belief.contradictionIds.includes(contradictionId)) {
      belief.contradictionIds.push(contradictionId);
    }
    
    belief.confidence = Math.max(0.0, belief.confidence - drop);
    belief.updatedAt = Date.now();
    
    // Demote if confidence drops below threshold
    if (belief.confidence < this.PROMOTION_THRESHOLD && belief.epistemicStatus !== 'HYPOTHESIS') {
      console.log(`[MemoryPolicyEngine] Belief [${belief.id}] demoted to HYPOTHESIS due to contradiction.`);
      belief.epistemicStatus = 'HYPOTHESIS';
    }

    this.store.updateBelief(belief);
    console.log(`[MemoryPolicyEngine] Added contradiction to [${belief.id}]. New Confidence: ${belief.confidence.toFixed(2)}`);
  }

  evaluateBelief(beliefId: string): void {
    const belief = this.store.getBelief(beliefId);
    if (!belief) return;

    if (belief.epistemicStatus === 'HYPOTHESIS' && belief.confidence >= this.PROMOTION_THRESHOLD) {
      belief.epistemicStatus = 'CONFIRMED';
      belief.updatedAt = Date.now();
      this.store.updateBelief(belief);
      console.log(`[MemoryPolicyEngine] Promoted Belief [${belief.id}] to CONFIRMED.`);
    }
  }
}
