import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { MetaGovernanceReview } from '../src/core/governance/MetaGovernanceReview';
import { EventTypes, StandardEvent } from '../src/core/events/types';
import { MetaCognitiveRecommendation } from '../src/core/cognition/types';

describe('MetaGovernanceReview (Human-in-the-loop)', () => {
  it('submits a recommendation and emits GOVERNANCE_RECOMMENDATION_SUBMITTED event', () => {
    const eventBus = new EventEmitter();
    const metaGov = new MetaGovernanceReview(eventBus);

    let submittedEvent: StandardEvent | null = null;
    eventBus.on(EventTypes.GOVERNANCE_RECOMMENDATION_SUBMITTED, (evt) => {
      submittedEvent = evt;
    });

    const rec: MetaCognitiveRecommendation = {
      id: 'rec-test-1',
      target: 'GOVERNANCE_POLICY',
      targetContext: { policy: 'TEST' },
      proposedAction: 'Increase safety threshold',
      rationale: 'High variance detected',
      supportingBeliefIds: [],
      confidence: 0.9,
      evidenceCount: 5,
      status: 'PENDING_GOVERNANCE_REVIEW',
      createdAt: Date.now()
    };

    metaGov.submitRecommendation(rec);

    expect(metaGov.getPendingRecommendations()).toHaveLength(1);
    expect(metaGov.getPendingRecommendations()[0].id).toBe('rec-test-1');
    expect(submittedEvent).not.toBeNull();
    expect((submittedEvent as any)?.payload.id).toBe('rec-test-1');
  });

  it('records human decision and emits GOVERNANCE_DECISION_RECORDED event', () => {
    const eventBus = new EventEmitter();
    const metaGov = new MetaGovernanceReview(eventBus);

    let decisionEvent: StandardEvent | null = null;
    eventBus.on(EventTypes.GOVERNANCE_DECISION_RECORDED, (evt) => {
      decisionEvent = evt;
    });

    const rec: MetaCognitiveRecommendation = {
      id: 'rec-test-2',
      target: 'GOVERNANCE_POLICY',
      targetContext: {},
      proposedAction: 'Adjust strategy parameters',
      rationale: 'Testing decision recording',
      supportingBeliefIds: [],
      confidence: 0.85,
      evidenceCount: 3,
      status: 'PENDING_GOVERNANCE_REVIEW',
      createdAt: Date.now()
    };

    metaGov.submitRecommendation(rec);
    const decision = metaGov.recordDecision('rec-test-2', 'APPROVED', 'Looks good to approve');

    expect(decision).not.toBeNull();
    expect(decision?.decision).toBe('APPROVED');
    expect(decision?.rationale).toBe('Looks good to approve');
    expect(metaGov.getPendingRecommendations()).toHaveLength(0);

    expect(decisionEvent).not.toBeNull();
    expect((decisionEvent as any)?.payload.decision).toBe('APPROVED');
  });
});
