export type ControlSignalType = 
  | 'failure_rate_spike' 
  | 'repeated_success_pattern' 
  | 'cost_overrun' 
  | 'verification_mismatch' 
  | 'contradiction_detected' 
  | 'execution_delay_anomaly';

export interface ControlSignal {
  type: ControlSignalType;
  signalConfidence: number; // 0-1
  reasoning: string;
  supportingEvidence: string[]; // e.g. trace IDs
  severity: number; // 0-1
}
