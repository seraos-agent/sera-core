export interface PriceCandle { timestamp: number; open: number; high: number; low: number; close: number; volume?: number; }
export interface EventStudyConfig { lookbackCandles: number; thresholdPercent: number; }
export interface PriceEvent { startTimestamp: number; endTimestamp: number; changePercent: number; direction: 'UP' | 'DOWN'; }

/** Deterministic event detector. It observes price moves; it does not emit trade signals. */
export class EventStudyEngine {
  detect(candles: PriceCandle[], config: EventStudyConfig): PriceEvent[] {
    if (config.lookbackCandles < 1 || config.thresholdPercent <= 0) throw new Error('Invalid event-study configuration.');
    const events: PriceEvent[] = [];
    for (let index = config.lookbackCandles; index < candles.length; index++) {
      const start = candles[index - config.lookbackCandles];
      const end = candles[index];
      if (start.close <= 0) continue;
      const changePercent = ((end.close - start.close) / start.close) * 100;
      if (Math.abs(changePercent) >= config.thresholdPercent) {
        events.push({ startTimestamp: start.timestamp, endTimestamp: end.timestamp, changePercent, direction: changePercent >= 0 ? 'UP' : 'DOWN' });
      }
    }
    return events;
  }
}
