import { ISecretStore } from '../../core/secrets/types';
import { SecretManager } from '../../core/secrets/SecretManager';

export interface ThreadsContainerResponse {
  id: string; // creation_id
}

export interface ThreadsPublishResponse {
  id: string; // published post id
}

export interface ThreadsMention {
  id: string;
  text: string;
  timestamp: string;
  username: string;
  is_reply?: boolean;
  replied_to?: {
    id: string;
  };
}

export interface ThreadsCarouselItem {
  url: string;
  isVideo?: boolean;
}

export interface ThreadsPostInsights {
  postId: string;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
}

export interface ThreadsUserInsights {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  followersCount?: number;
}

export interface ThreadsUserPost {
  id: string;
  text: string;
  timestamp: string;
  permalink?: string;
  mediaType?: string;
}

/**
 * Sanitizes text for Meta Threads publishing.
 * Strictly eliminates long em dashes (—), replacing them with standard hyphens (-).
 * En dashes (–) for number/date ranges are permitted.
 */
export function sanitizeThreadsText(text: string): string {
  if (!text) return text;
  return text.replace(/—/g, ' - ').replace(/\s{2,}/g, ' ').trim();
}

export class ThreadsAPI {
  private readonly baseUrl = 'https://graph.threads.net/v1.0';

  constructor(
    private readonly secretManager: SecretManager,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /**
   * Creates a container for a Threads post (TEXT, IMAGE, or VIDEO).
   */
  async createContainer(sessionId: string, text: string, replyToId?: string, imageUrl?: string, videoUrl?: string): Promise<ThreadsContainerResponse> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token. Please connect Threads first.');

    const url = new URL(`${this.baseUrl}/me/threads`);
    const cleanText = sanitizeThreadsText(text);
    
    if (videoUrl) {
      url.searchParams.append('media_type', 'VIDEO');
      url.searchParams.append('video_url', videoUrl);
    } else if (imageUrl) {
      url.searchParams.append('media_type', 'IMAGE');
      url.searchParams.append('image_url', imageUrl);
    } else {
      url.searchParams.append('media_type', 'TEXT');
    }
    
    url.searchParams.append('text', cleanText);
    if (replyToId) {
      url.searchParams.append('reply_to_id', replyToId);
    }
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), {
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Threads container: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Polls the container status (required for VIDEO containers or delayed IMAGE processing).
   */
  async waitForContainerReady(sessionId: string, creationId: string, maxWaitMs: number = 60000): Promise<void> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const startTime = Date.now();
    const statusUrl = new URL(`${this.baseUrl}/${creationId}`);
    statusUrl.searchParams.append('fields', 'status,error_message');
    statusUrl.searchParams.append('access_token', token);

    while (Date.now() - startTime < maxWaitMs) {
      const res = await this.fetchImpl(statusUrl.toString(), { method: 'GET' });
      if (res.ok) {
        const data = await res.json() as any;
        const status = data.status?.toUpperCase();
        if (status === 'FINISHED') {
          return;
        }
        if (status === 'ERROR') {
          throw new Error(`Threads container processing failed: ${data.error_message || 'Video/Media transcoding error'}`);
        }
        if (status === 'EXPIRED') {
          throw new Error('Threads container expired before it could be published.');
        }
      }
      // Poll every 2.5 seconds
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
  }

  /**
   * Publishes a previously created container.
   */
  async publishContainer(sessionId: string, creationId: string, isVideo: boolean = false): Promise<ThreadsPublishResponse> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    // If video, poll until container status is FINISHED before calling threads_publish
    if (isVideo) {
      await this.waitForContainerReady(sessionId, creationId);
    }

    const url = new URL(`${this.baseUrl}/me/threads_publish`);
    url.searchParams.append('creation_id', creationId);
    url.searchParams.append('access_token', token);

    let attempts = 0;
    while (attempts < 6) {
      const response = await this.fetchImpl(url.toString(), {
        method: 'POST',
      });

      if (response.ok) {
        return response.json();
      }

      const errorText = await response.text();
      
      // Meta's API may return "The requested resource does not exist" (error_subcode 4279009) 
      // or if the container is still processing. We should wait and retry.
      if (errorText.includes('4279009') || errorText.includes('does not exist') || errorText.includes('not ready')) {
        attempts++;
        if (attempts >= 6) {
          throw new Error(`Failed to publish Threads container after retries: ${errorText}`);
        }
        // Wait 3 seconds before trying again
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        throw new Error(`Failed to publish Threads container: ${errorText}`);
      }
    }
    
    throw new Error('Unreachable retry limit in publishContainer');
  }

