export interface CoherenceState {
  score: number;
  explorationMode: boolean;
  verificationStrictness: 'NORMAL' | 'HIGH';
  autonomyLevel: 'NORMAL' | 'RESTRICTED';
  beliefReliance: 'ALL' | 'CONFIRMED_ONLY';
}

export class CoherenceMonitor {
  private score: number = 1.0;
  private THRESHOLD = 0.6;
  
  updateCoherence(delta: number): void {
    this.score = Math.max(0.0, Math.min(1.0, this.score + delta));
    console.log(`[CoherenceMonitor] System Coherence Score updated to: ${this.score.toFixed(2)}`);
  }
  
  getState(): CoherenceState {
    const isStable = this.score >= this.THRESHOLD;
    return {
      score: this.score,
      explorationMode: isStable,
      verificationStrictness: isStable ? 'NORMAL' : 'HIGH',
      autonomyLevel: isStable ? 'NORMAL' : 'RESTRICTED',
      beliefReliance: isStable ? 'ALL' : 'CONFIRMED_ONLY'
    };
  }

  applyMetaSignal(signal: any): void {
    if (signal.type === 'reduce_exploration_bias') {
      console.log(`[CoherenceMonitor] Applied MetaSignal: Adjusting Coherence threshold to be more strict.`);
      this.THRESHOLD = Math.min(0.9, this.THRESHOLD + (signal.severity * 0.2));
    }
  }
}
