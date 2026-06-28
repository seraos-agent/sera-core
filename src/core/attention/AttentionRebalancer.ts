import { Goal } from '../goals/types';
import { MemoryStore } from '../../memory/MemoryStore';

export class AttentionRebalancer {
  prioritize(goals: Goal[], memoryStore: MemoryStore): Goal[] {
    // Sort goals by dynamically calculated score
    return goals.sort((a, b) => {
      // Base is the goal's current priority score
      let scoreA = a.priority * a.stabilityIndex;
      let scoreB = b.priority * b.stabilityIndex;
      
      // Boost if beliefs exist supporting the goal (simplified)
      const beliefs = memoryStore.getAllBeliefs();
      const confirmedBeliefsCount = beliefs.filter(b => b.epistemicStatus === 'CONFIRMED').length;
      
      // If we have strong confirmed knowledge, goals are scored slightly higher in confidence
      const beliefSupportScore = (confirmedBeliefsCount * 0.1);
      
      scoreA += beliefSupportScore;
      scoreB += beliefSupportScore;
      
      return scoreB - scoreA;
    });
  }
}
