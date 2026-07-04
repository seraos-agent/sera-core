import { TriggerStore, Trigger, TemporalCondition } from './types';
import { ExecutionEventBus } from '../events/ExecutionEventBus';
import { EventTypes, StandardEvent, TemporalTickPayload } from '../events/types';
import cronParser from 'cron-parser';

export class TriggerEngine {
  private cycleCount = 0;

  constructor(
    private store: TriggerStore,
    private eventBus: ExecutionEventBus
  ) {}

  /**
   * Starts the evaluation engine by listening to TemporalClockService ticks.
   */
  start(): void {
    console.log(`[TriggerEngine] Brain of "WHEN" started. Subscribing to temporal.tick...`);
    this.eventBus.subscribe(EventTypes.TEMPORAL_TICK, this.handleTemporalTick.bind(this));
  }

  stop(): void {
    console.log(`[TriggerEngine] Stopped.`);
    // In a full implementation, we'd unsubscribe from the event bus here
  }

  /**
   * Register a new trigger into the system.
   */
  register(trigger: Trigger): void {
    this.store.save(trigger);
    console.log(`[TriggerEngine] Registered new trigger: ${trigger.id} (State: ${trigger.state})`);
  }

  /**
   * Evaluates time and system triggers upon receiving a clock tick.
   */
  private handleTemporalTick(event: StandardEvent<TemporalTickPayload>): void {
    this.cycleCount++;
    const nowUtc = event.payload.timestampUtc;
    
    // Only fetch ACTIVE triggers
    const activeTriggers = this.store.getActiveTriggers().filter(t => t.state === 'ACTIVE');

    for (const trigger of activeTriggers) {
      try {
        if (this.shouldFire(trigger, nowUtc)) {
          this.fire(trigger, { timestampUtc: nowUtc, cycleCount: this.cycleCount });
        }
      } catch (err) {
        console.error(`[TriggerEngine] Error evaluating trigger ${trigger.id}:`, err);
      }
    }
  }

  /**
   * Determines if a trigger condition is met at the current UTC timestamp.
   */
  private shouldFire(trigger: Trigger, nowUtc: number): boolean {
    if (trigger.type === 'SYSTEM') {
      if (trigger.condition.expression === 'system:CYCLE_COMPLETED' && trigger.condition.threshold) {
        return this.cycleCount % trigger.condition.threshold === 0;
      }
    }
    
    if (trigger.type === 'TIME') {
      const cond = trigger.condition as TemporalCondition;
      
      if (cond.type === 'EXACT') {
        if (cond.executeAfterUtc !== undefined) {
          const targetTime = typeof cond.executeAfterUtc === 'number'
            ? cond.executeAfterUtc
            : !isNaN(Number(cond.executeAfterUtc))
              ? Number(cond.executeAfterUtc)
              : new Date(cond.executeAfterUtc).getTime();
              
          if (!isNaN(targetTime) && nowUtc >= targetTime) {
            return true;
          }
        }
      } else if (cond.type === 'RECURRING' && cond.internalCompiled) {
        // Evaluate cron expression
        // We check if the current minute matches the cron schedule
        try {
          const interval = cronParser.parse(cond.internalCompiled, { utc: true } as any);
          const prev = interval.prev().getTime();
          // If the cron tick was within the last 60 seconds, fire it
          // Assuming the tick rate of TemporalClockService is 60s
          if (nowUtc - prev <= 60000 && nowUtc >= prev) {
             // To prevent double-firing in the same minute
             if (trigger.lastFiredAt && (nowUtc - trigger.lastFiredAt) < 60000) {
               return false;
             }
             return true;
          }
        } catch (e) {
          console.error(`[TriggerEngine] Invalid cron expression for trigger ${trigger.id}`);
        }
      }
    }

    return false;
  }

  /**
   * Fires the trigger by publishing to the ExecutionEventBus and updates its lifecycle state.
   */
  private fire(trigger: Trigger, context: Record<string, any>): void {
    // 1. Transition state to FIRING
    trigger.state = 'FIRING';
    trigger.lastFiredAt = Date.now();
    this.store.save(trigger);

    console.log(`[TriggerEngine] ⚡ TRIGGER FIRED: ${trigger.id} -> ${trigger.action.type}`);

    // 2. Publish Execution Event
    this.eventBus.publish({
      id: `evt-trg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: EventTypes.SYSTEM_TRIGGER_FIRED,
      source: 'TriggerEngine',
      timestamp: Date.now(),
      payload: {
        triggerId: trigger.id,
        action: trigger.action.type, // This is the payload to the ExecutionDispatcher
        targetId: trigger.action.targetId,
        context: {
          ...context,
          actionPayload: trigger.action.payload // The actual intent parameters
        }
      }
    });

    // 3. Post-execution lifecycle transition
    if (trigger.firePolicy === 'ONCE') {
      trigger.state = 'DISABLED';
      console.log(`[TriggerEngine] Trigger ${trigger.id} policy was ONCE. State -> DISABLED.`);
    } else {
      trigger.state = 'ACTIVE';
    }
    
    this.store.save(trigger);
  }
}
