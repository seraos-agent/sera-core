import { Belief } from './types';
import { Event } from '../events/types';

export interface MemorySnapshot {
  events: Event[];
  beliefs: Belief[];
}

export interface IMemoryPersistence {
  load(): Promise<MemorySnapshot | null>;
  save(snapshot: MemorySnapshot): Promise<void>;
}
