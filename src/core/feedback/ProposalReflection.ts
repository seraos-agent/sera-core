import { ProposalTrace, IntentRealizationPattern } from '../execution/types';

export class ProposalReflection {
  private traces: ProposalTrace[] = [];
  
  // Maps intentId to the IntentRealizationPattern
  private patternCandidates: Map<string, IntentRealizationPattern> = new Map();

  // Configurable decay thresholds
  private readonly DECAY_THRESHOLD_MS = 86400000; // 1 day for demo scale (or adjust as needed)

  ingest(trace: ProposalTrace): IntentRealizationPattern | null {
    this.traces.push(trace);
    console.log(`[ProposalReflection] Ingested ProposalTrace for proposal ${trace.proposalSnapshot.id}. Outcome: ${trace.outcome}`);
    
    const intentId = trace.proposalSnapshot.parentIntentId;
    const key = `pattern-${intentId}`;
    
    let pattern = this.patternCandidates.get(key);
    if (!pattern) {
      pattern = {
        intentType: intentId,
        worldContext: trace.worldStateSnapshot,
        categoryStats: {}
      };
      this.patternCandidates.set(key, pattern);
    }

    if (trace.selectedCandidateId) {
      const candidateCategory = trace.proposalSnapshot.candidates.find((c: any) => c.id === trace.selectedCandidateId)?.category;
      if (candidateCategory) {
        let stats = pattern.categoryStats[candidateCategory];
        if (!stats) {
          stats = {
            observations: 0,
            approvalRate: 0,
            confidence: 0,
            lastObservedAt: trace.timestamp,
            sampleSize: 0,
            evidenceStrength: 0
          };
          pattern.categoryStats[candidateCategory] = stats;
        }

        stats.observations += 1;
        stats.sampleSize += 1;
        stats.lastObservedAt = trace.timestamp;
        
        if (trace.outcome === 'APPROVED') {
          stats.approvalRate = ((stats.approvalRate * (stats.observations - 1)) + 1) / stats.observations;
        } else {
          stats.approvalRate = ((stats.approvalRate * (stats.observations - 1)) + 0) / stats.observations;
        }
        
        // Simple evidence strength heuristic
        stats.evidenceStrength = Math.min(stats.observations / 5, 1.0);
        stats.confidence = stats.evidenceStrength * stats.approvalRate;
      }
    }

    this.applyDecay(trace.timestamp, pattern);

    // Check if any category has reached critical mass
    const criticalCategories = Object.values(pattern.categoryStats).filter(s => s.observations >= 3);
    
    if (criticalCategories.length > 0) {
      console.log(`[ProposalReflection] Pattern reached critical mass. Promoting to Formal Belief.`);
      return pattern;
    } else {
      console.log(`[ProposalReflection] Accumulating observations... (Need 3 in any category for belief formation).`);
      return null;
    }
  }

  private applyDecay(currentTime: number, pattern: IntentRealizationPattern): void {
    for (const [category, stats] of Object.entries(pattern.categoryStats)) {
      const ageMs = currentTime - stats.lastObservedAt;
      if (ageMs > this.DECAY_THRESHOLD_MS) {
        const decayFactor = Math.max(0.1, 1.0 - (ageMs / (this.DECAY_THRESHOLD_MS * 10)));
        stats.confidence *= decayFactor;
        stats.evidenceStrength *= decayFactor;
        console.log(`[ProposalReflection] Applied temporal decay to pattern ${pattern.intentType} category ${category}. New confidence: ${stats.confidence.toFixed(2)}`);
      }
    }
  }
}
