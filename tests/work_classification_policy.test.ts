import { describe, expect, it } from 'vitest';
import { WorkClassificationPolicy } from '../src/core/work-classification/WorkClassificationPolicy';

describe('WorkClassificationPolicy', () => {
  const policy = new WorkClassificationPolicy();
  it('routes UI changes to OPERATIONAL for native tool execution', () => {
    expect(policy.classify('ubah mode menjadi dark')).toMatchObject({ workClass: 'OPERATIONAL', allowTools: true, allowSwarm: false });
  });
  it('escalates coding and trading through different universal safeguards', () => {
    expect(policy.classify('audit dan refactor codebase')).toMatchObject({ workClass: 'COMPLEX', allowSwarm: true, requiresHumanApproval: true });
    expect(policy.classify('buy BTC sekarang')).toMatchObject({ workClass: 'HIGH_RISK', allowTools: true, allowSwarm: false, requiresHumanApproval: true });
  });
});
