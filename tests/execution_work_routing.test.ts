import { describe, expect, it } from 'vitest';
import { WorkClassificationPolicy } from '../src/core/work-classification/WorkClassificationPolicy';

describe('execution work routing boundary', () => {
  it('keeps complex plans out of capability execution', () => {
    expect(new WorkClassificationPolicy().classify('refactor the codebase').workClass).toBe('COMPLEX');
  });
});
