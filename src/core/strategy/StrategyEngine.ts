import { StrategyStore } from './StrategyStore';
import { StrategyProfile } from './types';
import { MetaEvaluationHistory } from '../meta/MetaEvaluationHistory';
import { TemporalContext } from '../temporal/types';

export class StrategyEngine {
  private strategyStore: StrategyStore;
  
  // Track consecutive cycles of negative trends
  private negativeTrendCounter = 0;
  private readonly NEGATIVE_TREND_THRESHOLD = 3;

  constructor(strategyStore: StrategyStore) {
    this.strategyStore = strategyStore;
  }

  evaluateEpoch(metaHistory: MetaEvaluationHistory, tc?: TemporalContext) {
    const latestReport = metaHistory.getLatestReport();
    if (!latestReport) return;

    const currentProfile = this.strategyStore.getActiveProfile();

    console.log(`\n[StrategyEngine] Evaluating Epoch...`);
    
    const now = tc ? tc.physicalTime : Date.now();

    // Check if the trend is negative
    if (latestReport.trends === 'degrading') {
      this.negativeTrendCounter++;
      console.log(`[StrategyEngine] Warning: Degrading trend detected. Counter: ${this.negativeTrendCounter}/${this.NEGATIVE_TREND_THRESHOLD}`);
    } else if (latestReport.trends === 'improving') {
      this.negativeTrendCounter = Math.max(0, this.negativeTrendCounter - 1);
    }

    // Logic to transition strategy
    if (currentProfile.name === 'AGGRESSIVE_EXPLORATION') {
      // If aggressive strategy is causing sustained failure, downgrade to CONSERVATIVE
      if (this.negativeTrendCounter >= this.NEGATIVE_TREND_THRESHOLD) {
        const newProfile: StrategyProfile = {
          id: `strat-${now}-conservative`,
          name: 'RESOURCE_CONSERVATION',
          epochStart: now,
          planningConstraints: {
            maxStepsPerPlan: 2, // strictly limit depth
            allowUntestedTools: false
          },
          behavioralParameters: {
            riskTolerance: 0.1,
            costSensitivity: 0.9,
            budgetPacing: 20 // strict pacing
          }
        };
        
        this.strategyStore.recordTransition(
          newProfile, 
          'Sustained negative MetaEvaluation trend under AGGRESSIVE_EXPLORATION',
          latestReport
        );
        this.negativeTrendCounter = 0; // reset counter after transition
      }
    } 
    // Additional transition logic for other modes could be added here
  }
}
