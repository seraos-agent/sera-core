/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import { Observation, WorldStateSnapshot } from './types';

export class WorldStateService {
  private state: WorldStateSnapshot;
  private processedObservationIds: Set<string>;
  private persistPath: string;

  constructor(initialData: Record<string, any> = {}) {
    this.state = {
      state: initialData,
      lastUpdatedAt: Date.now(),
    };
    
    const projectRoot = process.cwd();
    this.persistPath = path.join(projectRoot, '.data', 'world_state.json');
    this.processedObservationIds = new Set<string>();
    
    this.loadPersistedData();
  }

  private loadPersistedData() {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = fs.readFileSync(this.persistPath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed.ids && Array.isArray(parsed.ids)) {
          this.processedObservationIds = new Set(parsed.ids);
        }
        if (parsed.state && typeof parsed.state === 'object') {
          this.state = parsed.state;
        }
      }
    } catch (e) {
      console.error('[WorldStateService] Failed to load persisted data:', e);
    }
  }

  private savePersistedData() {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const payload = {
        ids: Array.from(this.processedObservationIds),
        state: this.state
      };
      
      const data = JSON.stringify(payload);
      
      // Atomic Write Pattern: Write to temp file first, then rename
      const tempPath = this.persistPath + '.tmp';
      fs.writeFileSync(tempPath, data, 'utf8');
      fs.renameSync(tempPath, this.persistPath);
      
    } catch (e) {
      console.error('[WorldStateService] Failed to save persisted data:', e);
    }
  }

  getState(): WorldStateSnapshot {
    return this.state;
  }

  /**
   * Ingests an observation. Returns true if processed, false if dropped (idempotency).
   */
  ingest(observation: Observation<any, any>): boolean {
    const idempotencyKey = observation.source.externalReferenceId;

    if (this.processedObservationIds.has(idempotencyKey)) {
      console.log(`[WorldStateService] ⚠️ Observation dropped. Idempotency key already processed: ${idempotencyKey}`);
      return false; // No-op, already processed
    }

    console.log(`[WorldStateService] ✅ Ingesting new observation: ${observation.type} - ${idempotencyKey}`);
    
    // In Phase 8.0, we just merge payload into generic state (Walking Skeleton)
    if (observation.epistemicWeight === 'FACTUAL' && observation.type === 'STATE_MUTATION') {
      this.state.state = {
        ...this.state.state,
        ...observation.payload
      };
      this.state.lastUpdatedAt = Date.now();
    }

    // Persist state and idempotency key
    this.processedObservationIds.add(idempotencyKey);
    this.savePersistedData();

    return true;
  }
}
