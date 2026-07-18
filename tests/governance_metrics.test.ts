import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { EventTypes } from '../src/core/events/types';
import { MetricsAggregator } from '../src/core/telemetry/MetricsAggregator';
import { InMemoryMetricsStore } from '../src/core/telemetry/MetricsStore';

describe('governance outcome metrics', () => {
  it('attributes false positives and negatives to the governing decision', () => {
    const eventBus = new EventEmitter();
    const store = new InMemoryMetricsStore();
    new MetricsAggregator(eventBus, store);
    const emit = (governanceDecision: 'APPROVED' | 'REJECTED', outcomeAssessment: 'HARMFUL' | 'BENEFICIAL') => eventBus.emit(EventTypes.GOVERNANCE_OUTCOME_RECORDED, {
      payload: { governanceDecision, outcomeAssessment }
    });

    emit('APPROVED', 'HARMFUL');
    emit('REJECTED', 'BENEFICIAL');
    emit('APPROVED', 'BENEFICIAL');

    expect(store.getMetrics().governance).toMatchObject({ falsePositive: 1, falseNegative: 1 });
  });
});
