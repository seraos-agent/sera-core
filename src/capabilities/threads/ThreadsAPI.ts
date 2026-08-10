import { ISecretStore } from '../../core/secrets/types';
import { SecretManager } from '../../core/secrets/SecretManager';

export interface ThreadsContainerResponse {
  id: string; // creation_id
}

export interface ThreadsPublishResponse {
  id: string; // published post id
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
  async createContainer(text: string, replyToId?: string): Promise<ThreadsContainerResponse> {
    const token = await this.getAccessToken();
    if (!token) throw new Error('Threads API requires an active access token. Please connect Threads first.');

    const url = new URL(`${this.baseUrl}/me/threads`);
    url.searchParams.append('media_type', 'TEXT');
    url.searchParams.append('text', text);
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
   * Publishes a previously created container.
   */
  async publishContainer(creationId: string): Promise<ThreadsPublishResponse> {
    const token = await this.getAccessToken();
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
  async publishPost(text: string, replyToId?: string): Promise<string> {
    const container = await this.createContainer(text, replyToId);
    const published = await this.publishContainer(container.id);
    return published.id;
  }

  private async getAccessToken(): Promise<string | null> {
    // For MVP, we use a global/app-level secret. 
    // In production, this should be scoped to a specific user's identity.
    return this.secretManager.getSecret('THREADS_ACCESS_TOKEN');
  }
}
