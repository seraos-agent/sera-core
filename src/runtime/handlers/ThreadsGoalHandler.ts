import { ThreadsAPI, ThreadsCarouselItem, sanitizeThreadsText } from '../../capabilities/threads/ThreadsAPI';
import { ThreadsPostHistoryStore } from '../../capabilities/threads/ThreadsPostHistoryStore';
import { GoogleDriveCapability } from '../../capabilities/google-drive/GoogleDriveCapability';
import { EmitResultFn } from './types';

/**
 * ThreadsGoalHandler — Manages all execution operations for Meta Threads.
 *
 * Responsibilities:
 * - Publishing single posts, multi-image carousels, and chained threads (utas)
 * - Fetching recent user posts and engagement metrics/insights
 * - Deleting existing posts with safe confirmation
 */
export class ThreadsGoalHandler {
  constructor(
    private readonly threadsApi: ThreadsAPI,
    private readonly threadsPostHistoryStore: ThreadsPostHistoryStore,
    private readonly sessionId: string,
    private readonly emitResult: EmitResultFn,
    private readonly getGoogleDriveCapability?: () => GoogleDriveCapability | null
  ) {}

  public async handlePublish(requestId: string, parameters: Record<string, any>): Promise<void> {
    let { text, replyToId, imageUrl, videoUrl, driveFileName, imageUrls, driveFileNames, threadChain } = parameters;
    if (!text) throw new Error('Threads publish requires text parameter.');

    // Sanitize text and threadChain: strictly remove em dashes (—) and en dashes (–)
    text = sanitizeThreadsText(text);
    if (Array.isArray(threadChain)) {
      threadChain = threadChain.map((t: any) => typeof t === 'string' ? sanitizeThreadsText(t) : t);
    }

    const bridgeCleanupKeys: string[] = [];
    const gdriveCap = this.getGoogleDriveCapability ? this.getGoogleDriveCapability() : null;

    try {
      // 1. Check for Carousel Publication (Multi-Image)
      const carouselItems: ThreadsCarouselItem[] = [];

      if (Array.isArray(imageUrls) && imageUrls.length > 0) {
        for (const url of imageUrls) {
          if (typeof url === 'string' && url.trim()) {
            carouselItems.push({ url: url.trim(), isVideo: false });
          }
        }
      }

      if (Array.isArray(driveFileNames) && driveFileNames.length > 0 && gdriveCap) {
        for (const filename of driveFileNames) {
          if (typeof filename === 'string' && filename.trim()) {
            const bridge = await gdriveCap.bridgeDriveMediaToCdn(this.sessionId, filename.trim());
            carouselItems.push({ url: bridge.publicUrl, isVideo: bridge.isVideo });
            bridgeCleanupKeys.push(bridge.fileKey);
          }
        }
      }

      let rootPostId: string;

      if (carouselItems.length >= 2) {
        rootPostId = await this.threadsApi.publishCarousel(this.sessionId, text, carouselItems, replyToId);
      } else {
        let finalImageUrl = imageUrl;
        let finalVideoUrl = videoUrl;

        if (driveFileName && gdriveCap) {
          const bridge = await gdriveCap.bridgeDriveMediaToCdn(this.sessionId, driveFileName);
          if (bridge.isVideo) {
            finalVideoUrl = bridge.publicUrl;
          } else {
            finalImageUrl = bridge.publicUrl;
          }
          bridgeCleanupKeys.push(bridge.fileKey);
        }

        rootPostId = await this.threadsApi.publishPost(this.sessionId, text, replyToId, finalImageUrl, finalVideoUrl);
      }

      this.threadsPostHistoryStore.recordPost(this.sessionId, text, rootPostId);

      // 2. Check for Atomic Chained Threads (Utas)
      const chainedIds: string[] = [rootPostId];
      if (Array.isArray(threadChain) && threadChain.length > 0) {
        let parentId = rootPostId;
        for (const followUpText of threadChain) {
          if (typeof followUpText === 'string' && followUpText.trim()) {
            const followUpId = await this.threadsApi.publishPost(this.sessionId, followUpText.trim(), parentId);
            this.threadsPostHistoryStore.recordPost(this.sessionId, followUpText.trim(), followUpId);
            chainedIds.push(followUpId);
            parentId = followUpId;
          }
        }
      }

      // Cleanup ephemeral bridge media
      if (bridgeCleanupKeys.length > 0 && gdriveCap) {
        for (const key of bridgeCleanupKeys) {
          gdriveCap.cleanupCdnBridge(key).catch((e: any) => {
            console.warn('[ThreadsGoalHandler] Bridge cleanup warning:', e.message);
          });
        }
      }

      const summary = chainedIds.length > 1
        ? `Successfully published chained thread with ${chainedIds.length} parts to Threads (Root ID: ${rootPostId})`
        : (carouselItems.length >= 2
            ? `Successfully published carousel (${carouselItems.length} slides) to Threads (ID: ${rootPostId})`
            : `Successfully published to Threads (ID: ${rootPostId})`);

      this.emitResult(requestId, true, {
        provider: 'Meta Threads',
        id: rootPostId,
        chainedIds: chainedIds.length > 1 ? chainedIds : undefined,
        summary
      });
    } catch (err: any) {
      this.emitResult(requestId, false, {}, err.message || 'Failed to publish to Threads');
    }
  }

