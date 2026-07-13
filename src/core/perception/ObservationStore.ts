import { StandardEvent, CognitiveObservationPayload } from '../events/types';

export interface ObservationRecord {
  id: string;
  timestamp: number;
  payload: CognitiveObservationPayload;
}

/**
 * ObservationStore is a strict perception log, not a conversational memory.
 * It uses a capped ring buffer (sliding window) to prevent memory unbounded growth.
 */
export class ObservationStore {
  private stores: Map<string, ObservationRecord[]> = new Map();
  private activeStoreId: string = 'dev';
  private readonly capacity: number;

  constructor(capacity: number = 100) {
    this.capacity = capacity;
    this.stores.set(this.activeStoreId, []);
  }

  public switchUser(userAddress?: string): void {
    const storeId = userAddress ? userAddress.toLowerCase() : 'dev';
    if (!this.stores.has(storeId)) {
      this.stores.set(storeId, []);
    }
    this.activeStoreId = storeId;
    console.log(`[ObservationStore] Switched context to ${storeId}`);
  }

  private get activeObservations(): ObservationRecord[] {
    return this.stores.get(this.activeStoreId)!;
  }

  public append(event: StandardEvent<CognitiveObservationPayload>): void {
    const record: ObservationRecord = {
      id: event.id,
      timestamp: event.timestamp,
      payload: event.payload
    };

    const obs = this.activeObservations;
    obs.push(record);

    // Enforce sliding window capacity
    if (obs.length > this.capacity) {
      obs.shift();
    }
  }

  public getAll(): ObservationRecord[] {
    return [...this.activeObservations];
  }

  public clear(): void {
    this.stores.set(this.activeStoreId, []);
  }
}

// Global singleton for the Observation Store
export const observationStore = new ObservationStore(100);
