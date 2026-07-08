import { Goal } from '../goals/types';
import { MemoryStore } from '../../memory/MemoryStore';

export class AttentionRebalancer {
  prioritize(goals: Goal[], memoryStore: MemoryStore): Goal[] {
    const calibrationBeliefs = memoryStore.getBeliefsByCategory('CALIBRATION');
    
    // Pre-parse to avoid parsing repeatedly in sort loop
    const parsedBeliefs = calibrationBeliefs
      .filter(c => c.epistemicStatus === 'CONFIRMED')
      .map(c => {
        try { return JSON.parse(c.content); } catch { return null; }
      })
      .filter(c => c !== null);

    // Sort goals by dynamically calculated score
    return goals.sort((a, b) => {
      // Base is the goal's current priority score
      let scoreA = a.priority * a.stabilityIndex;
      let scoreB = b.priority * b.stabilityIndex;
      
      // Boost if calibration beliefs exist supporting the goal intent
      const boostA = parsedBeliefs.filter(c => c.intentType === a.intentId).length * 0.1;
      const boostB = parsedBeliefs.filter(c => c.intentType === b.intentId).length * 0.1;
      
      scoreA += boostA;
      scoreB += boostB;
      
      return scoreB - scoreA;
    });
  }
}
