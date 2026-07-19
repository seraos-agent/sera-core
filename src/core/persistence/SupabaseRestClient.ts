/**
 * Minimal server-only Supabase client built on the platform REST APIs.
 * Keeping this boundary small avoids exposing a service key to the browser and
 * lets SERA use the same identity/persistence contracts without a provider SDK.
 */
export interface SupabaseAuthUser {
  id: string;
  email?: string;
  app_metadata?: { provider?: string };
}

export class SupabaseRestClient {
  constructor(
    private readonly url: string,
    private readonly serverKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnvironment(): SupabaseRestClient | null {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const serverKey = process.env.SUPABASE_SECRET_KEY;
    return url && serverKey ? new SupabaseRestClient(url, serverKey) : null;
  }

  async getAuthenticatedUser(accessToken: string): Promise<SupabaseAuthUser> {
    const response = await this.fetchImpl(`${this.url}/auth/v1/user`, {
      headers: {
        apikey: this.serverKey,
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) throw new Error('Supabase access token is invalid or expired.');
    const user = await response.json() as SupabaseAuthUser;
    if (!user.id) throw new Error('Supabase Auth response did not include a user ID.');
    return user;
  }

  async select<T>(table: string, query: string): Promise<T[]> {
    return this.request<T[]>(`/rest/v1/${table}?${query}`, { method: 'GET' });
  }

  async upsert(table: string, row: Record<string, unknown>, onConflict: string): Promise<void> {
    await this.request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  }

  private async request<T = void>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.url}${path}`, {
      ...init,
      headers: {
        apikey: this.serverKey,
        authorization: `Bearer ${this.serverKey}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase request failed (${response.status}): ${details}`);
    }
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return body ? JSON.parse(body) as T : undefined as T;
  }
}
