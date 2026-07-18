import { describe, expect, it } from 'vitest';
import { ResearchHypothesisBuilder } from '../src/core/research/ResearchHypothesisBuilder';

describe('ResearchHypothesisBuilder', () => {
  it('reports observations as a hypothesis without a trade instruction', () => {
    const report = new ResearchHypothesisBuilder().build([
      { timestamp: 1, open: 100, high: 100, low: 100, close: 100 },
      { timestamp: 2, open: 100, high: 106, low: 100, close: 106 }
    ], { lookbackCandles: 1, thresholdPercent: 5 });
    expect(report).toMatchObject({ status: 'HYPOTHESIS', sampleSize: 2, upwardEvents: 1, downwardEvents: 0 });
    expect(report.limitations.join(' ')).toMatch(/not a trading signal/);
  });
});
