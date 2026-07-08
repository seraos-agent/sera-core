import { EventTypes, StandardEvent } from '../core/events/types';
import { EventEmitter } from 'events';

/**
 * ExecutionDispatcher — The hands of Sera's intent execution.
 * 
 * Architecture Role:
 * - Domain router for execution.
 * - Receives raw action types (e.g. 'TRANSFER_FUNDS', 'CHECK_WALLET_BALANCE')
 * - Routes them to the specific domain handlers (currently GoalBridge, later GitHub, Commerce, etc.)
 * - Keeps Runtime stateless and domain-agnostic.
 */
export class ExecutionDispatcher {
  constructor(
    private eventBus: EventEmitter
  ) {
    // Listen to all intent sources
    this.eventBus.on(EventTypes.DOMAIN_GOAL_SPAWNED, this.handleGoalSpawned.bind(this));
    this.eventBus.on(EventTypes.SYSTEM_TRIGGER_FIRED, this.handleTriggerFired.bind(this));
  }

  private handleGoalSpawned(event: StandardEvent): void {
    const { intent, parameters, requestId } = event.payload;
    // Normalize intent from DialogueEngine
    this.dispatch(intent, parameters, { triggerId: requestId });
  }

  private handleTriggerFired(event: StandardEvent): void {
    const { action, actionPayload, triggerId } = event.payload;
    // Normalize intent from TriggerEngine
    this.dispatch(action, actionPayload, { triggerId });
  }

  /**
   * Dispatches the action to the appropriate domain capability.
   */
  public dispatch(actionType: string, payload: Record<string, any>, context: Record<string, any>): void {
    console.log(`[ExecutionDispatcher] Routing action: ${actionType}`);

    try {
      this.eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
        id: `dispatch-${Date.now()}`,
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'ExecutionDispatcher',
        payload: {
          actionType,
          actionPayload: payload,
          context
        },
        timestamp: Date.now()
      } as StandardEvent);
    } catch (err: any) {
      console.error(`[ExecutionDispatcher] Error during dispatch of ${actionType}:`, err.message);
    }
  }
}