  /**
   * High-level method to create and publish a post immediately.
   */
  async publishPost(sessionId: string, text: string, replyToId?: string, imageUrl?: string, videoUrl?: string): Promise<string> {
    const isVideo = Boolean(videoUrl);
    const container = await this.createContainer(sessionId, text, replyToId, imageUrl, videoUrl);
    const published = await this.publishContainer(sessionId, container.id, isVideo);
    return published.id;
  }

  /**
   * Creates an individual media container as part of a carousel post.
   */
  async createCarouselItemContainer(sessionId: string, mediaUrl: string, isVideo: boolean = false): Promise<ThreadsContainerResponse> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/me/threads`);
    url.searchParams.append('media_type', isVideo ? 'VIDEO' : 'IMAGE');
    if (isVideo) {
      url.searchParams.append('video_url', mediaUrl);
    } else {
      url.searchParams.append('image_url', mediaUrl);
    }
    url.searchParams.append('is_carousel_item', 'true');
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), { method: 'POST' });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create carousel item container: ${errorText}`);
    }
    return response.json();
  }

  /**
   * Creates a parent container for a carousel post combining multiple child media items.
   */
  async createCarouselContainer(sessionId: string, text: string, childrenIds: string[], replyToId?: string): Promise<ThreadsContainerResponse> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/me/threads`);
    url.searchParams.append('media_type', 'CAROUSEL');
    url.searchParams.append('children', childrenIds.join(','));
    if (text) {
      url.searchParams.append('text', sanitizeThreadsText(text));
    }
    if (replyToId) {
      url.searchParams.append('reply_to_id', replyToId);
    }
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), { method: 'POST' });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create parent carousel container: ${errorText}`);
    }
    return response.json();
  }

  /**
   * Publishes a carousel post consisting of 2 to 20 images or videos.
   */
  async publishCarousel(sessionId: string, text: string, mediaItems: ThreadsCarouselItem[], replyToId?: string): Promise<string> {
    if (!mediaItems || mediaItems.length < 2) {
      throw new Error('A carousel post requires at least 2 media items (up to 20).');
    }
    if (mediaItems.length > 20) {
      throw new Error('Meta Threads API allows a maximum of 20 media items per carousel.');
    }

    const childrenIds: string[] = [];
    for (const item of mediaItems) {
      const child = await this.createCarouselItemContainer(sessionId, item.url, item.isVideo);
      if (item.isVideo) {
        await this.waitForContainerReady(sessionId, child.id);
      }
      childrenIds.push(child.id);
    }

    const parent = await this.createCarouselContainer(sessionId, text, childrenIds, replyToId);
    const published = await this.publishContainer(sessionId, parent.id, false);
    return published.id;
  }

  /**
   * Publishes an atomic chain of posts (utas) in sequential order.
   * Post 0 is published first, and subsequent posts reply to each other in sequence.
   */
  async publishThreadChain(
    sessionId: string,
    posts: Array<{ text: string; imageUrl?: string; videoUrl?: string }>,
    initialReplyToId?: string
  ): Promise<string[]> {
    if (!posts || posts.length === 0) {
      throw new Error('Thread chain requires at least 1 post.');
    }

    const publishedIds: string[] = [];
    let currentParentId = initialReplyToId;

    for (const post of posts) {
      const postId = await this.publishPost(
        sessionId,
        post.text,
        currentParentId,
        post.imageUrl,
        post.videoUrl
      );
      publishedIds.push(postId);
      currentParentId = postId;
    }

    return publishedIds;
  }

  /**
   * Fetches performance metrics (views, likes, replies, reposts, quotes) for a specific Threads post.
   */
  async getPostInsights(sessionId: string, postId: string): Promise<ThreadsPostInsights> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/${postId}/insights`);
    url.searchParams.append('metric', 'views,likes,replies,reposts,quotes');
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), { method: 'GET' });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch post insights for ${postId}: ${errorText}`);
    }

    const data = await response.json();
    const metricsMap: Record<string, number> = {};
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        if (item.name) {
          let val = 0;
          if (item.total_value && item.total_value.value !== undefined) {
            val = Number(item.total_value.value) || 0;
          } else if (Array.isArray(item.values) && item.values.length > 0) {
            val = Number(item.values[0]?.value) || 0;
          } else if (item.value !== undefined) {
            val = Number(item.value) || 0;
          }
          metricsMap[item.name] = val;
        }
      }
    }

    return {
      postId,
      views: metricsMap['views'] || 0,
      likes: metricsMap['likes'] || 0,
      replies: metricsMap['replies'] || 0,
      reposts: metricsMap['reposts'] || 0,
      quotes: metricsMap['quotes'] || 0
    };
  }

  /**
   * Fetches account-level performance insights (views, likes, replies, reposts, quotes) for the user.
   */
  async getUserInsights(sessionId: string): Promise<ThreadsUserInsights> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/me/threads_insights`);
    url.searchParams.append('metric', 'views,likes,replies,reposts,quotes');
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), { method: 'GET' });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch account insights: ${errorText}`);
    }

    const data = await response.json();
    const metricsMap: Record<string, number> = {};
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        if (item.name) {
          let val = 0;
          if (item.total_value && item.total_value.value !== undefined) {
            val = Number(item.total_value.value) || 0;
          } else if (Array.isArray(item.values) && item.values.length > 0) {
            val = Number(item.values[0]?.value) || 0;
          } else if (item.value !== undefined) {
            val = Number(item.value) || 0;
          }
          metricsMap[item.name] = val;
        }
      }
    }

    return {
      views: metricsMap['views'] || 0,
      likes: metricsMap['likes'] || 0,
      replies: metricsMap['replies'] || 0,
      reposts: metricsMap['reposts'] || 0,
      quotes: metricsMap['quotes'] || 0
    };
  }

  /**
   * Fetches the latest mentions for the authenticated user.
   */
  async getMentions(sessionId: string, limit: number = 20): Promise<ThreadsMention[]> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    // Based on typical Meta Graph API structure for mentions
    const url = new URL(`${this.baseUrl}/me/mentions`);
    url.searchParams.append('fields', 'id,text,timestamp,username');
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Threads mentions: ${errorText}`);
    }

    const data = await response.json();
    console.log('[ThreadsAPI] /me/mentions raw response:', JSON.stringify(data, null, 2));
    return data.data || [];
  }
  /**
   * Fetches a specific post by its ID.
   */
  async getPost(sessionId: string, postId: string): Promise<ThreadsMention> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/${postId}`);
    url.searchParams.append('fields', 'id,text,timestamp,username,is_reply,replied_to');
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch post ${postId}: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Fetches the latest threads/posts created by the authenticated user.
   */
  async getUserThreads(sessionId: string, limit: number = 5): Promise<ThreadsUserPost[]> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/me/threads`);
    url.searchParams.append('fields', 'id,text,timestamp,permalink,media_type');
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch user threads: ${errorText}`);
    }

    const data = await response.json();
    return (data.data || []).map((t: any) => ({
      id: t.id,
      text: t.text || '',
      timestamp: t.timestamp,
      permalink: t.permalink,
      mediaType: t.media_type
    }));
  }

  /**
   * Fetches the latest replies to a specific thread.
   */
  async getThreadReplies(sessionId: string, threadId: string, limit: number = 20): Promise<ThreadsMention[]> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/${threadId}/replies`);
    url.searchParams.append('fields', 'id,text,timestamp,username');
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If error is related to media not found or something, we can just return empty
      if (response.status === 404 || response.status === 400) {
        console.warn(`[ThreadsAPI] Could not fetch replies for thread ${threadId}: ${errorText}`);
        return [];
      }
      throw new Error(`Failed to fetch thread replies for ${threadId}: ${errorText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  public async getAccessToken(sessionId: string): Promise<string | null> {
    const cleanId = (sessionId || '').toLowerCase();

    // 1. Check for personal user token (case-insensitive)
    let userToken = await this.secretManager.getSecret(`THREADS_TOKEN_${cleanId}`);
    if (!userToken && cleanId !== sessionId) {
      userToken = await this.secretManager.getSecret(`THREADS_TOKEN_${sessionId}`);
    }
    if (userToken) {
      return userToken;
    }
    
    // 2. Fallback to global bot token if explicitly configured
    if (process.env.THREADS_ACCESS_TOKEN) {
      return process.env.THREADS_ACCESS_TOKEN;
    }
    
    return null;
  }
}
