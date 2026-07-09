import { EventEmitter } from 'events';
import { ICommunicationAdapter, CommunicationAction } from '../types';
import { SlackObservationTranslator } from './SlackObservationTranslator';
import { EventTypes, StandardEvent } from '../../../core/events/types';

/**
 * SlackAdapter
 * 
 * Manages the actual Slack Bolt App instance.
 * - Receives raw Slack events via WebSocket/HTTP.
 * - Passes them to SlackObservationTranslator.
 * - Emits COMMUNICATION_OBSERVED to the EventBus.
 * - Executes CommunicationAction by calling Slack API.
 * 
 * ARCHITECTURAL RULE ENFORCED: Zero cognitive logic here.
 */
export class SlackAdapter implements ICommunicationAdapter {
  public readonly platform = 'slack';
  private translator: SlackObservationTranslator;
  // Normally this would be `private app: App;` from @slack/bolt
  private app: any; 

  constructor(
    private boltApp: any, // Injected from server/index.ts
    private eventBus: EventEmitter,
    botUserId: string
  ) {
    this.app = boltApp;
    this.translator = new SlackObservationTranslator(botUserId);
  }

  public async start(): Promise<void> {
    if (!this.app) {
      console.warn('[SlackAdapter] No Bolt app provided. Running in mock mode.');
      return;
    }

    // Bind to Bolt app's message listener
    this.app.message(async ({ message, say }: any) => {
      this.handleRawEvent(message);
    });

    console.log('[SlackAdapter] Started and listening to Slack events.');
  }

  public async stop(): Promise<void> {
    // Stop logic
  }

  private handleRawEvent(rawEvent: any): void {
    const observation = this.translator.translate(rawEvent);
    
    if (!observation) {
      return; // Filtered out
    }

    // 1. Emit universal observation
    const event: StandardEvent = {
      id: `evt-slack-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: EventTypes.COMMUNICATION_OBSERVED,
      source: 'SlackAdapter',
      timestamp: Date.now(),
      payload: observation
    };
    
    this.eventBus.emit(EventTypes.COMMUNICATION_OBSERVED, event);

    // 2. Bridge to DialogueEngine if it's addressing SERA directly
    if (this.translator.shouldBridgeToDialogue(observation)) {
      this.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, {
        id: `evt-dialogue-${event.id}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'CommunicationBridge',
        timestamp: Date.now(),
        payload: {
          message: observation.message,
          _responseContext: {
            platform: 'slack',
            channelId: observation.channel.platformChannelId,
            threadRef: observation.platformTimestamp, // Reply in thread
            senderId: observation.sender.platformUserId
          }
        }
      } as StandardEvent);
    }
  }

  public async sendMessage(action: CommunicationAction): Promise<{ success: boolean; platformMessageId?: string }> {
    if (action.platform !== this.platform) {
      throw new Error(`[SlackAdapter] Received action for wrong platform: ${action.platform}`);
    }

    if (!this.app) {
      console.log(`[SlackAdapter MOCK] Sending to ${action.channelId}: ${action.text}`);
      return { success: true, platformMessageId: `mock-msg-${Date.now()}` };
    }

    try {
      const response = await this.app.client.chat.postMessage({
        channel: action.channelId,
        text: action.text,
        thread_ts: action.threadRef
      });
      return { success: true, platformMessageId: response.ts };
    } catch (error: any) {
      console.error('[SlackAdapter] Error sending message:', error.message);
      return { success: false };
    }
  }
}
