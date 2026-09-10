import { SeraTool } from '../../core/cognitive/Tool';
import { ThreadsAPI, ThreadsCarouselItem, sanitizeThreadsText } from './ThreadsAPI';
import { SecretManager } from '../../core/secrets/SecretManager';
import { ThreadsPostHistoryStore } from './ThreadsPostHistoryStore';
import { GoogleDriveCapability } from '../google-drive/GoogleDriveCapability';

export class ThreadsCapability {
  private readonly historyStore: ThreadsPostHistoryStore;

  constructor(
    private readonly api: ThreadsAPI,
    private readonly secretManager?: SecretManager,
    historyStore?: ThreadsPostHistoryStore,
    private readonly googleDriveCapability?: GoogleDriveCapability
  ) {
    this.historyStore = historyStore || new ThreadsPostHistoryStore();
  }

  getTools(): SeraTool[] {
    return [
      {
        name: 'THREADS_PUBLISH',
        description: 'Publishes a post, multi-image carousel, or sequential chained thread (utas) to the connected Threads account. Supports images, videos, Google Drive assets, and chaining.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text caption or post content to publish on Threads' },
            imageUrl: { type: 'string', description: 'Optional direct image URL to attach to the post' },
            videoUrl: { type: 'string', description: 'Optional direct video URL to attach to the post' },
            driveFileName: { type: 'string', description: 'Optional filename of an image or video in Google Drive (Media & Creative folder) to bridge and publish' },
            replyToId: { type: 'string', description: 'Optional ID of an existing Threads post to reply to, creating a chained thread (utas)' },
            imageUrls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of 2 to 20 image URLs to publish as a multi-image Carousel slide post'
            },
            driveFileNames: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of filenames in Google Drive (Media & Creative folder) to publish as a Carousel slide post'
            },
            threadChain: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of follow-up post texts to publish sequentially as an atomic chained thread (utas: 1/N, 2/N, etc.)'
            }
          },
          required: ['text']
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
            imageUrl: { type: 'string', description: 'Optional. The URL of an image to attach to the reply.' },
          },
          required: ['text', 'replyToId'],
        },
        requiresApproval: false,
        irreversible: true,
        unsafe: true,
      },
      {
        name: 'THREADS_GET_POSTS',
        description: 'Retrieves the latest published posts from the connected Threads account (up to 20 posts) with timestamps and permalinks.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum number of recent posts to fetch (default: 5, max: 20)' }
          }
        },
        requiresApproval: false,
        irreversible: false,
        unsafe: false,
      },
      {
        name: 'THREADS_GET_INSIGHTS',
        description: 'Fetches live performance metrics (views, likes, replies, reposts, quotes) for a specific post or for the entire user account.',
        parameters: {
          type: 'object',
          properties: {
            postId: { type: 'string', description: 'Optional specific Threads post ID to fetch metrics for. If omitted, returns account-level insights.' }
          }
        },
        requiresApproval: false,
        irreversible: false,
        unsafe: false,
      },
      {
        name: 'THREADS_DELETE',
        description: 'Deletes a published post from the connected Threads account using its post ID, permalink URL, or shortcode.',
        parameters: {
          type: 'object',
          properties: {
            postId: { type: 'string', description: 'The ID, permalink URL, or shortcode of the Threads post to delete' },
            reason: { type: 'string', description: 'Optional reason for deleting the post' }
          },
          required: ['postId']
        },
        requiresApproval: false,
        irreversible: true,
        unsafe: false,
      }
    ];
  }

  async executeTool(name: string, args: any, context?: any): Promise<any> {
    const sessionId = typeof context === 'string' ? context : (context?.sessionId || 'default');
    return this.execute(name, args, sessionId);
  }

  async execute(name: string, args: any, sessionId: string): Promise<any> {
    switch (name) {
      case 'THREADS_PUBLISH': {
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

        // Sanitize all text to ensure no em dashes (—) or en dashes (–) appear in Threads
        if (typeof args.text === 'string') {
          args.text = sanitizeThreadsText(args.text);
        }
        if (Array.isArray(args.threadChain)) {
          args.threadChain = args.threadChain.map((t: any) => typeof t === 'string' ? sanitizeThreadsText(t) : t);
        }

        const bridgeCleanupKeys: string[] = [];

        try {
          // ── 1. Check for Carousel Publication (Multi-Image) ────────────────
          const carouselItems: ThreadsCarouselItem[] = [];

          // Process direct imageUrls
          if (Array.isArray(args.imageUrls) && args.imageUrls.length > 0) {
            for (const url of args.imageUrls) {
              if (typeof url === 'string' && url.trim()) {
                carouselItems.push({ url: url.trim(), isVideo: false });
              }
            }
          }

          // Process driveFileNames for carousel
          if (Array.isArray(args.driveFileNames) && args.driveFileNames.length > 0 && this.googleDriveCapability) {
            for (const filename of args.driveFileNames) {
              if (typeof filename === 'string' && filename.trim()) {
                const bridge = await this.googleDriveCapability.bridgeDriveMediaToCdn(sessionId, filename.trim());
                carouselItems.push({ url: bridge.publicUrl, isVideo: bridge.isVideo });
                bridgeCleanupKeys.push(bridge.fileKey);
              }
            }
          }

          let rootPostId: string;

          if (carouselItems.length >= 2) {
            // Publish Carousel
            rootPostId = await this.api.publishCarousel(sessionId, args.text, carouselItems, args.replyToId);
          } else {
            // Single Media or Text Post
            let finalImageUrl = args.imageUrl;
            let finalVideoUrl = args.videoUrl;

            if (args.driveFileName && this.googleDriveCapability) {
              const bridge = await this.googleDriveCapability.bridgeDriveMediaToCdn(sessionId, args.driveFileName);
              if (bridge.isVideo) {
                finalVideoUrl = bridge.publicUrl;
              } else {
                finalImageUrl = bridge.publicUrl;
              }
              bridgeCleanupKeys.push(bridge.fileKey);
            }

            rootPostId = await this.api.publishPost(sessionId, args.text, args.replyToId, finalImageUrl, finalVideoUrl);
          }

          this.historyStore.recordPost(sessionId, args.text, rootPostId);

          // ── 2. Check for Atomic Chained Threads (Utas) ──────────────────────
          const chainedIds: string[] = [rootPostId];

          if (Array.isArray(args.threadChain) && args.threadChain.length > 0) {
            let parentId = rootPostId;
            for (const followUpText of args.threadChain) {
              if (typeof followUpText === 'string' && followUpText.trim()) {
                const followUpId = await this.api.publishPost(sessionId, followUpText.trim(), parentId);
                this.historyStore.recordPost(sessionId, followUpText.trim(), followUpId);
                chainedIds.push(followUpId);
                parentId = followUpId;
              }
            }
          }

          // Auto-cleanup temporary CDN bridge media keys
          if (this.googleDriveCapability && bridgeCleanupKeys.length > 0) {
            for (const key of bridgeCleanupKeys) {
              this.googleDriveCapability.cleanupCdnBridge(key).catch((e: any) => {
                console.warn('[ThreadsCapability] Bridge media cleanup warning:', e.message);
              });
            }
          }

          if (chainedIds.length > 1) {
            return {
              success: true,
              postId: rootPostId,
              chainedIds,
              totalParts: chainedIds.length,
              message: `Successfully published chained thread with ${chainedIds.length} parts to Threads.`
            };
          }

          return {
            success: true,
            postId: rootPostId,
            message: carouselItems.length >= 2
              ? `Successfully published carousel (${carouselItems.length} slides) to Threads.`
              : `Successfully published to Threads.`
          };
        } catch (err: any) {
          return { success: false, error: err.message || 'Failed to publish to Threads.' };
        }
      }

      case 'THREADS_REPLY': {
        const replyId = await this.api.publishPost(sessionId, args.text, args.replyToId, args.imageUrl);
        return { success: true, postId: replyId, message: `Successfully replied to Threads post.` };
      }

      case 'THREADS_GET_POSTS': {
        try {
          const limit = Math.min(20, Math.max(1, Number(args.limit) || 5));
          const posts = await this.api.getUserThreads(sessionId, limit);
          return {
            success: true,
            count: posts.length,
            posts
          };
        } catch (err: any) {
          return { success: false, error: err.message || 'Failed to retrieve user threads.' };
        }
      }

      case 'THREADS_GET_INSIGHTS': {
        try {
          const targetId = args.postId || args.mediaId;
          if (targetId) {
            const postInsights = await this.api.getPostInsights(sessionId, targetId);
            return {
              success: true,
              type: 'post',
              insights: postInsights
            };
          }

          // Account-level insights
          const userInsights = await this.api.getUserInsights(sessionId);
          return {
            success: true,
            type: 'account',
            insights: userInsights
          };
        } catch (err: any) {
          return {
            success: false,
            error: `Threads Insights: ${err.message}. (Ensure account has active insights permissions or verify post ID).`
          };
        }
      }

      case 'THREADS_DELETE': {
        const rawPostId = args.postId || args.id || 'latest';
        try {
          const resolvedId = await this.api.resolveNumericPostId(sessionId, String(rawPostId));
          const success = await this.api.deletePost(sessionId, resolvedId);
          return {
            success,
            postId: resolvedId,
            message: `Post ${resolvedId} was deleted successfully from Threads.`
          };
        } catch (err: any) {
          return {
            success: false,
            error: `Failed to delete Threads post: ${err.message}`
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
