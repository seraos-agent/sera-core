import { describe, expect, it } from 'vitest';
import { ResearchHypothesisBuilder } from '../src/core/research/ResearchHypothesisBuilder';
/** Safe deployment-health scenario: local-only, no provider or exchange access. */
describe('system health scenario', () => {
  it('keeps research inside its declared boundaries', () => {
    const research = new ResearchHypothesisBuilder().build([
      { timestamp: 1, open: 100, high: 100, low: 100, close: 100 },
      { timestamp: 2, open: 106, high: 106, low: 106, close: 106 }
    ], { lookbackCandles: 1, thresholdPercent: 5 });
    expect(research.status).toBe('HYPOTHESIS');
    expect(research.limitations.join(' ')).toMatch(/not a trading signal/i);
  });
});
