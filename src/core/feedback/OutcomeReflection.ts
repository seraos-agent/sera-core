import { ExecutionTrace, OutcomeRealizationPattern } from '../execution/types';
import { MemoryStore } from '../../memory/MemoryStore';

export class OutcomeReflection {
  constructor(private memoryStore: MemoryStore) {}

  private getContextKey(trace: ExecutionTrace): string {
    // Determine context based on intent snapshot and current world state
    // For Phase 4.4 demo, we use a simple generic key
    return 'HIGH'; // Assuming volatility='HIGH' for the demo
  }

  ingest(trace: ExecutionTrace): void {
    if (!trace.intentSnapshot || !trace.intentSnapshot.originCandidateCategory || !trace.intentSnapshot.intentId) {
      return;
    }

    const intentId = trace.intentSnapshot.intentId;
    const category = trace.intentSnapshot.originCandidateCategory;
    const prediction = trace.intentSnapshot.prediction; // Extract Prediction
    const contextKey = this.getContextKey(trace);
    const isSuccess = trace.finalOutcome === 'SUCCESS';
    
    // In a full implementation, we'd calculate intentProgress based on State differentials.
    // For now, we'll map SUCCESS to 1.0, FAILED to 0.0, and partially completed could be in between.
    const intentProgress = isSuccess ? 1.0 : 0.0; 

    this.updatePattern(intentId, contextKey, category, isSuccess, intentProgress, prediction);
  }

  private updatePattern(intentId: string, contextKey: string, category: string, isSuccess: boolean, intentProgress: number, prediction: any): void {
    // Fetch the existing pattern if any
    const existingBeliefs = this.memoryStore.getBeliefsByCategory('OUTCOME_REALIZATION');
    let patternBelief = existingBeliefs.find(b => {
      try {
        return JSON.parse(b.content).intentType === intentId;
      } catch {
        return false;
      }
    });

    let pattern: OutcomeRealizationPattern;

    if (patternBelief) {
      pattern = JSON.parse(patternBelief.content);
    } else {
      pattern = {
        intentType: intentId,
        evaluationWindow: 'LONG_TERM', // Default for now
        worldContext: { volatility: contextKey },
        categoryStats: {}
      };
    }

    if (!pattern.categoryStats[category]) {
      pattern.categoryStats[category] = {
        observations: 0,
        goalSuccessRate: 0,
        intentOutcomeScore: 0,
        avgSuccessPredictionError: 0,
        avgIntentPredictionError: 0,
        recentSuccessErrors: [],
        calibrationState: 'UNCALIBRATED',
        confidence: 0.1,
        lastObservedAt: 0,
        sampleSize: 0,
        evidenceStrength: 0.1
      };
    }

    const stats = pattern.categoryStats[category];
    
    // Apply Decay before updating if it's been a long time (omitted for brevity, similar to ProposalReflection)

    // Update Moving Averages
    stats.observations += 1;
    stats.sampleSize += 1;
    stats.lastObservedAt = Date.now();
    
    // Calculate new goal success rate
    const successVal = isSuccess ? 1 : 0;
    stats.goalSuccessRate = ((stats.goalSuccessRate * (stats.observations - 1)) + successVal) / stats.observations;
    
    // Calculate new intent outcome score
    stats.intentOutcomeScore = ((stats.intentOutcomeScore * (stats.observations - 1)) + intentProgress) / stats.observations;

    // Calculate Prediction Errors if prediction exists
    let successError = 0;
    let intentError = 0;
    if (prediction) {
      successError = successVal - prediction.expectedSuccessProbability;
      intentError = intentProgress - prediction.expectedIntentProgress;
      
      stats.avgSuccessPredictionError = stats.avgSuccessPredictionError === undefined ? successError : ((stats.avgSuccessPredictionError * (stats.observations - 1)) + successError) / stats.observations;
      stats.avgIntentPredictionError = stats.avgIntentPredictionError === undefined ? intentError : ((stats.avgIntentPredictionError * (stats.observations - 1)) + intentError) / stats.observations;
      
      // Update recent errors (keep last 3)
      if (!stats.recentSuccessErrors) stats.recentSuccessErrors = [];
      stats.recentSuccessErrors.push(successError);
      if (stats.recentSuccessErrors.length > 3) stats.recentSuccessErrors.shift();
      
      // State Inference
      if (stats.sampleSize < 3) {
        stats.calibrationState = 'UNCALIBRATED';
      } else {
        const recentAvg = stats.recentSuccessErrors.reduce((a, b) => a + b, 0) / stats.recentSuccessErrors.length;
        
        // Detect Drift: if recent average differs significantly from long-term average, but long-term is still "calibrated"
        if (Math.abs(recentAvg - stats.avgSuccessPredictionError) > 0.3 && Math.abs(stats.avgSuccessPredictionError) <= 0.15) {
           stats.calibrationState = 'CALIBRATION_DRIFT';
        } else if (stats.avgSuccessPredictionError < -0.15) {
           stats.calibrationState = 'OVERCONFIDENT';
        } else if (stats.avgSuccessPredictionError > 0.15) {
           stats.calibrationState = 'UNDERCONFIDENT';
        } else {
           stats.calibrationState = 'CALIBRATED';
        }
      }

      // Explicit CALIBRATION Belief formation (Phase 4.6 doctrine: Passive Calibration Profile)
      this.memoryStore.storeBelief({
        id: `belief-calibration-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
        category: 'CALIBRATION',
        content: JSON.stringify({
          intentType: intentId,
          category,
          sampleSize: stats.sampleSize,
          avgSuccessError: parseFloat(stats.avgSuccessPredictionError.toFixed(2)),
          avgIntentError: parseFloat(stats.avgIntentPredictionError.toFixed(2)),
          calibrationState: stats.calibrationState,
          timestamp: Date.now()
        }),
        epistemicStatus: 'CONFIRMED',
        confidence: prediction.confidence || 0.8,
        evidenceIds: [],
        contradictionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      console.log(`[OutcomeReflection] Generated CALIBRATION Profile. State: ${stats.calibrationState}, AvgSuccessError: ${stats.avgSuccessPredictionError.toFixed(2)}`);
    }

    // Adjust confidence based on sample size
    stats.confidence = Math.min(1.0, 0.5 + (stats.sampleSize * 0.05));
    stats.evidenceStrength = Math.min(1.0, stats.sampleSize * 0.1);

    if (patternBelief) {
      patternBelief.content = JSON.stringify(pattern);
      patternBelief.updatedAt = Date.now();
      patternBelief.confidence = stats.confidence;
      if (stats.confidence > 0.8) {
         patternBelief.epistemicStatus = 'CONFIRMED';
      }
      this.memoryStore.updateBelief(patternBelief);
    } else {
      this.memoryStore.storeBelief({
        id: `belief-outcome-${Date.now()}`,
        category: 'OUTCOME_REALIZATION',
        content: JSON.stringify(pattern),
        epistemicStatus: stats.confidence > 0.8 ? 'CONFIRMED' : 'HYPOTHESIS',
        confidence: stats.confidence,
        evidenceIds: [],
        contradictionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    console.log(`[OutcomeReflection] Updated pattern for Intent: ${intentId}, Category: ${category}`);
    console.log(`  -> Success Rate: ${(stats.goalSuccessRate * 100).toFixed(1)}%, Intent Score: ${(stats.intentOutcomeScore * 100).toFixed(1)}%`);
  }
}
