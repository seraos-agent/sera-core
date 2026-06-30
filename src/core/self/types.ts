export interface SelfModelSnapshot {
  id: string;
  
  // Aggregate Metrics
  activeGoalCount: number;
  orphanGoalCount: number;
  dominantGoalIds: string[];
  
  // Systemic Friction
  globalTensionDensity: number; // Percentage 0-100
  
  // Temporal & Semantic State
  recentDriftIds: string[];
  activeInterpretationIds: string[];
  
  // Meta
  snapshotTimestamp: number;
}
