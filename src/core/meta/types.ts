export type MetaSignalType = 
  | 'increase_stability_weight' 
  | 'reduce_exploration_bias' 
  | 'increase_verification_threshold' 
  | 'adjust_arbitration_sensitivity' 
  | 'flag_system_drift';

export interface MetaSignal {
  type: MetaSignalType;
  severity: number; // 0 to 1
  context: string;
}

export interface MetaMetrics {
  LES: number; // Learning Effectiveness Score
  GEI: number; // Goal Execution Efficiency Index
  AAS: number; // Arbitration Accuracy Score
  BSI: number; // Belief Stability Index
  SDS: number; // System Drift Score
}

export interface MetaEvaluationReport {
  timestamp: number;
  metrics: MetaMetrics;
  trends: 'improving' | 'stable' | 'degrading';
  recommendedMetaSignals: MetaSignal[];
}