  public async handleGetPosts(requestId: string, parameters: Record<string, any>): Promise<void> {
    try {
      const limit = Math.min(20, Math.max(1, Number(parameters?.limit) || 5));
      const posts = await this.threadsApi.getUserThreads(this.sessionId, limit);
      this.emitResult(requestId, true, {
        provider: 'Meta Threads',
        count: posts.length,
        posts,
        summary: `Retrieved ${posts.length} recent posts from Threads.`
      });
    } catch (err: any) {
      this.emitResult(requestId, false, {}, err.message || 'Failed to retrieve recent Threads posts');
    }
  }

  public async handleGetInsights(requestId: string, parameters: Record<string, any>): Promise<void> {
    try {
      const targetId = parameters?.postId || parameters?.mediaId;
      if (targetId) {
        const insights = await this.threadsApi.getPostInsights(this.sessionId, targetId);
        this.emitResult(requestId, true, {
          provider: 'Meta Threads',
          type: 'post',
          insights,
          summary: `Fetched insights for post ${targetId}: ${insights.views} views, ${insights.likes} likes, ${insights.replies} replies.`
        });
        return;
      }

      const userInsights = await this.threadsApi.getUserInsights(this.sessionId);
      this.emitResult(requestId, true, {
        provider: 'Meta Threads',
        type: 'account',
        insights: userInsights,
        summary: `Account Insights: ${userInsights.views} views, ${userInsights.likes} likes, ${userInsights.replies} replies, ${userInsights.reposts} reposts.`
      });
    } catch (err: any) {
      this.emitResult(requestId, false, {}, err.message || 'Failed to fetch Threads insights');
    }
  }

  public async handleDelete(requestId: string, parameters: Record<string, any>): Promise<void> {
    const rawPostId = parameters.postId || parameters.id;
    const responseContext = parameters._responseContext || parameters.responseContext;
    if (!rawPostId) {
      this.emitResult(requestId, false, { _responseContext: responseContext }, 'Missing postId parameter for THREADS_DELETE.');
      return;
    }
    try {
      const resolvedId = await this.threadsApi.resolveNumericPostId(this.sessionId, String(rawPostId));
      const success = await this.threadsApi.deletePost(this.sessionId, resolvedId);
      this.emitResult(requestId, success, {
        postId: resolvedId,
        message: `Post ${resolvedId} was deleted successfully from Threads.`,
        _responseContext: responseContext,
        _userMessage: 'Udah beres, postingan barusan udah berhasil aku hapus dari Threads ya! 👍'
      });
    } catch (err: any) {
      this.emitResult(requestId, false, {
        _responseContext: responseContext
      }, err.message || 'Failed to delete Threads post');
    }
  }
}
