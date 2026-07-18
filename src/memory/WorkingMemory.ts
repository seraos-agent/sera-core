import { EventEmitter } from 'events';
import { Event, EventTypes, StandardEvent, MemoryItemMutatedPayload } from '../core/events/types';
import { Belief, EpistemicStatus, MemoryCategory } from '../core/memory/types';
import { MemoryProposal, MemoryOperation } from '../core/memory/MemoryProposal';
import { MemoryPolicyEngine } from '../core/memory/MemoryPolicyEngine';
import { MemoryStatus } from '../core/memory/MemoryItem';
import { VerificationLevel } from '../core/memory/VerificationLevel';
import { MemorySource } from '../core/memory/MemorySource';
import { EvidenceType } from '../core/memory/MemoryEvidence';
import { IWorkingMemory } from '../core/memory/IWorkingMemory';
import { MemorySnapshot } from '../core/memory/IMemoryPersistence';

export class WorkingMemory implements IWorkingMemory {
  private events: Event[] = [];
  private beliefs: Map<string, Belief> = new Map();
  private categoryIndex: Map<MemoryCategory, Belief[]> = new Map();
  private keyIndex: Map<string, Belief> = new Map();
  
  private policyEngine: MemoryPolicyEngine;

  private MAX_EVENTS = 500;
  private MAX_BELIEFS_PER_CATEGORY = 100;

  constructor(private eventBus?: EventEmitter) {
    // Inject self into MemoryPolicyEngine via an adapter so it can call __mutate_protected
    this.policyEngine = new MemoryPolicyEngine({
      getBeliefByKey: (key: string) => this.keyIndex.get(key) as any,
      __mutate_protected: (proposal: MemoryProposal, newStatus: MemoryStatus, verification: VerificationLevel, epistemicStatus?: EpistemicStatus) => {
        return this.__mutate_protected(proposal, newStatus, verification, epistemicStatus);
      }
    } as any);
  }



  public loadSnapshot(snapshot: MemorySnapshot) {
    this.events = snapshot.events || [];
    this.beliefs.clear();
    this.categoryIndex.clear();
    this.keyIndex.clear();
    
    if (snapshot.beliefs) {
      for (const belief of snapshot.beliefs) {
        this._addBeliefToIndex(belief);
      }
    }
  }

  public getSnapshot(): MemorySnapshot {
    return {
      events: [...this.events],
      beliefs: Array.from(this.beliefs.values())
    };
  }

  private prune() {
    // Prune events
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(this.events.length - this.MAX_EVENTS);
    }

