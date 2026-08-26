import { SeraTool } from '../../core/cognitive/Tool';
import { ThreadsAPI } from './ThreadsAPI';
import { SecretManager } from '../../core/secrets/SecretManager';
import { ThreadsPostHistoryStore } from './ThreadsPostHistoryStore';

export class ThreadsCapability {
  private readonly historyStore: ThreadsPostHistoryStore;

  constructor(
    private readonly api: ThreadsAPI,
    private readonly secretManager?: SecretManager,
    historyStore?: ThreadsPostHistoryStore
  ) {
    this.historyStore = historyStore || new ThreadsPostHistoryStore();
  }

  getTools(): SeraTool[] {
    return [
      {
        name: 'THREADS_PUBLISH',
        description: 'Publishes a text post to the connected Threads account. Use this to share updates or thoughts with your audience.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text content of the post to publish.' },
            imageUrl: { type: 'string', description: 'Optional. The URL of an image to attach to the post. Use this if you generated an image.' },
          },
          required: ['text'],
        },
        requiresApproval: false,
        irreversible: true,
        unsafe: true,
      },
      {
        name: 'THREADS_REPLY',
        description: 'Replies to an existing Threads post.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text content of the reply.' },
            replyToId: { type: 'string', description: 'The ID of the Threads post to reply to.' },
            imageUrl: { type: 'string', description: 'Optional. The URL of an image to attach to the reply. Use this if you generated an image.' },
          },
          required: ['text', 'replyToId'],
        },
        requiresApproval: false,
        irreversible: true,
        unsafe: true,
      }
    ];
  }

  async executeTool(name: string, args: any, context?: any): Promise<any> {
    const sessionId = context?.sessionId;
    if (!sessionId) {
      throw new Error(`[ThreadsCapability] Cannot execute ${name}: missing sessionId in context.`);
    }

    switch (name) {
      case 'THREADS_PUBLISH':
        if (this.secretManager) {
          try {
            const settingsStr = await this.secretManager.getSecret(`THREADS_SETTINGS_${sessionId}`);
            if (settingsStr) {
              const settings = JSON.parse(settingsStr);
              if (settings.allowPublishing === false) {
                return { success: false, error: "Action denied: User disabled Threads publishing in Settings." };
              }
            }
          } catch (e) {
            // ignore
          }
        }
        
        const postId = await this.api.publishPost(sessionId, args.text, undefined, args.imageUrl);
        this.historyStore.recordPost(sessionId, args.text, postId);
        return { success: true, postId, message: `Successfully published to Threads.` };
      
      case 'THREADS_REPLY':
        // Note: THREADS_REPLY is allowed even if allowPublishing is false, 
        // since VIP replies might still be enabled and require replying.
        const replyId = await this.api.publishPost(sessionId, args.text, args.replyToId, args.imageUrl);
        return { success: true, postId: replyId, message: `Successfully replied to Threads post.` };
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
