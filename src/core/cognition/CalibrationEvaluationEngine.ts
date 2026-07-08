import { MemoryStore } from '../../memory/MemoryStore';
import { Belief } from '../../memory/types';
import { MetaCognitiveRecommendation } from './types';

export class CalibrationEvaluationEngine {
  private memoryStore: MemoryStore;
  private recommendations: MetaCognitiveRecommendation[] = [];

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;
  }

  evaluate(): MetaCognitiveRecommendation[] {
    const newRecommendations: MetaCognitiveRecommendation[] = [];
    
    // Group calibration beliefs by intentType + category
    const calibrationBeliefs = this.memoryStore.getAllBeliefs().filter(b => b.category === 'CALIBRATION');
    const trajectories: Record<string, any[]> = {};

    for (const belief of calibrationBeliefs) {
      const data = JSON.parse(belief.content);
      const key = `${data.intentType}::${data.category}`;
      if (!trajectories[key]) trajectories[key] = [];
      trajectories[key].push({ belief, data });
    }

    for (const key of Object.keys(trajectories)) {
      // Sort chronologically by timestamp
      const sequence = trajectories[key].sort((a, b) => a.data.timestamp - b.data.timestamp);
      
      if (sequence.length < 3) continue; // Not enough data for a trend

      const latest = sequence[sequence.length - 1];
      const category = latest.data.category;
      
      // Analyze Trend: Look at the last 3-5 cycles
      const recentWindow = sequence.slice(-5);
      
      const isChronicallyOverconfident = recentWindow.every(item => item.data.calibrationState === 'OVERCONFIDENT');
      const isWorsening = recentWindow.length >= 2 && 
        (recentWindow[0].data.avgSuccessError > recentWindow[recentWindow.length - 1].data.avgSuccessError); // More negative means worse overconfidence

      if (isChronicallyOverconfident && isWorsening) {
        // Prevent duplicate active recommendations for the same target
        const existing = this.recommendations.find(r => 
          r.target === 'GOVERNANCE_POLICY' && 
          r.targetContext === `${category} strategy policy` &&
          r.status === 'PENDING_GOVERNANCE_REVIEW'
        );

        if (!existing) {
          const confidence = Math.min(0.99, 0.5 + (recentWindow.length * 0.1)); // Grows with evidence
          const rec: MetaCognitiveRecommendation = {
            id: `rec-meta-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            target: 'GOVERNANCE_POLICY',
            targetContext: `${category} strategy policy`,
            proposedAction: `Reduce preference weighting of ${category} category. Chronic overconfidence detected with worsening prediction error.`,
            rationale: `System expected high success but consistently failed over the last ${recentWindow.length} observed cycles. Error degraded from ${recentWindow[0].data.avgSuccessError} to ${recentWindow[recentWindow.length - 1].data.avgSuccessError}.`,
            supportingBeliefIds: recentWindow.map(item => item.belief.id),
            confidence: parseFloat(confidence.toFixed(2)),
            evidenceCount: recentWindow.length,
            status: 'PENDING_GOVERNANCE_REVIEW',
            createdAt: Date.now()
          };
          this.recommendations.push(rec);
          newRecommendations.push(rec);
          console.log(`\n[MetaEvaluationEngine] *** NEW RECOMMENDATION GENERATED ***`);
          console.log(`Target: ${rec.target} (${rec.targetContext})`);
          console.log(`Action: ${rec.proposedAction}`);
          console.log(`Confidence: ${rec.confidence} (Evidence: ${rec.evidenceCount})`);
        }
      }
    }

    return newRecommendations;
  }

  getRecommendations(): MetaCognitiveRecommendation[] {
    return this.recommendations;
  }
}