    // Prune beliefs per category
    for (const [category, beliefs] of this.categoryIndex.entries()) {
      if (beliefs.length > this.MAX_BELIEFS_PER_CATEGORY) {
        // Sort by updatedAt, descending (newest first)
        const sorted = [...beliefs].sort((a, b) => b.updatedAt - a.updatedAt);
        const toKeep = sorted.slice(0, this.MAX_BELIEFS_PER_CATEGORY);
        const toRemove = sorted.slice(this.MAX_BELIEFS_PER_CATEGORY);
        
        for (const b of toRemove) {
          if (!b.key || !b.key.startsWith('wallet.')) { // don't evict protected keys easily
            this.beliefs.delete(b.id);
            if (b.key) this.keyIndex.delete(b.key);
          }
        }
        
        // Rebuild category index for this category
        this.categoryIndex.set(category, toKeep);
      }
    }
  }

  private _addBeliefToIndex(belief: Belief) {
    this.beliefs.set(belief.id, belief);
    
    // Category index
    if (!this.categoryIndex.has(belief.category)) {
      this.categoryIndex.set(belief.category, []);
    }
    const catList = this.categoryIndex.get(belief.category)!;
    if (!catList.find(b => b.id === belief.id)) {
      catList.push(belief);
    }
    
    // Key index
    if (belief.key) {
      this.keyIndex.set(belief.key, belief);
    }
  }

  private _removeBeliefFromIndex(belief: Belief): void {
    this.beliefs.delete(belief.id);

    const categoryBeliefs = this.categoryIndex.get(belief.category);
    if (categoryBeliefs) {
      this.categoryIndex.set(
        belief.category,
        categoryBeliefs.filter(indexedBelief => indexedBelief.id !== belief.id)
      );
    }

    if (belief.key && this.keyIndex.get(belief.key)?.id === belief.id) {
      this.keyIndex.delete(belief.key);
    }
  }

  // --- API ---

  store(event: Event): void {
    this.events.push(event);
    this.prune();
  }

  getHistory(): Event[] {
    return [...this.events];
  }

  storeBelief(belief: Belief): void {
    // wallet.* protection MUST be strictly preserved as per testing requirements
    if (belief.key && belief.key.startsWith('wallet.')) {
      console.log(`[WorkingMemory] Intercepting ${belief.key} for Policy Evaluation...`);
      const proposal: MemoryProposal = {
        operation: MemoryOperation.UPDATE,
        key: belief.key,
        value: belief.content,
        source: belief.source || MemorySource.REFLECTION_INFERENCE,
        evidence: { type: EvidenceType.REFLECTION_PATTERN, referenceId: belief.evidenceIds[0] || 'unknown', timestamp: Date.now() },
        confidence: belief.confidence
      };
      
      const result = this.policyEngine.evaluate(proposal);
      if (!result.approved) {
        throw new Error(`PolicyEngine rejected storage of ${belief.key}: ${result.reason}`);
      }
      return; // __mutate_protected handles the actual storage
    }

    this._addBeliefToIndex(belief);
    this.prune();
    this.eventBus?.emit(EventTypes.MEMORY_ITEM_MUTATED, {
      id: `evt-mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: EventTypes.MEMORY_ITEM_MUTATED,
      source: 'MemoryStore',
      timestamp: Date.now(),
      payload: { key: belief.key || belief.id, newStatus: String(belief.status || MemoryStatus.ACTIVE), source: String(belief.source || 'DIRECT'), confidence: belief.confidence }
    } as StandardEvent<MemoryItemMutatedPayload>);
  }

  public proposeBelief(proposal: MemoryProposal): void {
    const result = this.policyEngine.evaluate(proposal);
    if (!result.approved) {
      throw new Error(`PolicyEngine rejected proposal for ${proposal.key}: ${result.reason}`);
    }
  }

  updateBelief(belief: Belief): void {
    this.storeBelief(belief);
  }

  getBelief(id: string): Belief | undefined {
    return this.beliefs.get(id);
  }

  getAllBeliefs(): Belief[] {
    return Array.from(this.beliefs.values());
  }

  // --- Indexed Retrieval ---

  getBeliefsByCategory(category: MemoryCategory): Belief[] {
    return this.categoryIndex.get(category) || [];
  }

  getBeliefByKey(key: string): Belief | undefined {
    return this.keyIndex.get(key);
  }

  // --- Internal Policy Engine Bridge ---

  public __mutate_protected(
    proposal: MemoryProposal,
    newStatus: MemoryStatus,
    verification: VerificationLevel,
    epistemicStatus: EpistemicStatus = 'HYPOTHESIS'
  ): any {
    const existing = this.keyIndex.get(proposal.key);
    
    if (existing && newStatus === MemoryStatus.ACTIVE) {
      existing.status = MemoryStatus.SUPERSEDED;
    }

    const content = typeof proposal.value === 'string' ? proposal.value : JSON.stringify(proposal.value);
    const keepsExistingEvidence = existing?.content === content;
    const evidenceIds = new Set(keepsExistingEvidence ? existing.evidenceIds : []);
    evidenceIds.add(proposal.evidence.referenceId);
    const contradictionIds = new Set(keepsExistingEvidence ? existing.contradictionIds : []);
    if (proposal.contradictionId) contradictionIds.add(proposal.contradictionId);

    const newItem: Belief = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: proposal.category || 'SEMANTIC',
      key: proposal.key,
      content,
      status: newStatus,
      source: proposal.source,
      verificationLevel: verification,
      epistemicStatus,
      confidence: proposal.confidence,
      evidenceIds: Array.from(evidenceIds),
      contradictionIds: Array.from(contradictionIds),
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now()
    };

    if (existing) {
      this._removeBeliefFromIndex(existing);
    }
    this._addBeliefToIndex(newItem);
    this.prune();
    
    if (this.eventBus) {
      const payload: MemoryItemMutatedPayload = {
        key: proposal.key,
        previousStatus: existing?.status ? String(existing.status) : undefined,
        newStatus: String(newItem.status),
        source: String(newItem.source),
        confidence: newItem.confidence
      };
      
      const event: StandardEvent<MemoryItemMutatedPayload> = {
        id: `evt-mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: EventTypes.MEMORY_ITEM_MUTATED,
        source: 'MemoryStore',
        timestamp: Date.now(),
        payload
      };
      this.eventBus.emit(EventTypes.MEMORY_ITEM_MUTATED, event);
    }
    
    console.log(`[WorkingMemory] Mutated protected belief: ${proposal.key} -> [${newItem.status}]`);
    return newItem;
  }
}
