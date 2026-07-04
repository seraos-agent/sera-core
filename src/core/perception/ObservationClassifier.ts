import { EventEmitter } from 'events';
import { EventTypes, StandardEvent, CognitiveObservationPayload } from '../events/types';

/**
 * Interface representing the classification result.
 */
export interface ClassificationResult {
  score: number;
  observation?: CognitiveObservationPayload;
}

/**
 * ObservationClassifier intercepts broad domain events and determines
 * if they should be promoted to COGNITIVE_OBSERVATION events based on a scoring threshold.
 */
export class ObservationClassifier {
  private readonly eventBus: EventEmitter;
  private readonly threshold: number;

  constructor(eventBus: EventEmitter, threshold: number = 0.6) {
    this.eventBus = eventBus;
    this.threshold = threshold;
    this.bindListeners();
  }

  private bindListeners() {
    // Listen to potentially relevant domain events
    this.eventBus.on(EventTypes.DOMAIN_WALLET_STATE, this.handleWalletState.bind(this));
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, this.handleGoalResult.bind(this));
    // Additional domain events (e.g., market price spikes) would be bound here
  }

  /**
   * Processes a wallet state event.
   */
  private handleWalletState(event: StandardEvent): void {
    // Mock logic: If this was a huge transfer, score it high.
    // Since we don't have delta state here yet, we'll assign a baseline score.
    // For demonstration, let's say it's just state sync noise and scores low (0.1)
    const result: ClassificationResult = { score: 0.1 };

    this.evaluateAndEmit(result, event);
  }

  /**
   * Processes a goal execution result.
   */
  private handleGoalResult(event: StandardEvent): void {
    const payload = event.payload;
    
    // An executed goal is usually actionable and highly relevant to the user.
    let score = 0.0;
    let observation: CognitiveObservationPayload | undefined;

    if (payload.success) {
      score = 0.9;
      const asset = payload.data?.asset?.toUpperCase() || 'assets';
      const network = payload.data?.network || 'blockchain';
      observation = {
        title: "Transfer Confirmed",
        desc: `Successfully executed movement of ${asset} on ${network}.`,
        signal: "On-chain execution",
        color: "#10b981" // Green
      };
    } else {
      score = 0.8;
      observation = {
        title: "Execution Reverted",
        desc: payload.errorMessage || "Network rejected the scheduled action.",
        signal: "Execution failure",
        color: "#ef4444" // Red
      };
    }

    this.evaluateAndEmit({ score, observation }, event);
  }

  /**
   * Evaluates the classification score and emits a COGNITIVE_OBSERVATION if it meets the threshold.
   */
  private evaluateAndEmit(result: ClassificationResult, originalEvent: StandardEvent): void {
    if (result.score >= this.threshold && result.observation) {
      const observationEvent: StandardEvent<CognitiveObservationPayload> = {
        id: `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: EventTypes.COGNITIVE_OBSERVATION,
        source: 'ObservationClassifier',
        correlationId: originalEvent.correlationId || originalEvent.id,
        timestamp: Date.now(),
        payload: result.observation
      };

      this.eventBus.emit(EventTypes.COGNITIVE_OBSERVATION, observationEvent);
    }
  }

  /**
   * Allows injecting a raw observation for testing and manual simulations.
   */
  public injectManualObservation(observation: CognitiveObservationPayload): void {
    const observationEvent: StandardEvent<CognitiveObservationPayload> = {
      id: `obs-manual-${Date.now()}`,
      type: EventTypes.COGNITIVE_OBSERVATION,
      source: 'ManualInjection',
      timestamp: Date.now(),
      payload: observation
    };
    this.eventBus.emit(EventTypes.COGNITIVE_OBSERVATION, observationEvent);
  }
}
