import { EventEmitter } from 'events';
import { EventTypes, StandardEvent, MemoryItemMutatedPayload, GoalResultPayload, LlmModelExecutionPayload } from '../events/types';
import { MetricsStore } from './MetricsStore';
import { MemoryStatus } from '../memory/MemoryItem';

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

    // 2. Goal & Tool Execution Success Rate
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

    // 3. LLM routing telemetry
    this.eventBus.on(EventTypes.LLM_MODEL_COMPLETED, (event: StandardEvent<LlmModelExecutionPayload>) => {
      const metrics = this.store.getMetrics().llm;
      const requests = metrics.requests + 1;
      const fallbacks = metrics.fallbacks + (event.payload.fallbackUsed ? 1 : 0);
      const avgLatencyMs = ((metrics.avgLatencyMs * (requests - 1)) + event.payload.latencyMs) / requests;
      this.store.updateLlm({
        requests,
        fallbacks,
        avgLatencyMs,
        estimatedCost: metrics.estimatedCost + event.payload.estimatedCost
      });
    });

    this.eventBus.on(EventTypes.LLM_MODEL_FAILED, (event: StandardEvent<LlmModelExecutionPayload>) => {
      const metrics = this.store.getMetrics().llm;
      this.store.updateLlm({
        failures: metrics.failures + 1,
        fallbacks: metrics.fallbacks + (event.payload.fallbackUsed ? 1 : 0)
      });
    });

    // 4. Governance outcome telemetry
    this.eventBus.on(EventTypes.GOVERNANCE_OUTCOME_RECORDED, (event: any) => {
      const { governanceDecision, outcomeAssessment } = event.payload || {};
      const current = this.store.getMetrics().governance;
      let falsePositive = current.falsePositive;
      let falseNegative = current.falseNegative;

      if (governanceDecision === 'APPROVED' && outcomeAssessment === 'HARMFUL') {
        falsePositive++;
      } else if (governanceDecision === 'REJECTED' && outcomeAssessment === 'BENEFICIAL') {
        falseNegative++;
      }

      this.store.updateGovernance({ falsePositive, falseNegative });
    });
  }
}
