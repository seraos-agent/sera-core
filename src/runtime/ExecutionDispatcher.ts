import { EventTypes, StandardEvent } from '../core/events/types';
import { EventEmitter } from 'events';
import { DynamicSocialSynthesizer } from '../capabilities/threads/DynamicSocialSynthesizer';
import { ThreadsPostHistoryStore } from '../capabilities/threads/ThreadsPostHistoryStore';

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
  private readonly dynamicSynthesizer: DynamicSocialSynthesizer;

  constructor(
    private eventBus: EventEmitter,
    private sessionId: string = 'default',
    dynamicSynthesizer?: DynamicSocialSynthesizer
  ) {
    this.dynamicSynthesizer = dynamicSynthesizer || new DynamicSocialSynthesizer({
      historyStore: new ThreadsPostHistoryStore()
    });

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

  public async dispatch(actionType: string, payload: Record<string, any>, context: Record<string, any>): Promise<void> {
    console.log(`[ExecutionDispatcher] Routing action: ${actionType}`);

    if (actionType === 'DYNAMIC_SCHEDULED_ACTION') {
      console.log(`[ExecutionDispatcher] Executing autonomous dynamic scheduled social action.`);
      const taskPrompt = payload.taskPrompt || 'Execute scheduled task.';
      const activeSession = context?.sessionId || this.sessionId || 'default';

      try {
        // 1. Synthesize the rich, non-repetitive social post with live Hyperliquid / trend sensory data
        const postText = await this.dynamicSynthesizer.generateSocialPost(
          activeSession,
          taskPrompt
        );

        if (!postText || !postText.trim()) {
          console.warn(`[ExecutionDispatcher] Generated empty post text for ${activeSession}`);
          return;
        }

        console.log(`[ExecutionDispatcher] Publishing autonomous post to Threads for ${activeSession}: "${postText}"`);

        // 2. Directly dispatch THREADS_PUBLISH to GoalBridge
        const publishRequestId = `req-auto-threads-${Date.now()}`;
        this.eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
          id: `dispatch-${Date.now()}`,
          type: EventTypes.DOMAIN_ACTION_DISPATCHED,
          source: 'ExecutionDispatcher',
          payload: {
            actionType: 'THREADS_PUBLISH',
            actionPayload: { text: postText },
            context: { sessionId: activeSession },
            requestId: publishRequestId
          },
          timestamp: Date.now()
        } as StandardEvent);

        // 3. Emit notification to user chat/dashboard so the action is visible
        this.eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
          text: `📢 **[Autonomous Scheduled Post Published to Threads]**\n\n"${postText}"`
        });
      } catch (err: any) {
        console.error(`[ExecutionDispatcher] Error executing dynamic social action:`, err.message);
      }
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
