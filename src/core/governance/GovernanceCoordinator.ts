import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../events/types';
import { GovernanceOutcomeTracker } from './GovernanceOutcomeTracker';
import { GovernanceReflectionEngine } from './GovernanceReflectionEngine';
import { CalibrationEvaluationEngine } from '../cognition/CalibrationEvaluationEngine';
import { GovernanceCalibrationEngine } from './GovernanceCalibrationEngine';
import { MetaGovernanceReview } from './MetaGovernanceReview';

export class GovernanceCoordinator {
  private tickCount = 0;
  private started = false;
  private readonly CYCLES_PER_GOVERNANCE_REVIEW = 5;

  constructor(
    private eventBus: EventEmitter,
    private governanceOutcomeTracker: GovernanceOutcomeTracker,
    private governanceReflectionEngine: GovernanceReflectionEngine,
    private calibrationEvaluationEngine: CalibrationEvaluationEngine,
    private governanceCalibrationEngine: GovernanceCalibrationEngine,
    private metaGovernanceReview: MetaGovernanceReview
  ) {}

  private readonly onTemporalTick = (_event: StandardEvent) => {
      this.tickCount++;
      if (this.tickCount % this.CYCLES_PER_GOVERNANCE_REVIEW === 0) {
        this.runGovernanceCycle();
      }
    };

  start() {
    if (this.started) return;
    this.started = true;
    this.eventBus.on(EventTypes.TEMPORAL_TICK, this.onTemporalTick);
    console.log('[GovernanceCoordinator] Started. Listening to TEMPORAL_TICK.');
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.eventBus.off(EventTypes.TEMPORAL_TICK, this.onTemporalTick);
  }

  private runGovernanceCycle() {
    console.log('\n--- [GovernanceCoordinator] Starting Meta-Reflection Cycle ---');
    try {
      // 1. Scan recent CALIBRATION records to track outcomes of past decisions
      this.governanceOutcomeTracker.evaluate();
      
      // 2. Formulate stability patterns based on outcomes
      this.governanceReflectionEngine.evaluate();
      
      // 3. Analyze system coherence to generate new MetaCognitiveRecommendations
      const recommendations = this.calibrationEvaluationEngine.evaluate();
      
      // 4. Calibrate the new recommendations using the learned patterns
      this.governanceCalibrationEngine.calibrate(recommendations);
      
      // 5. Submit calibrated recommendations for meta governance review
      for (const rec of recommendations) {
        this.metaGovernanceReview.submitRecommendation(rec);
      }
      
      console.log('--- [GovernanceCoordinator] Meta-Reflection Cycle Complete ---\n');
    } catch (e) {
      console.error('[GovernanceCoordinator] Error during governance cycle:', e);
    }
  }
}
