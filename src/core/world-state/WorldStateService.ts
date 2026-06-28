import { WorldState } from './types';
import { Event } from '../events/types';

export class WorldStateService {
  private state: WorldState;

  constructor(initialData: Record<string, any> = {}) {
    this.state = {
      data: initialData,
      lastUpdatedAt: Date.now(),
    };
  }

  getState(): WorldState {
    return this.state;
  }

  applyEvent(event: Event): void {
    // In Phase 1, we just merge the event payload into the world state
    this.state.data = {
      ...this.state.data,
      ...event.payload
    };
    this.state.lastUpdatedAt = Date.now();
  }
}
