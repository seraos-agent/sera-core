import { describe, expect, it } from 'vitest';
import { EventStudyEngine } from '../src/core/research/EventStudyEngine';

describe('EventStudyEngine', () => {
  it('detects configured observations without producing a trade recommendation', () => {
    const events = new EventStudyEngine().detect([
      { timestamp: 1, open: 100, high: 101, low: 99, close: 100 },
      { timestamp: 2, open: 100, high: 107, low: 100, close: 106 },
      { timestamp: 3, open: 106, high: 107, low: 99, close: 100 }
    ], { lookbackCandles: 1, thresholdPercent: 5 });
    expect(events).toEqual([{ startTimestamp: 1, endTimestamp: 2, changePercent: 6, direction: 'UP' }, { startTimestamp: 2, endTimestamp: 3, changePercent: expect.closeTo(-5.660377), direction: 'DOWN' }]);
  });
});
