import { MetaMetrics, MetaEvaluationReport, MetaSignal } from './types';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { GoalEngine } from '../goals/GoalEngine';
import { SignalArbitrator } from '../feedback/SignalArbitrator';
import { CoherenceMonitor } from '../cognition/CoherenceMonitor';
import { MetaEvaluationHistory } from './MetaEvaluationHistory';

export class MetaEvaluationEngine {
  private lastMetrics: MetaMetrics | null = null;
  private totalCycles = 0;
  
  // Accumulated stats over the window
  private windowSuccesses = 0;
  private windowFailures = 0;
  private windowCost = 0;
  private windowConflicts = 0;
  private windowContradictions = 0;

  constructor(
    private memoryStore: IWorkingMemory,
    private goalEngine: GoalEngine,
    private arbitrator: SignalArbitrator,
    private coherenceMonitor: CoherenceMonitor,
    private history?: MetaEvaluationHistory
  ) {}

  getHistory(): MetaEvaluationHistory | undefined {
    return this.history;
  }

  recordCycleOutcome(success: boolean, cost: number, contradictions: number, conflicts: number): void {
    this.totalCycles++;
    if (success) this.windowSuccesses++;
    else this.windowFailures++;
    this.windowCost += cost;
    this.windowContradictions += contradictions;
    this.windowConflicts += conflicts;
  }

  evaluate(): MetaEvaluationReport {
    console.log(`\n[MetaEvaluationEngine] Starting longitudinal meta-evaluation at cycle ${this.totalCycles}...`);
    
    // Simulate complex longitudinal metrics
    const total = this.windowSuccesses + this.windowFailures;
    const successRate = total > 0 ? this.windowSuccesses / total : 0;
    
    // LES = improvement_rate_in_success + reduction_in_failures + prediction_accuracy_gain
    const LES = successRate + (1.0 - (this.windowFailures / Math.max(1, total))); 

    // GEI = goal_completion_speed * cost_efficiency * success_rate
    const costEfficiency = this.windowCost > 0 ? (total / this.windowCost) : 1;
    const GEI = successRate * costEfficiency;

    // AAS = correct_signal_resolution_rate - misclassification_rate
    const AAS = Math.max(0, 1.0 - (this.windowConflicts * 0.1));

    // BSI = belief_confidence_consistency_over_time - contradiction_volatility
    const beliefs = this.memoryStore.getAllBeliefs();
    const confirmedCount = beliefs.filter(b => b.epistemicStatus === 'CONFIRMED').length;
    const BSI = (confirmedCount / Math.max(1, beliefs.length)) - (this.windowContradictions * 0.1);

    // SDS = divergence_from_historical_optimal_behavior
    let SDS = 0;
    if (this.lastMetrics) {
      SDS = Math.max(0, this.lastMetrics.LES - LES) + Math.max(0, this.lastMetrics.AAS - AAS);
    }

    const metrics: MetaMetrics = { LES, GEI, AAS, BSI, SDS };
    
    // Determine Trends
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (this.lastMetrics) {
      if (SDS > 0.3) trend = 'degrading';
      else if (LES > this.lastMetrics.LES) trend = 'improving';
    }

    // Generate Meta Signals
    const recommendedMetaSignals: MetaSignal[] = [];
    
    if (SDS > 0.3) {
      recommendedMetaSignals.push({
        type: 'flag_system_drift',
        severity: SDS,
        context: 'System is diverging from optimal behavior.'
      });
      recommendedMetaSignals.push({
        type: 'reduce_exploration_bias',
        severity: 0.8,
        context: 'Restricting exploration to stabilize drift.'
      });
    }
    
    if (BSI < 0.5) {
      recommendedMetaSignals.push({
        type: 'increase_stability_weight',
        severity: 0.6,
        context: 'Beliefs are volatile. Increasing stability weights.'
      });
    }

    if (AAS < 0.6) {
      recommendedMetaSignals.push({
        type: 'adjust_arbitration_sensitivity',
        severity: 0.7,
        context: 'Arbitration is inaccurate. Adjusting sensitivity.'
      });
    }

    // Reset window
    this.windowSuccesses = 0;
    this.windowFailures = 0;
    this.windowCost = 0;
    this.windowContradictions = 0;
    this.windowConflicts = 0;

    this.lastMetrics = metrics;

    const report: MetaEvaluationReport = {
      timestamp: Date.now(),
      metrics,
      trends: trend,
      recommendedMetaSignals
    };

    if (this.history) {
      this.history.record(report);
    }

    // Auto-apply signals
    report.recommendedMetaSignals.forEach(sig => {
      if (sig.type === 'reduce_exploration_bias') this.coherenceMonitor.applyMetaSignal(sig);
      if (sig.type === 'adjust_arbitration_sensitivity') this.arbitrator.applyMetaSignal(sig);
      if (sig.type === 'increase_stability_weight') this.goalEngine.applyMetaSignal(sig);
    });

    return report;
  }
}
