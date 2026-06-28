import { Event } from '../core/events/types';

export class MemoryStore {
  private events: Event[] = [];

  store(event: Event): void {
    this.events.push(event);
  }

  getHistory(): Event[] {
    return [...this.events];
  }
}
