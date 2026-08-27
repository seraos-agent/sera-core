import { randomBytes, createHash } from 'crypto';
import { SecretManager } from '../../../core/secrets/SecretManager';

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope?: string;
  token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic';
  created_at: number;
}

export interface OAuthAuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  sessionId: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string; // 'S256' | 'plain'
  expires_at: number;
}

export interface OAuthToken {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  sessionId: string;
  client_id: string;
  created_at: number;
}

export class OAuthStore {
  private clients: Map<string, OAuthClient> = new Map();
  private authCodes: Map<string, OAuthAuthorizationCode> = new Map();
  private tokens: Map<string, OAuthToken> = new Map();
  private refreshTokens: Map<string, OAuthToken> = new Map();

  constructor(private readonly secretManager?: SecretManager) {
    this.initWellKnownClients();
  }

  private initWellKnownClients() {
    // Pre-register well-known MCP clients (like Claude Desktop / Claude Web)
    const claudeClient: OAuthClient = {
      client_id: 'claude-ai-mcp',
      client_name: 'Anthropic Claude',
      redirect_uris: [
        'https://claude.ai/oauth/callback',
        'http://localhost:3000/oauth/callback',
        'https://chatgpt.com/aip/oauth/callback'
      ],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      created_at: Date.now()
    };
    this.clients.set(claudeClient.client_id, claudeClient);
  }

  /**
   * Registers a new OAuth client dynamically (RFC 7591).
   */
  public registerClient(metadata: Partial<OAuthClient>): OAuthClient {
    const clientId = `sera_client_${randomBytes(12).toString('hex')}`;
    const clientSecret = metadata.token_endpoint_auth_method !== 'none'
      ? `sera_cs_${randomBytes(24).toString('hex')}`
      : undefined;

    const client: OAuthClient = {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: metadata.client_name || 'External MCP Client',
      client_uri: metadata.client_uri,
      logo_uri: metadata.logo_uri,
      redirect_uris: metadata.redirect_uris && metadata.redirect_uris.length > 0
        ? metadata.redirect_uris
        : ['https://claude.ai/oauth/callback'],
      grant_types: metadata.grant_types || ['authorization_code', 'refresh_token'],
      response_types: metadata.response_types || ['code'],
      scope: metadata.scope || 'mcp:chat mcp:wallet mcp:memory mcp:tools',
      token_endpoint_auth_method: metadata.token_endpoint_auth_method || (clientSecret ? 'client_secret_post' : 'none'),
      created_at: Date.now()
    };

    this.clients.set(clientId, client);
    return client;
  }

  public getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Generates a single-use authorization code bound to a user session and PKCE challenge.
   */
  public createAuthorizationCode(params: {
    client_id: string;
    redirect_uri: string;
    sessionId: string;
    scope?: string;
    code_challenge?: string;
    code_challenge_method?: string;
  }): string {
    const code = `sera_code_${randomBytes(20).toString('hex')}`;
    const authCode: OAuthAuthorizationCode = {
      code,
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      sessionId: params.sessionId,
      scope: params.scope,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method || 'S256',
      expires_at: Date.now() + 10 * 60 * 1000 // 10 minutes expiry
    };

    this.authCodes.set(code, authCode);
    return code;
  }

  /**
   * Verifies PKCE S256 code challenge.
   */
  private verifyPkce(verifier: string, challenge: string, method: string = 'S256'): boolean {
    if (method === 'plain') {
      return verifier === challenge;
    }
    const hash = createHash('sha256').update(verifier).digest('base64url');
    return hash === challenge;
  }

  /**
   * Exchanges an authorization code for an Access Token and Refresh Token.
   */
  public exchangeCode(params: {
    code: string;
    client_id: string;
    redirect_uri?: string;
    code_verifier?: string;
  }): OAuthToken {
    const authCode = this.authCodes.get(params.code);
    if (!authCode) {
      throw new Error('Invalid or expired authorization code');
    }

    if (Date.now() > authCode.expires_at) {
      this.authCodes.delete(params.code);
      throw new Error('Authorization code has expired');
    }

    if (authCode.client_id !== params.client_id) {
      throw new Error('Client ID mismatch');
    }

    // PKCE verification
    if (authCode.code_challenge) {
      if (!params.code_verifier) {
        throw new Error('code_verifier is required for PKCE');
      }
      const valid = this.verifyPkce(params.code_verifier, authCode.code_challenge, authCode.code_challenge_method);
      if (!valid) {
        throw new Error('Invalid code_verifier for PKCE challenge');
      }
    }

    // Code is single-use: delete immediately
    this.authCodes.delete(params.code);

    const accessToken = `sera_mcp_at_${randomBytes(24).toString('hex')}`;
    const refreshToken = `sera_mcp_rt_${randomBytes(32).toString('hex')}`;
    const expiresIn = 30 * 24 * 60 * 60; // 30 days

    const token: OAuthToken = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: authCode.scope || 'mcp:all',
      sessionId: authCode.sessionId,
      client_id: authCode.client_id,
      created_at: Date.now()
    };

    this.tokens.set(accessToken, token);
    this.refreshTokens.set(refreshToken, token);

    return token;
  }

  /**
   * Refreshes an expired access token using a valid refresh token.
   */
  public refreshAccessToken(refreshTokenStr: string, clientId: string): OAuthToken {
    const existing = this.refreshTokens.get(refreshTokenStr);
    if (!existing || existing.client_id !== clientId) {
      throw new Error('Invalid refresh token');
    }

    // Invalidate old tokens
    this.tokens.delete(existing.access_token);
    this.refreshTokens.delete(refreshTokenStr);

    const newAccessToken = `sera_mcp_at_${randomBytes(24).toString('hex')}`;
    const newRefreshToken = `sera_mcp_rt_${randomBytes(32).toString('hex')}`;
    const expiresIn = 30 * 24 * 60 * 60; // 30 days

    const token: OAuthToken = {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: existing.scope,
      sessionId: existing.sessionId,
      client_id: existing.client_id,
      created_at: Date.now()
    };

    this.tokens.set(newAccessToken, token);
    this.refreshTokens.set(newRefreshToken, token);

    return token;
  }

  /**
   * Resolves an access token to the authenticated user's sessionId.
   */
  public resolveSession(accessToken: string): string | null {
    const token = this.tokens.get(accessToken);
    if (!token) return null;

    if (Date.now() > token.created_at + token.expires_in * 1000) {
      this.tokens.delete(accessToken);
      if (token.refresh_token) this.refreshTokens.delete(token.refresh_token);
      return null;
    }

    return token.sessionId;
  }

  public revokeToken(tokenStr: string): boolean {
    let found = false;
    if (this.tokens.has(tokenStr)) {
      const token = this.tokens.get(tokenStr)!;
      if (token.refresh_token) this.refreshTokens.delete(token.refresh_token);
      this.tokens.delete(tokenStr);
      found = true;
    }
    if (this.refreshTokens.has(tokenStr)) {
      const token = this.refreshTokens.get(tokenStr)!;
      this.tokens.delete(token.access_token);
      this.refreshTokens.delete(tokenStr);
      found = true;
    }
    return found;
  }
}
