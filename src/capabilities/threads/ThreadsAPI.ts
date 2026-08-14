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

export class ThreadsAPI {
  private readonly baseUrl = 'https://graph.threads.net/v1.0';

  constructor(
    private readonly secretManager: SecretManager,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /**
   * Creates a text container for a Threads post.
   */
  async createContainer(sessionId: string, text: string, replyToId?: string, imageUrl?: string): Promise<ThreadsContainerResponse> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token. Please connect Threads first.');

    const url = new URL(`${this.baseUrl}/me/threads`);
    
    if (imageUrl) {
      url.searchParams.append('media_type', 'IMAGE');
      url.searchParams.append('image_url', imageUrl);
    } else {
      url.searchParams.append('media_type', 'TEXT');
    }
    
    if (!replyToId) {
      // Only append topic to top-level posts to avoid clashing with other topics
      url.searchParams.append('text', text);
      url.searchParams.append('topic_tag', 'sera-agent');
    } else {
      url.searchParams.append('text', text);
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
   * Publishes a previously created container.
   */
  async publishContainer(sessionId: string, creationId: string): Promise<ThreadsPublishResponse> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/me/threads_publish`);
    url.searchParams.append('creation_id', creationId);
    url.searchParams.append('access_token', token);

    const response = await this.fetchImpl(url.toString(), {
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to publish Threads container: ${errorText}`);
    }

    return response.json();
  }

  /**
   * High-level method to create and publish a post immediately.
   */
  async publishPost(sessionId: string, text: string, replyToId?: string, imageUrl?: string): Promise<string> {
    const container = await this.createContainer(sessionId, text, replyToId, imageUrl);
    const published = await this.publishContainer(sessionId, container.id);
    return published.id;
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
  async getUserThreads(sessionId: string, limit: number = 5): Promise<{ id: string; text: string; timestamp: string }[]> {
    const token = await this.getAccessToken(sessionId);
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/me/threads`);
    url.searchParams.append('fields', 'id,text,timestamp');
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
    return data.data || [];
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

  private async getAccessToken(sessionId: string): Promise<string | null> {
    // 1. Check for personal user token
    const userToken = await this.secretManager.getSecret(`THREADS_TOKEN_${sessionId}`);
    if (userToken) {
      return userToken;
    }
    
    // 2. Fallback to global bot token if explicitly allowed (e.g. for sera.agent bot)
    if (process.env.THREADS_ACCESS_TOKEN && sessionId === process.env.THREADS_VIP_USERS?.split(',')[0]) {
      return process.env.THREADS_ACCESS_TOKEN;
    }
    
    return null;
  }
}
