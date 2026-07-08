import fs from 'node:fs';
import path from 'node:path';
import { MemoryItem, MemoryStatus } from './MemoryItem';
import { MemoryProposal, MemoryOperation } from './MemoryProposal';
import { VerificationLevel } from './VerificationLevel';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent, MemoryItemMutatedPayload } from '../events/types';

export class MemoryService {
  private store: Map<string, MemoryItem> = new Map();
  private filePath: string;

  constructor(private eventBus?: EventEmitter) {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, 'semantic_memory.json');
    this.load();
  }

  private load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const key of Object.keys(parsed)) {
          this.store.set(key, parsed[key]);
        }
      } catch (e) {
        console.error('[MemoryService] Failed to load semantic memory', e);
      }
    }
  }

  private persist() {
    const data: Record<string, MemoryItem> = {};
    for (const [key, item] of this.store.entries()) {
      data[key] = item;
    }
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  public get(key: string): MemoryItem | undefined {
    return this.store.get(key);
  }

  public getAll(): MemoryItem[] {
    return Array.from(this.store.values());
  }

  /**
   * Strictly protected mutation method. 
   * MUST ONLY be called by MemoryPolicyEngine after evaluating governance rules.
   */
  public __mutate_protected(proposal: MemoryProposal, newStatus: MemoryStatus, verification: VerificationLevel): MemoryItem {
    const existing = this.store.get(proposal.key);
    
    // In a full append-only system we'd archive the old state. 
    // Here we just mark it as superseded if we were keeping historical keys, 
    // but since the map is keyed by `proposal.key`, it overwrites the active tip.
    if (existing) {
      existing.status = MemoryStatus.SUPERSEDED;
    }

    const newItem: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      key: proposal.key,
      value: proposal.value,
      status: newStatus,
      source: proposal.source,
      evidence: proposal.evidence,
      confidence: proposal.confidence,
      verificationLevel: verification,
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now()
    };

    if (proposal.operation === MemoryOperation.DELETE || proposal.operation === MemoryOperation.INVALIDATE) {
      newItem.status = MemoryStatus.INVALIDATED;
    }

    this.store.set(proposal.key, newItem);
    this.persist();
    
    if (this.eventBus) {
      const payload: MemoryItemMutatedPayload = {
        key: proposal.key,
        previousStatus: existing ? existing.status : undefined,
        newStatus: newItem.status,
        source: newItem.source,
        confidence: newItem.confidence
      };
      
      const event: StandardEvent<MemoryItemMutatedPayload> = {
        id: `evt-mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: EventTypes.MEMORY_ITEM_MUTATED,
        source: 'MemoryService',
        timestamp: Date.now(),
        payload
      };
      this.eventBus.emit(EventTypes.MEMORY_ITEM_MUTATED, event);
    }
    
    console.log(`[MemoryService] Mutated belief: ${proposal.key} -> ${JSON.stringify(proposal.value)} [${newItem.status}]`);
    return newItem;
  }
}
