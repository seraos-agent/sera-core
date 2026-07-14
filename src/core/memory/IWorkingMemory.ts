import { Event } from '../events/types';
import { Belief, MemoryCategory } from './types';
import { MemoryProposal } from './MemoryProposal';
import { MemoryStatus } from './MemoryItem';
import { VerificationLevel } from './VerificationLevel';

export interface IWorkingMemory {
  store(event: Event): void;
  getHistory(): Event[];
  
  storeBelief(belief: Belief): void;
  proposeBelief(proposal: MemoryProposal): void;
  updateBelief(belief: Belief): void;
  
  getBelief(id: string): Belief | undefined;
  getAllBeliefs(): Belief[];
  getBeliefsByCategory(category: MemoryCategory): Belief[];
  getBeliefByKey(key: string): Belief | undefined;
  
  __mutate_protected(proposal: MemoryProposal, newStatus: MemoryStatus, verification: VerificationLevel): any;
}
