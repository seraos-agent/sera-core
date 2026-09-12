import { EventEmitter } from 'events';
import { EventTypes, StandardEvent, GoalResultPayload } from '../../core/events/types';
import { ICommunicationAdapter, CommunicationAction } from './types';

/**
 * CommunicationBridge — Connects Core intents to Communication Platform Adapters.
 * 
 * Architecture Role:
 * - Listens for DOMAIN_ACTION_DISPATCHED (for communication actions)
 * - Listens for DIALOGUE_AGENT_SPEAK (to route natural language responses)
 * - Routes the action to the correct registered adapter based on platform metadata
 * - Bridges raw communication observations to DialogueEngine if appropriate
 * 
 * Follows the exact same pattern as GoalBridge, but specifically for the
 * Communication Domain.
 */
export class CommunicationBridge {
  private adapters = new Map<string, ICommunicationAdapter>();

  constructor(private eventBus: EventEmitter) {
    this.setupListeners();
    console.log('[CommunicationBridge] Initialized. Listening for communication actions.');
  }

  /**
   * Register a platform adapter (e.g. ThreadsAdapter, DiscordAdapter).
   * This maintains the inversion of control: the bridge does not know
   * about specific platforms at compile time.
   */
  public registerAdapter(platform: string, adapter: ICommunicationAdapter): void {
    if (this.adapters.has(platform)) {
      console.warn(`[CommunicationBridge] Warning: Adapter for platform '${platform}' is being overwritten.`);
    }
    this.adapters.set(platform, adapter);

    // Auto-start the adapter
    adapter.start().catch(err => {
      console.error(`[CommunicationBridge] Failed to start adapter for ${platform}:`, err);
    });
    console.log(`[CommunicationBridge] Registered adapter for platform: ${platform}`);
  }

  private setupListeners(): void {
    // 1. Listen for tool-driven communication actions (e.g. SEND_MESSAGE)
    this.eventBus.on(EventTypes.DOMAIN_ACTION_DISPATCHED, this.handleDispatchedAction.bind(this));

    // 2. Listen for natural language responses from DialogueEngine
    this.eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, this.handleAgentSpeak.bind(this));
  }

  private async handleDispatchedAction(event: StandardEvent): Promise<void> {
    const payload = event?.payload || event || {};
    const actionType = payload.actionType || payload.intent;
    const actionPayload = payload.actionPayload || payload.parameters || payload || {};
    const context = payload.context || {};
    const requestId = context?.triggerId || payload.requestId || event.correlationId || `req-${Date.now()}`;

    const normalizedAction = String(actionType || '').toUpperCase();

    // Only handle communication-specific actions
    if (
      normalizedAction !== 'SEND_MESSAGE' &&
      normalizedAction !== 'SEND_NOTIFICATION' &&
      normalizedAction !== 'NOTIFY_USER' &&
      normalizedAction !== 'REMIND_USER' &&
      normalizedAction !== 'READ_CHANNEL_CONTEXT'
    ) {
      return;
    }

    console.log(`\n[CommunicationBridge] Handling action: ${actionType} (requestId: ${requestId})`);

    try {
      if (
        normalizedAction === 'SEND_MESSAGE' ||
        normalizedAction === 'SEND_NOTIFICATION' ||
        normalizedAction === 'NOTIFY_USER' ||
        normalizedAction === 'REMIND_USER'
      ) {
        await this.handleSendMessage(requestId, actionPayload);
      }
      // Future: handle READ_CHANNEL_CONTEXT
    } catch (error: any) {
      console.error(`[CommunicationBridge] Error handling action ${actionType}:`, error.message);
      this.emitResult(requestId, false, {}, error.message);
    }
  }

  private async handleSendMessage(requestId: string, payload: Record<string, any>): Promise<void> {
    const platform = payload.platform || payload._responseContext?.platform || payload.responseContext?.platform;
    const channelId = payload.channelId || payload._responseContext?.channelId || payload.responseContext?.channelId;
    const text = payload.text || payload.message || payload.content || payload.reminder || payload.taskPrompt || payload.body || '';
    const threadRef = payload.threadRef;

    if (!platform) {
      console.warn(`[CommunicationBridge] Missing target platform for SEND_MESSAGE. Payload:`, payload);
      this.emitResult(requestId, false, {}, 'Missing target platform for SEND_MESSAGE.');
      return;
    }

    if (!text || !String(text).trim()) {
      console.warn(`[CommunicationBridge] Missing message text for SEND_MESSAGE. Payload:`, payload);
      this.emitResult(requestId, false, {}, 'Missing message text for SEND_MESSAGE.');
      return;
    }

    const adapter = this.adapters.get(platform);
    if (!adapter) {
      console.warn(`[CommunicationBridge] No adapter registered for platform: ${platform}`);
      this.emitResult(requestId, false, {}, `No adapter registered for platform: ${platform}`);
      return;
    }

    const action: CommunicationAction = {
      platform,
      channelId,
      text: String(text).trim(),
      threadRef
    };

    try {
      const result = await adapter.sendMessage(action);
      this.emitResult(requestId, result.success, { platformMessageId: result.platformMessageId });
    } catch (error: any) {
      this.emitResult(requestId, false, {}, error.message);
    }
  }

  /**
   * Routes natural language responses from DialogueEngine back to the origin platform.
   */
  private async handleAgentSpeak(event: any): Promise<void> {
    const payload = event.payload || event;

    // We expect DialogueEngine to pass through the responseContext
    // If it's missing, this message is intended for the UI/Socket layer
    if (!payload || !payload.responseContext || !payload.responseContext.platform) {
      return;
    }

    const context = payload.responseContext;
    const adapter = this.adapters.get(context.platform);

    if (!adapter) {
      console.warn(`[CommunicationBridge] Cannot route reply to ${context.platform}: adapter not found.`);
      return;
    }

    console.log(`[CommunicationBridge] Routing reply to platform=${context.platform} channel=${context.channelId}`);

    const action: CommunicationAction = {
      platform: context.platform,
      channelId: context.channelId,
      text: payload.text,
      threadRef: context.threadRef,
      images: payload.images || payload.richContent?.images,
      isVoiceMessage: payload.isInterim ? false : (context.isVoiceMessage || payload.isVoiceMessage),
      richContent: payload.richContent
    };


    try {
      await adapter.sendMessage(action);
    } catch (error: any) {
      console.error(`[CommunicationBridge] Failed to route agent speak to ${context.platform}:`, error.message);
    }
  }


  private emitResult(requestId: string, success: boolean, data: Record<string, any>, errorMessage?: string): void {
    const resultPayload: GoalResultPayload = { requestId, success, data, errorMessage };
    const event: StandardEvent = {
      id: `evt-result-${Date.now()}`,
      type: EventTypes.DOMAIN_GOAL_RESULT,
      source: 'CommunicationBridge',
      correlationId: requestId,
      payload: resultPayload,
      timestamp: Date.now(),
    };
    this.eventBus.emit(EventTypes.DOMAIN_GOAL_RESULT, event);
  }
}
