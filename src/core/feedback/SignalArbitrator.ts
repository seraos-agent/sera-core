import { ControlSignal } from '../signals/types';

interface ArbitrationRecord {
  signalType: string;
  weightModifier: number;
  encounters: number;
}

export class SignalArbitrator {
  private history: Map<string, ArbitrationRecord> = new Map();
  private sensitivityMultiplier = 1.0;

  arbitrate(signals: ControlSignal[]): ControlSignal[] {
    console.log(`[SignalArbitrator] Arbitrating ${signals.length} signals...`);
    const validated: ControlSignal[] = [];
    
    // In a real system, this would resolve conflicts. For now, we apply memory-adaptive weighting.
    for (const signal of signals) {
      let record = this.history.get(signal.type);
      if (!record) {
        record = { signalType: signal.type, weightModifier: 1.0, encounters: 0 };
        this.history.set(signal.type, record);
      }
      
      // Adaptive learning simulation
      record.encounters++;
      if (signal.type === 'verification_mismatch' && record.encounters > 1) {
        // Assume arbitrator learned this is often a false positive noise
        record.weightModifier = Math.max(0.1, record.weightModifier - 0.4);
        console.log(`[SignalArbitrator] Adaptive memory triggered. Reducing weight of ${signal.type} to ${record.weightModifier.toFixed(2)}`);
      }

      const netEffect = signal.severity * signal.signalConfidence * record.weightModifier * this.sensitivityMultiplier;
      
      if (netEffect > 0.3) {
        validated.push({ ...signal, severity: netEffect });
      } else {
        console.log(`[SignalArbitrator] Signal ${signal.type} discarded. Net effect (${netEffect.toFixed(2)}) too low.`);
      }
    }
    
    return validated;
  }

  applyMetaSignal(signal: any): void {
    if (signal.type === 'adjust_arbitration_sensitivity') {
      console.log(`[SignalArbitrator] Applied MetaSignal: Adjusting arbitration sensitivity.`);
      this.sensitivityMultiplier = 1.0 - (signal.severity * 0.5);
    }
  }
}
