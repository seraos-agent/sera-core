import { Event } from '../core/events/types';
import { Belief } from './types';

export class MemoryStore {
  private events: Event[] = [];
  private beliefs: Map<string, Belief> = new Map();

  store(event: Event): void {
    this.events.push(event);
  }

  getHistory(): Event[] {
    return [...this.events];
  }

  storeBelief(belief: Belief): void {
    this.beliefs.set(belief.id, belief);
  }

  updateBelief(belief: Belief): void {
    this.beliefs.set(belief.id, belief);
  }

  getBelief(id: string): Belief | undefined {
    return this.beliefs.get(id);
  }

  getAllBeliefs(): Belief[] {
    return Array.from(this.beliefs.values());
  }
}
