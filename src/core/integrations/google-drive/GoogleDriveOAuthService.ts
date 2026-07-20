import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { GoogleDriveConnectionRepository, GoogleDriveConnectionStatus } from './GoogleDriveConnectionRepository';

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

interface OAuthState {
  userId: string;
  nonce: string;
  expiresAt: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export interface GoogleDriveOAuthConfig {
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  stateSecret: string;
}

/** OAuth boundary for the user-owned, visible SERA Vault folder in Google Drive. */
export class GoogleDriveOAuthService {
  constructor(
    private readonly config: GoogleDriveOAuthConfig,
    private readonly connections: GoogleDriveConnectionRepository,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnvironment(): GoogleDriveOAuthService | null {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const publicUrl = process.env.SERA_PUBLIC_URL?.replace(/\/$/, '');
    const stateSecret = process.env.SESSION_SECRET;
    const connections = GoogleDriveConnectionRepository.fromEnvironment();
    if (!clientId || !clientSecret || !publicUrl || !stateSecret || !connections) return null;
    return new GoogleDriveOAuthService({ clientId, clientSecret, publicUrl, stateSecret }, connections);
  }

  get redirectUri(): string {
    return `${this.config.publicUrl}/auth/google-drive/callback`;
  }

  async getStatus(userId: string): Promise<GoogleDriveConnectionStatus> {
    return this.connections.getStatus(userId);
  }

  beginAuthorization(userId: string): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_DRIVE_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', this.signState({ userId, nonce: randomUUID(), expiresAt: Date.now() + 10 * 60 * 1000 }));
    return url.toString();
  }

  async completeAuthorization(code: string, state: string): Promise<{ userId: string; status: GoogleDriveConnectionStatus }> {
    const statePayload = this.verifyState(state);
    const token = await this.exchangeAuthorizationCode(code);
    if (!token.access_token || !token.refresh_token) {
      throw new Error('Google did not return an offline access grant. Disconnect SERA in Google Account permissions and try again.');
    }
    const existing = await this.connections.getStatus(statePayload.userId);
    const vaultFolderId = existing.status === 'CONNECTED' && existing.vaultFolderId
      ? existing.vaultFolderId
      : await this.createVaultFolder(token.access_token);
    const status = await this.connections.saveConnected({
      userId: statePayload.userId,
      refreshToken: token.refresh_token,
      vaultFolderId,
      scopes: [GOOGLE_DRIVE_SCOPE],
    });
    return { userId: statePayload.userId, status };
  }

  async disconnect(userId: string): Promise<GoogleDriveConnectionStatus> {
    const refreshToken = await this.connections.getRefreshToken(userId);
    if (refreshToken) {
      await this.fetchImpl('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
    }
    await this.connections.revoke(userId);
    return { provider: 'GOOGLE_DRIVE', status: 'NOT_CONNECTED' };
  }

  private async exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const body = await response.json() as GoogleTokenResponse;
    if (!response.ok) throw new Error(body.error_description || body.error || 'Google authorization code exchange failed.');
    return body;
  }

  private async createVaultFolder(accessToken: string): Promise<string> {
    const response = await this.fetchImpl('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'SERA Vault', mimeType: FOLDER_MIME_TYPE }),
    });
    const body = await response.json() as { id?: string; error?: { message?: string } };
    if (!response.ok || !body.id) throw new Error(body.error?.message || 'Unable to create the SERA Vault folder in Google Drive.');
    return body.id;
  }

  private signState(state: OAuthState): string {
    const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
    const signature = createHmac('sha256', this.config.stateSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyState(state: string): OAuthState {
    const [payload, signature] = state.split('.');
    if (!payload || !signature) throw new Error('Google authorization state is invalid.');
    const expected = createHmac('sha256', this.config.stateSecret).update(payload).digest('base64url');
    const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new Error('Google authorization state could not be verified.');
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
    if (!parsed.userId || !parsed.expiresAt || Date.now() > parsed.expiresAt) throw new Error('Google authorization request expired. Try again.');
    return parsed;
  }
}
