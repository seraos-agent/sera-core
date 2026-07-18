import { describe, expect, it } from 'vitest';
import { WorkerCapabilityRegistry } from '../src/core/work-classification/WorkerCapabilityRegistry';

describe('WorkerCapabilityRegistry', () => {
  it('prevents specialist workers from being placed in incompatible work lanes', () => {
    const registry = new WorkerCapabilityRegistry();
    registry.register({ id: 'ui', lane: 'DETERMINISTIC_UI', supportedWorkClasses: ['INSTANT_UI'] });
    expect(registry.require('INSTANT_UI').id).toBe('ui');
    expect(() => registry.register({ id: 'wrong', lane: 'DETERMINISTIC_UI', supportedWorkClasses: ['COMPLEX'] })).toThrow(/cannot serve/);
    expect(() => registry.require('COMPLEX')).toThrow(/No registered worker/);
  });
});
