import { SeraTool } from '../../core/cognitive/Tool';

/**
 * CommunicationToolCapability — Registers platform-agnostic communication
 * tools into the CapabilityCatalog.
 * 
 * These tools are what the LLM sees. The LLM decides to call SEND_MESSAGE,
 * and the CommunicationBridge routes it to the correct platform adapter
 * based on the response context metadata.
 * 
 * No platform-specific tool names (e.g. SEND_SLACK_MESSAGE) — the platform
 * is metadata, not identity.
 */
export class CommunicationToolCapability {

  public getTools(): SeraTool[] {
    return [
      {
        name: 'SEND_MESSAGE',
        description: 'Send a message to a communication channel (Slack, Discord, etc). Use this when SERA needs to proactively communicate or reply to a user on an external platform.',
        parameters: {
          type: 'object',
          properties: {
            channelId: {
              type: 'string',
              description: 'The platform-agnostic channel ID to send the message to'
            },
            text: {
              type: 'string',
              description: 'The message text to send'
            },
            threadRef: {
              type: 'string',
              description: 'Optional thread reference to reply within a thread'
            },
            platform: {
              type: 'string',
              description: 'The target platform (e.g. slack, discord). Defaults to the platform of the current conversation context.'
            }
          },
          required: ['text']
        },
        requiresApproval: true
      },
      {
        name: 'READ_CHANNEL_CONTEXT',
        description: 'Retrieve recent context from a communication channel. Use this when SERA needs to understand what has been discussed in a channel.',
        parameters: {
          type: 'object',
          properties: {
            channelId: {
              type: 'string',
              description: 'The channel ID to read context from'
            },
            platform: {
              type: 'string',
              description: 'The platform to read from (e.g. slack, discord)'
            },
            limit: {
              type: 'number',
              description: 'Number of recent messages to retrieve (default: 10)'
            }
          },
          required: ['channelId']
        },
        requiresApproval: false
      }
    ];
  }
}
