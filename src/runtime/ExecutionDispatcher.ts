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

  private handleGoalSpawned(event: any): void {
    const payload = event?.payload || event;
    if (!payload || !payload.intent) return;
    const { intent, parameters, requestId } = payload;
    // Normalize intent from DialogueEngine
    this.dispatch(intent, parameters, { triggerId: requestId, workClass: parameters?._seraWorkClass });
  }

  private handleTriggerFired(event: any): void {
    const payload = event?.payload || event;
    if (!payload) return;
    const { action, actionPayload, triggerId } = payload;
    // Normalize intent from TriggerEngine
    this.dispatch(action || payload.intent, actionPayload || payload.parameters, { triggerId });
  }

  public dispatch(actionType: string, payload: Record<string, any>, context: Record<string, any>): void {
    console.log(`[ExecutionDispatcher] Routing action: ${actionType}`);

    if (actionType === 'DYNAMIC_SCHEDULED_ACTION') {
      console.log(`[ExecutionDispatcher] Intercepting dynamic scheduled action. Waking up DialogueEngine.`);
      const taskPrompt = payload.taskPrompt || 'Execute scheduled task.';
      
      this.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, {
        id: `evt-dyn-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'ExecutionDispatcher',
        payload: {
          message: `[SYSTEM AUTOMATION TRIGGER]: It is time for a scheduled dynamic task. Please execute the following instruction based on the current context: "${taskPrompt}". You may use web search, tools, and social media posting. Do not ask for confirmation, just do it. Keep your response brief.`,
          userMessage: `[SYSTEM AUTOMATION TRIGGER]: It is time for a scheduled dynamic task. Please execute the following instruction based on the current context: "${taskPrompt}". You may use web search, tools, and social media posting. Do not ask for confirmation, just do it. Keep your response brief.`,
          _seraWorkClass: 'CONVERSATION'
        },
        timestamp: Date.now()
      } as StandardEvent);
      return;
    }

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
