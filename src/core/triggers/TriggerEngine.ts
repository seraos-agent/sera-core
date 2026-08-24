import { TriggerStore, Trigger, TemporalCondition } from './types';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent, TemporalTickPayload } from '../events/types';
import { CronExpressionParser } from 'cron-parser';

export class TriggerEngine {
  private cycleCount = 0;
  private started = false;
  private readonly temporalTickListener = (event: StandardEvent<TemporalTickPayload>) => this.handleTemporalTick(event);

  constructor(
    private store: TriggerStore,
    private eventBus: EventEmitter
  ) {}

  /**
   * Starts the evaluation engine by listening to TemporalClockService ticks.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    console.log(`[TriggerEngine] Brain of "WHEN" started. Subscribing to temporal.tick...`);
    this.eventBus.on(EventTypes.TEMPORAL_TICK, this.temporalTickListener);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    console.log(`[TriggerEngine] Stopped.`);
    this.eventBus.off(EventTypes.TEMPORAL_TICK, this.temporalTickListener);
  }

  /**
   * Register a new trigger into the system.
   */
  register(trigger: Trigger): void {
    if (trigger.condition?.type === 'RECURRING' && trigger.condition?.internalCompiled) {
      try {
        const interval = CronExpressionParser.parse(trigger.condition.internalCompiled, {
          currentDate: new Date(),
          tz: 'UTC'
        });
        trigger.nextExecutionUtc = interval.next().getTime();
      } catch (e: any) {
        console.error(`[TriggerEngine] Failed to compute initial nextExecutionUtc for ${trigger.id}:`, e.message);
      }
    }
    this.store.save(trigger);
    console.log(`[TriggerEngine] Registered new trigger: ${trigger.id} (State: ${trigger.state}, Next: ${trigger.nextExecutionUtc ? new Date(trigger.nextExecutionUtc).toISOString() : 'N/A'})`);
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
        // Deterministic schedule check via nextExecutionUtc
        if (trigger.nextExecutionUtc) {
          return nowUtc >= trigger.nextExecutionUtc;
        }

        // Fallback for legacy or newly deserialized triggers missing nextExecutionUtc
        try {
          const interval = CronExpressionParser.parse(cond.internalCompiled, {
            currentDate: new Date(nowUtc),
            tz: 'UTC'
          });
          const next = interval.next().getTime();
          trigger.nextExecutionUtc = next;
          this.store.save(trigger);
        } catch (e: any) {
          console.error(`[TriggerEngine] Invalid cron expression "${cond.internalCompiled}" for trigger ${trigger.id}:`, e.message);
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

    // Compute NEXT execution time for recurring triggers BEFORE publishing event
    if (trigger.condition?.type === 'RECURRING' && trigger.condition?.internalCompiled) {
      try {
        const interval = CronExpressionParser.parse(trigger.condition.internalCompiled, {
          currentDate: new Date(Date.now()),
          tz: 'UTC'
        });
        trigger.nextExecutionUtc = interval.next().getTime();
        console.log(`[TriggerEngine] Trigger ${trigger.id} next execution scheduled at: ${new Date(trigger.nextExecutionUtc).toISOString()}`);
      } catch (e: any) {
        console.error(`[TriggerEngine] Failed to compute nextExecutionUtc for ${trigger.id}:`, e.message);
      }
    }

    this.store.save(trigger);

    console.log(`[TriggerEngine] ⚡ TRIGGER FIRED: ${trigger.id} -> ${trigger.action.type}`);

    // 2. Publish Execution Event
    this.eventBus.emit(EventTypes.SYSTEM_TRIGGER_FIRED, {
      id: `evt-trg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: EventTypes.SYSTEM_TRIGGER_FIRED,
      source: 'TriggerEngine',
      timestamp: Date.now(),
      payload: {
        triggerId: trigger.id,
        action: trigger.action.type, // This is the payload to the ExecutionDispatcher
        targetId: trigger.action.targetId,
        actionPayload: trigger.action.payload, // The actual intent parameters
        context
      }
    });

    // 3. Post-execution lifecycle transition
    if (trigger.firePolicy === 'ONCE') {
      trigger.state = 'COMPLETED';
      console.log(`[TriggerEngine] Trigger ${trigger.id} policy was ONCE. State -> COMPLETED.`);
    } else {
      trigger.state = 'ACTIVE';
    }
    
    this.store.save(trigger);

    // Emit event so the server socket and Active Intent Stream update in real-time
    this.eventBus.emit('system.trigger.registered', {
      id: `evt-trg-fired-${Date.now()}`,
      type: 'system.trigger.registered',
      source: 'TriggerEngine',
      timestamp: Date.now(),
      payload: trigger
    });
  }
}
