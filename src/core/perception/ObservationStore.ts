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
  private observations: ObservationRecord[] = [];
  private readonly capacity: number;

  constructor(capacity: number = 100) {
    this.capacity = capacity;
  }

  public append(event: StandardEvent<CognitiveObservationPayload>): void {
    const record: ObservationRecord = {
      id: event.id,
      timestamp: event.timestamp,
      payload: event.payload
    };

    this.observations.push(record);

    // Enforce sliding window capacity
    if (this.observations.length > this.capacity) {
      this.observations.shift();
    }
  }

  public getAll(): ObservationRecord[] {
    return [...this.observations];
  }

  public clear(): void {
    this.observations = [];
  }
}

// Global singleton for the Observation Store
export const observationStore = new ObservationStore(100);
