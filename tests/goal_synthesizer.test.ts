import { describe, expect, it } from 'vitest';
import { GoalSynthesizer } from '../src/core/intents/GoalSynthesizer';
import { ProposalGovernance } from '../src/core/intents/ProposalGovernance';
import { GoalProposal, Intent, RepresentationGap } from '../src/core/intents/types';

const intent: Intent = {
  id: 'intent-1',
  description: 'Reduce operational risk before deployment.',
  status: 'ALIVE',
  terminality: 'DISCRETE',
  createdAt: 1
};

const gap: RepresentationGap = {
  intentId: intent.id,
  reason: 'NO_ACTIVE_REPRESENTATION',
  detectedAt: 100
};

describe('GoalSynthesizer', () => {
  it('creates diverse, non-executable candidate strategies with reviewable DAGs', () => {
    const proposal = new GoalSynthesizer().generateProposal(intent, gap, {
      wallet: { balance: 10 },
      temporal: { now: 100 }
    });

    expect(proposal.candidates.map(candidate => candidate.category)).toEqual(['ALIGNED', 'OBJECTIVE', 'EXPLORATORY']);
    for (const candidate of proposal.candidates) {
      expect(candidate.strategy.requiresHumanApproval).toBe(true);
      expect(candidate.strategy.requiredCapabilities).toEqual([]);
      expect(candidate.strategy.steps.at(-1)?.kind).toBe('PROPOSE');
      expect(candidate.strategy.worldStateDomains).toEqual(['temporal', 'wallet']);
    }
    expect(new ProposalGovernance().evaluate(proposal).valid).toBe(true);
  });

  it('rejects a candidate plan with cyclic dependencies', () => {
    const proposal = new GoalSynthesizer().generateProposal(intent, gap, {});
    proposal.candidates[0].strategy.steps = [
      { id: 'a', kind: 'ANALYZE', title: 'A', dependsOn: ['b'] },
      { id: 'b', kind: 'PROPOSE', title: 'B', dependsOn: ['a'] }
    ];

    const result = new ProposalGovernance().evaluate(proposal as GoalProposal);
    expect(result.valid).toBe(false);
    expect(result.reasons.some(reason => reason.includes('cyclic'))).toBe(true);
  });
});
