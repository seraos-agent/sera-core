import { EventEmitter } from 'events';
import { ICommunicationAdapter, CommunicationAction } from '../types';
import { SlackObservationTranslator } from './SlackObservationTranslator';
import { EventTypes, StandardEvent } from '../../../core/events/types';

/**
 * SlackAdapter
 *
 * Transport adapter for Slack Bolt (Socket Mode).
 * - Receives raw Slack events via Socket Mode WebSocket.
 * - Passes them to SlackObservationTranslator (zero cognitive logic here).
 * - Emits COMMUNICATION_OBSERVED to the EventBus.
 * - Bridges @mentions and DMs to DIALOGUE_USER_OBSERVED with _responseContext.
 * - Executes outbound CommunicationActions by calling Slack API.
 *
 * ARCHITECTURAL RULE ENFORCED:
 * Zero cognitive logic in this class. Intent detection, reasoning, and
 * planning are exclusively the responsibility of DialogueEngine and Runtime.
 *
 * When boltApp is null, the adapter runs in MOCK mode for internal testing.
 */
export class SlackAdapter implements ICommunicationAdapter {
  public readonly platform = 'slack';
  private translator!: SlackObservationTranslator;
  private resolvedBotUserId: string;

  constructor(
    private boltApp: any,            // Injected App instance from @slack/bolt (or null for mock)
    private eventBus: EventEmitter,
    botUserId: string = 'UNKNOWN'
  ) {
    this.resolvedBotUserId = botUserId;
    this.translator = new SlackObservationTranslator(this.resolvedBotUserId);
  }

  public async start(): Promise<void> {
    if (!this.boltApp) {
      console.warn('[SlackAdapter] No Bolt app provided. Running in MOCK mode.');
      return;
    }

    // Auto-discover the bot user ID so we can correctly detect self-mentions
    try {
      const authResult = await this.boltApp.client.auth.test();
      this.resolvedBotUserId = authResult.user_id as string;
      // Rebuild translator with the real bot user ID
      this.translator = new SlackObservationTranslator(this.resolvedBotUserId);
      console.log(`[SlackAdapter] Bot user ID resolved: ${this.resolvedBotUserId} (@${authResult.user})`);
    } catch (err: any) {
      console.error('[SlackAdapter] Failed to resolve bot user ID via auth.test:', err.message);
      console.warn('[SlackAdapter] Mention detection may be unreliable without a valid bot user ID.');
    }

    // Register Bolt message listener — receives all messages the bot can see
    this.boltApp.message(async ({ message }: any) => {
      this.handleRawEvent(message);
    });

    // Register app_mention listener for explicit @Sera mentions in channels.
    // This fires even in channels where the bot is not a full member.
    this.boltApp.event('app_mention', async ({ event }: any) => {
      this.handleRawEvent(event);
    });

    console.log('[SlackAdapter] Started. Listening to Slack Socket Mode events.');
  }

  public async stop(): Promise<void> {
    if (this.boltApp) {
      try {
        await this.boltApp.stop();
        console.log('[SlackAdapter] Bolt app stopped.');
      } catch (err: any) {
        console.error('[SlackAdapter] Error during stop:', err.message);
      }
    }
  }

  private handleRawEvent(rawEvent: any): void {
    const observation = this.translator.translate(rawEvent);
    if (!observation) {
      return; // Filtered out (bot msg, empty, noise)
    }

    // 1. Always emit universal COMMUNICATION_OBSERVED — every subscriber can react
    const event: StandardEvent = {
      id: `evt-slack-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: EventTypes.COMMUNICATION_OBSERVED,
      source: 'SlackAdapter',
      timestamp: Date.now(),
      payload: observation
    };
    this.eventBus.emit(EventTypes.COMMUNICATION_OBSERVED, event);

    // 2. Bridge to DialogueEngine only when SERA is directly addressed (@mention or DM)
    if (this.translator.shouldBridgeToDialogue(observation)) {
      this.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, {
        id: `evt-dialogue-bridge-${event.id}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'SlackAdapter',
        timestamp: Date.now(),
        payload: {
          message: observation.message,
          // _responseContext is opaque to DialogueEngine — it simply carries it forward
          // so CommunicationBridge can route the reply back to the correct channel/thread.
          _responseContext: {
            platform: 'slack',
            channelId: observation.channel.platformChannelId,
            threadRef: observation.platformTimestamp,  // Reply in-thread
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

    // [DIAGNOSTIC] Always log sendMessage call to verify it reaches the adapter
    console.log(`[SlackAdapter][DIAG] sendMessage called \u2192 channel=${action.channelId} thread=${action.threadRef ?? 'none'} text="${action.text?.substring(0, 60)}..."`);

    if (!this.boltApp) {
      // Mock mode: log and return success
      console.log(`[SlackAdapter MOCK] Would send to ${action.channelId}: "${action.text}"`);
      return { success: true, platformMessageId: `mock-msg-${Date.now()}` };
    }


    try {
      const response = await this.boltApp.client.chat.postMessage({
        channel: action.channelId,
        text: action.text,
        thread_ts: action.threadRef       // undefined → top-level; set → reply in thread
      });
      console.log(`[SlackAdapter] Message delivered to ${action.channelId} (ts: ${response.ts})`);
      return { success: true, platformMessageId: response.ts };
    } catch (error: any) {
      console.error('[SlackAdapter] Failed to send message:', error.message);
      return { success: false };
    }
  }
}
