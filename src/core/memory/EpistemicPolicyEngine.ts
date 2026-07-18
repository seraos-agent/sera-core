import { EventEmitter } from 'events';
import { createHash } from 'node:crypto';
import { EventTypes, StandardEvent } from '../events/types';
import { IWorkingMemory } from './IWorkingMemory';
import { Belief, MemoryCategory, EpistemicStatus } from './types';
import { MemoryOperation, MemoryProposal } from './MemoryProposal';
import { MemorySource } from './MemorySource';
import { EvidenceType } from './MemoryEvidence';

export class EpistemicPolicyEngine {
  private store: IWorkingMemory;
  
  // Configuration
  private readonly PROMOTION_THRESHOLD = 0.8;
  private readonly DEFAULT_BOOST = 0.3;
  private readonly DEFAULT_DROP = 0.4;

  constructor(store: IWorkingMemory, private eventBus: EventEmitter) {
    this.store = store;
  }

  private requestMemory(proposal: MemoryProposal): void {
    this.eventBus.emit(EventTypes.MEMORY_PROPOSAL_REQUESTED, {
      id: `evt-epistemic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: EventTypes.MEMORY_PROPOSAL_REQUESTED,
      source: 'EpistemicPolicyEngine',
      timestamp: Date.now(),
      payload: proposal
    } as StandardEvent<MemoryProposal>);
  }

  proposeHypothesis(content: string, category: MemoryCategory, initialEvidenceId?: string): Belief {
    const digest = createHash('sha256').update(`${category}:${content.trim().toLowerCase()}`).digest('hex').slice(0, 24);
    const key = `epistemic.${category.toLowerCase()}.${digest}`;
    const existing = this.store.getBeliefByKey(key);
    this.requestMemory({
      operation: existing ? MemoryOperation.UPDATE : MemoryOperation.CREATE,
      key,
      category,
      value: content,
      source: MemorySource.REFLECTION_INFERENCE,
      confidence: existing ? Math.min(1.0, existing.confidence + this.DEFAULT_BOOST) : 0.5,
      evidence: {
        type: EvidenceType.REFLECTION_PATTERN,
        referenceId: initialEvidenceId || `epistemic-origin-${Date.now()}`,
        timestamp: Date.now()
      }
    });

    const belief = this.store.getBeliefByKey(key);
    if (!belief) {
      throw new Error('[EpistemicPolicyEngine] Memory proposal was not accepted by MemoryIngress.');
    }
    console.log(`[EpistemicPolicyEngine] Proposed Hypothesis [${belief.id}]: "${content}" (Confidence: ${belief.confidence})`);
    return belief;
  }

  addEvidence(beliefId: string, evidenceId: string, boost: number = this.DEFAULT_BOOST): void {
    const belief = this.store.getBelief(beliefId);
    if (!belief) return;

    if (!belief.key || belief.evidenceIds.includes(evidenceId)) return;

    const confidence = Math.min(1.0, belief.confidence + boost);
    this.requestMemory({
      operation: MemoryOperation.UPDATE,
      key: belief.key,
      category: belief.category,
      value: belief.content,
      source: MemorySource.REFLECTION_INFERENCE,
      confidence,
      evidence: { type: EvidenceType.REFLECTION_PATTERN, referenceId: evidenceId, timestamp: Date.now() }
    });
    console.log(`[EpistemicPolicyEngine] Added evidence to [${belief.id}]. New Confidence: ${confidence.toFixed(2)}`);
  }

  addContradiction(beliefId: string, contradictionId: string, drop: number = this.DEFAULT_DROP): void {
    const belief = this.store.getBelief(beliefId);
    if (!belief) return;

    if (!belief.key || belief.contradictionIds.includes(contradictionId)) return;

    const confidence = Math.max(0.0, belief.confidence - drop);
    this.requestMemory({
      operation: MemoryOperation.UPDATE,
      key: belief.key,
      category: belief.category,
      value: belief.content,
      source: MemorySource.REFLECTION_INFERENCE,
      confidence,
      contradictionId,
      evidence: {
        type: EvidenceType.REFLECTION_PATTERN,
        referenceId: belief.evidenceIds[0] || belief.id,
        timestamp: Date.now()
      }
    });
    console.log(`[EpistemicPolicyEngine] Added contradiction to [${belief.id}]. New Confidence: ${confidence.toFixed(2)}`);
  }

  evaluateBelief(beliefId: string): void {
    const belief = this.store.getBelief(beliefId);
    if (!belief) return;

    // Promotion is performed by MemoryPolicyEngine from independently recorded evidence.
    if (belief.epistemicStatus === 'CONFIRMED') {
      console.log(`[EpistemicPolicyEngine] Belief [${belief.id}] is confirmed by policy.`);
    }
  }
}
