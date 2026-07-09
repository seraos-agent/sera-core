import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'events';
import { Event, EventTypes, StandardEvent, MemoryItemMutatedPayload } from '../core/events/types';
import { Belief, MemoryCategory } from './types';
import { MemoryProposal, MemoryOperation } from '../core/memory/MemoryProposal';
import { MemoryPolicyEngine } from '../core/memory/MemoryPolicyEngine';
import { MemoryStatus } from '../core/memory/MemoryItem';
import { VerificationLevel } from '../core/memory/VerificationLevel';
import { MemorySource } from '../core/memory/MemorySource';
import { EvidenceType } from '../core/memory/MemoryEvidence';

export class MemoryStore {
  private events: Event[] = [];
  private beliefs: Map<string, Belief> = new Map();
  private categoryIndex: Map<MemoryCategory, Belief[]> = new Map();
  private keyIndex: Map<string, Belief> = new Map();
  
  private filePath: string;
  private policyEngine: MemoryPolicyEngine;

  private MAX_EVENTS = 500;
  private MAX_BELIEFS_PER_CATEGORY = 100;

  constructor(private eventBus?: EventEmitter) {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, 'memory_store.json');
    
    // Inject self into MemoryPolicyEngine via an adapter so it can call __mutate_protected
    this.policyEngine = new MemoryPolicyEngine({
      get: (key: string) => this.keyIndex.get(key) as any,
      __mutate_protected: (proposal: MemoryProposal, newStatus: MemoryStatus, verification: VerificationLevel) => {
        return this.__mutate_protected(proposal, newStatus, verification);
      }
    } as any);

    this.load();
  }

  private load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        
        this.events = parsed.events || [];
        
        if (parsed.beliefs) {
          for (const belief of parsed.beliefs) {
            this._addBeliefToIndex(belief);
          }
        }
      } catch (e) {
        console.error('[MemoryStore] Failed to load memory', e);
      }
    }
  }

  private persist() {
    const data = {
      events: this.events,
      beliefs: Array.from(this.beliefs.values())
    };
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
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

  // --- API ---

  store(event: Event): void {
    this.events.push(event);
    this.prune();
    this.persist();
  }

  getHistory(): Event[] {
    return [...this.events];
  }

  storeBelief(belief: Belief): void {
    // Intercept wallet.* keys for policy evaluation
    if (belief.key && belief.key.startsWith('wallet.')) {
      console.log(`[MemoryStore] Intercepting ${belief.key} for Policy Evaluation...`);
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
    this.persist();
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

  public __mutate_protected(proposal: MemoryProposal, newStatus: MemoryStatus, verification: VerificationLevel): any {
    const existing = this.keyIndex.get(proposal.key);
    
    if (existing) {
      existing.status = MemoryStatus.SUPERSEDED;
    }

    const newItem: Belief = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: proposal.category || 'SEMANTIC',
      key: proposal.key,
      content: proposal.value, // store in content
      status: newStatus,
      source: proposal.source,
      verificationLevel: verification,
      epistemicStatus: 'CONFIRMED',
      confidence: proposal.confidence,
      evidenceIds: proposal.evidence ? [proposal.evidence.referenceId] : [],
      contradictionIds: [],
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now()
    };

    this._addBeliefToIndex(newItem);
    this.prune();
    this.persist();
    
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
    
    console.log(`[MemoryStore] Mutated protected belief: ${proposal.key} -> [${newItem.status}]`);
    return newItem;
  }
}
