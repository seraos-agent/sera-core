import { ObservationTranslator } from '../ObservationTranslator';
import { CommunicationObservation, UserIdentity, ChannelIdentity, WorkspaceIdentity } from '../types';

/**
 * SlackObservationTranslator
 * 
 * Normalizes raw Slack Events API payload into SERA's platform-agnostic
 * CommunicationObservation.
 */
export class SlackObservationTranslator implements ObservationTranslator {
  
  constructor(private botUserId: string) {}

  public translate(rawEvent: any): CommunicationObservation | null {
    // Basic noise filtering: ignore bot messages, hidden messages, or our own messages
    if (rawEvent.bot_id || rawEvent.hidden || rawEvent.user === this.botUserId) {
      return null;
    }

    if (!rawEvent.text || typeof rawEvent.text !== 'string') {
      return null;
    }

    const text = rawEvent.text.trim();
    
    // Check if SERA is explicitly mentioned (e.g. <@U12345>)
    const mentionString = `<@${this.botUserId}>`;
    const isMention = text.includes(mentionString);
    
    // Check if it's a DM (Slack DM channels start with 'D')
    const isDirectMessage = rawEvent.channel && rawEvent.channel.startsWith('D');

    // Remove the mention from the message content for cleaner processing
    const cleanMessage = text.replace(new RegExp(`${mentionString}\\s*`, 'g'), '').trim();

    if (!cleanMessage) {
      return null; // Empty message after stripping mention
    }

    const sender: UserIdentity = {
      id: `slack:${rawEvent.user}`,
      platform: 'slack',
      platformUserId: rawEvent.user,
      displayName: rawEvent.user, // Ideally fetched from users.info, but raw ID for now
    };

    const channel: ChannelIdentity = {
      id: `slack:${rawEvent.channel}`,
      platform: 'slack',
      platformChannelId: rawEvent.channel,
      name: rawEvent.channel, // Ideally fetched from conversations.info
      isDirectMessage
    };

    const workspace: WorkspaceIdentity = {
      id: `slack:${rawEvent.team}`,
      platform: 'slack',
      platformWorkspaceId: rawEvent.team,
      name: rawEvent.team
    };

    return {
      message: cleanMessage,
      platform: 'slack',
      sender,
      channel,
      workspace,
      threadRef: rawEvent.thread_ts,
      isMention,
      isDirectMessage,
      platformTimestamp: rawEvent.ts
    };
  }

  public shouldBridgeToDialogue(observation: CommunicationObservation): boolean {
    // Only bridge if SERA is explicitly addressed (mention or DM)
    // Ambient channel chatter stays in ObservationStore only.
    return observation.isMention || observation.isDirectMessage;
  }
}
