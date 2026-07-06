import { EventEmitter } from 'events';
import { EventTypes, StandardEvent, TemporalTickPayload } from '../events/types';

/**
 * TemporalClockService — The beating heart of SERA's time progression.
 * 
 * Architecture Role:
 * - Emits `temporal.tick` events at a configured interval.
 * - Externalizes time progression away from domain engines (like TriggerEngine).
 * - Always uses UTC for canonical system time.
 */
export class TemporalClockService {
  private tickInterval: NodeJS.Timeout | null = null;

  constructor(
    private eventBus: EventEmitter,
    private tickRateMs: number = 60000 // default to 1 minute to avoid noisy O(n) evals, but can be configured
  ) {}

  start(): void {
    if (this.tickInterval) return;

    console.log(`[TemporalClockService] Started. Emitting temporal.tick every ${this.tickRateMs}ms (UTC Native).`);
    
    // Emit immediate tick on boot
    this.emitTick();

    this.tickInterval = setInterval(() => {
      this.emitTick();
    }, this.tickRateMs);
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      console.log(`[TemporalClockService] Stopped.`);
    }
  }

  private emitTick(): void {
    const nowUtc = Date.now();
    const event: StandardEvent<TemporalTickPayload> = {
      id: `evt-tick-${nowUtc}`,
      type: EventTypes.TEMPORAL_TICK,
      source: 'TemporalClockService',
      timestamp: nowUtc,
      payload: {
        timestampUtc: nowUtc
      }
    };

    // Note: We use fire-and-forget publish to the event bus
    this.eventBus.emit(EventTypes.TEMPORAL_TICK, event);
  }
}
