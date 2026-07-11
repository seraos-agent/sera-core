import { EventEmitter } from 'events';
import { EventTypes, StandardEvent, MemoryItemMutatedPayload, GoalResultPayload } from '../events/types';
import { ExecutionEvent } from '../execution/aios_types';
import { MetricsStore } from './MetricsStore';
import { MemoryStatus } from '../memory/MemoryItem';
import { GovernanceDecision, GovernanceOutcomeRecord, GovernancePattern } from '../cognition/types';

export class MetricsAggregator {
  constructor(
    private eventBus: EventEmitter,
    private store: MetricsStore
  ) {
    this.setupListeners();
    console.log('[MetricsAggregator] Initialized and listening for telemetry events.');
  }

  private setupListeners() {
    // 1. Memory Events
    this.eventBus.on(EventTypes.MEMORY_ITEM_MUTATED, (event: StandardEvent<MemoryItemMutatedPayload>) => {
      const metrics = this.store.getMetrics().memory;
      const { previousStatus, newStatus } = event.payload;
      
      let verified = metrics.verified;
      let superseded = metrics.superseded;
      let invalidated = metrics.invalidated;

      // Decrement old status
      if (previousStatus === MemoryStatus.ACTIVE) verified--;
      if (previousStatus === MemoryStatus.SUPERSEDED) superseded--;
      if (previousStatus === MemoryStatus.INVALIDATED) invalidated--;

      // Increment new status
      if (newStatus === MemoryStatus.ACTIVE) verified++;
      if (newStatus === MemoryStatus.SUPERSEDED) superseded++;
      if (newStatus === MemoryStatus.INVALIDATED) invalidated++;

      this.store.updateMemory({ verified, superseded, invalidated });
    });

    // 2. Governance Decision Events
    this.eventBus.on(EventTypes.GOVERNANCE_DECISION_RECORDED, (event: StandardEvent<GovernanceDecision>) => {
      const metrics = this.store.getMetrics().governance;
      let { actionsReviewed, allowed, confirmationRequired, denied } = metrics;
      
      actionsReviewed++;
      
      const decision = event.payload.decision;
      if (decision === 'APPROVED') allowed++;
      if (decision === 'REJECTED') denied++;
      // Note: 'MODIFIED' and 'REQUIRES_CONFIRMATION' depend on specific domain outputs, not standard Decisions
      
      this.store.updateGovernance({ actionsReviewed, allowed, confirmationRequired, denied });
    });

    // 3. Governance Outcome Events
    this.eventBus.on(EventTypes.GOVERNANCE_OUTCOME_RECORDED, (event: StandardEvent<GovernanceOutcomeRecord>) => {
      const metrics = this.store.getMetrics().governance;
      let { falsePositive, falseNegative } = metrics;
      
      // If a decision was approved but outcome was HARMFUL -> False Positive
      // If a decision was denied but would have been BENEFICIAL -> False Negative (Hard to observe, but structurally possible)
      // For now we track known harmful outcomes as false positives
      if (event.payload.outcomeAssessment === 'HARMFUL') {
        falsePositive++;
      }
      
      this.store.updateGovernance({ falsePositive, falseNegative });
    });

    // 4. Governance Pattern Events (Reflection)
    this.eventBus.on(EventTypes.GOVERNANCE_PATTERN_RECORDED, (event: StandardEvent<GovernancePattern>) => {
      const metrics = this.store.getMetrics().reflection;
      let { observedExperiences, patternsLearned, wrongPatterns, calibrationDelta } = metrics;
      
      patternsLearned++;
      observedExperiences += event.payload.observations; // Approximate total experiences
      
      if (event.payload.contradictoryObservations > 0) {
        wrongPatterns++;
      }
      
      this.store.updateReflection({ observedExperiences, patternsLearned, wrongPatterns, calibrationDelta });
    });

    // 5. Worker Success Rate
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, (event: StandardEvent<GoalResultPayload>) => {
      const metrics = this.store.getMetrics().worker;
      let { success, failure, goalCompletionRate } = metrics;
      
      if (event.payload.success) {
        success++;
      } else {
        failure++;
      }
      
      const total = success + failure;
      if (total > 0) {
        goalCompletionRate = success / total;
      }
      
      this.store.updateWorker({ success, failure, goalCompletionRate });
    });

    // 6. Execution Trace Metrics
    this.eventBus.on('system.execution.completed', (event: ExecutionEvent) => {
      const metrics = this.store.getMetrics().execution;
      let { totalExecuted, avgLatencyMs } = metrics;

      totalExecuted++;
      
      const newLatency = event.payload?.latencyMs;
      if (newLatency !== undefined) {
        // Moving average
        avgLatencyMs = ((avgLatencyMs * (totalExecuted - 1)) + newLatency) / totalExecuted;
      }
      
      this.store.updateExecution({ totalExecuted, avgLatencyMs });
    });
  }
}
