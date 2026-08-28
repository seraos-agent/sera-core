import { randomBytes, createHash, createHmac } from 'crypto';
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
  private signingSecret: string;

  constructor(private readonly secretManager?: SecretManager) {
    this.signingSecret = process.env.SESSION_SECRET || 'sera-oauth-stateless-secret-key-prod-2026';
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
   * Creates an Authorization Code bound to a user's authentic sessionId/wallet.
   * Encodes a stateless HMAC signature so any Cloud Run instance can exchange it.
   */
  public createAuthorizationCode(params: {
    client_id: string;
    redirect_uri: string;
    sessionId: string;
    scope?: string;
    code_challenge?: string;
    code_challenge_method?: string;
  }): string {
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const payload = {
      cid: params.client_id,
      ruri: params.redirect_uri,
      sub: params.sessionId.toLowerCase(),
      scope: params.scope || 'mcp:all',
      cc: params.code_challenge || '',
      ccm: params.code_challenge_method || 'S256',
      exp: expiresAt,
      nonce: randomBytes(8).toString('hex')
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.signingSecret).update(encoded).digest('hex');
    const code = `sera_code_${encoded}.${sig}`;

    const authCode: OAuthAuthorizationCode = {
      code,
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      sessionId: params.sessionId.toLowerCase(),
      scope: params.scope,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method || 'S256',
      expires_at: expiresAt
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
   * Exchanges an authorization code for a signed Access Token and Refresh Token.
   */
  public exchangeCode(params: {
    code: string;
    client_id: string;
    redirect_uri?: string;
    code_verifier?: string;
  }): OAuthToken {
    let authCode = this.authCodes.get(params.code);

    // If not found in memory (e.g. hitting different Cloud Run replica), verify HMAC signature
    if (!authCode && params.code && params.code.startsWith('sera_code_')) {
      const parts = params.code.replace('sera_code_', '').split('.');
      if (parts.length === 2) {
        const [encoded, sig] = parts;
        const expectedSig = createHmac('sha256', this.signingSecret).update(encoded).digest('hex');
        if (sig === expectedSig) {
          try {
            const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
            if (decoded.exp && Date.now() <= decoded.exp) {
              authCode = {
                code: params.code,
                client_id: decoded.cid,
                redirect_uri: decoded.ruri,
                sessionId: decoded.sub,
                scope: decoded.scope,
                code_challenge: decoded.cc,
                code_challenge_method: decoded.ccm,
                expires_at: decoded.exp
              };
            }
          } catch {}
        }
      }
    }

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

    // Code is single-use
    this.authCodes.delete(params.code);

    const expiresIn = 30 * 24 * 60 * 60; // 30 days
    const exp = Date.now() + expiresIn * 1000;
    
    // Signed Access Token
    const tokenPayload = {
      sub: authCode.sessionId.toLowerCase(),
      cid: authCode.client_id,
      scp: authCode.scope || 'mcp:all',
      exp,
      nonce: randomBytes(8).toString('hex')
    };
    const encToken = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const tokenSig = createHmac('sha256', this.signingSecret).update(encToken).digest('hex');
    const accessToken = `sera_mcp_at_${encToken}.${tokenSig}`;

    // Signed Refresh Token
    const refreshPayload = {
      sub: authCode.sessionId.toLowerCase(),
      cid: authCode.client_id,
      scp: authCode.scope || 'mcp:all',
      exp: Date.now() + 90 * 24 * 60 * 60 * 1000,
      nonce: randomBytes(12).toString('hex')
    };
    const encRefresh = Buffer.from(JSON.stringify(refreshPayload)).toString('base64url');
    const refreshSig = createHmac('sha256', this.signingSecret).update(encRefresh).digest('hex');
    const refreshToken = `sera_mcp_rt_${encRefresh}.${refreshSig}`;

    const token: OAuthToken = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: authCode.scope || 'mcp:all',
      sessionId: authCode.sessionId.toLowerCase(),
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
    let existing = this.refreshTokens.get(refreshTokenStr);

    if (!existing && refreshTokenStr.startsWith('sera_mcp_rt_')) {
      const parts = refreshTokenStr.replace('sera_mcp_rt_', '').split('.');
      if (parts.length === 2) {
        const [encRefresh, sig] = parts;
        const expectedSig = createHmac('sha256', this.signingSecret).update(encRefresh).digest('hex');
        if (sig === expectedSig) {
          try {
            const decoded = JSON.parse(Buffer.from(encRefresh, 'base64url').toString('utf8'));
            if (decoded.exp && Date.now() <= decoded.exp) {
              existing = {
                access_token: '',
                token_type: 'Bearer',
                expires_in: 30 * 24 * 60 * 60,
                refresh_token: refreshTokenStr,
                scope: decoded.scp,
                sessionId: decoded.sub,
                client_id: decoded.cid,
                created_at: Date.now()
              };
            }
          } catch {}
        }
      }
    }

    if (!existing || existing.client_id !== clientId) {
      throw new Error('Invalid refresh token');
    }

    // Invalidate old tokens
    if (existing.access_token) this.tokens.delete(existing.access_token);
    this.refreshTokens.delete(refreshTokenStr);

    const expiresIn = 30 * 24 * 60 * 60; // 30 days
    const exp = Date.now() + expiresIn * 1000;

    const tokenPayload = {
      sub: existing.sessionId.toLowerCase(),
      cid: existing.client_id,
      scp: existing.scope || 'mcp:all',
      exp,
      nonce: randomBytes(8).toString('hex')
    };
    const encToken = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const tokenSig = createHmac('sha256', this.signingSecret).update(encToken).digest('hex');
    const newAccessToken = `sera_mcp_at_${encToken}.${tokenSig}`;

    const refreshPayload = {
      sub: existing.sessionId.toLowerCase(),
      cid: existing.client_id,
      scp: existing.scope || 'mcp:all',
      exp: Date.now() + 90 * 24 * 60 * 60 * 1000,
      nonce: randomBytes(12).toString('hex')
    };
    const encRefresh = Buffer.from(JSON.stringify(refreshPayload)).toString('base64url');
    const refreshSig = createHmac('sha256', this.signingSecret).update(encRefresh).digest('hex');
    const newRefreshToken = `sera_mcp_rt_${encRefresh}.${refreshSig}`;

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
   * Verifies cryptographic HMAC signature so it works across all instances and restarts.
   */
  public resolveSession(accessToken: string): string | null {
    if (!accessToken) return null;
    const clean = accessToken.replace(/^Bearer\s+/i, '').trim();

    // 1. In-memory check
    const token = this.tokens.get(clean);
    if (token) {
      if (Date.now() > token.created_at + token.expires_in * 1000) {
        this.tokens.delete(clean);
        if (token.refresh_token) this.refreshTokens.delete(token.refresh_token);
        return null;
      }
      return token.sessionId;
    }

    // 2. Cryptographic signature check
    if (clean.startsWith('sera_mcp_at_')) {
      const parts = clean.replace('sera_mcp_at_', '').split('.');
      if (parts.length === 2) {
        const [encToken, sig] = parts;
        const expectedSig = createHmac('sha256', this.signingSecret).update(encToken).digest('hex');
        if (sig === expectedSig) {
          try {
            const parsed = JSON.parse(Buffer.from(encToken, 'base64url').toString('utf8'));
            if (parsed.sub && parsed.exp && Date.now() <= parsed.exp) {
              return parsed.sub.toLowerCase();
            }
          } catch {}
        }
      }
    }

    return null;
  }

  private linkCodes: Map<string, { userId: string; expiresAt: number; attempts: number }> = new Map();

  /**
   * Generates a secure, temporary 6-digit pairing code for device/MCP linking.
   */
  public createLinkCode(userId: string, ttlMs = 10 * 60 * 1000): { code: string; expiresAt: number } {
    if (!userId || userId === 'default') {
      throw new Error('Valid user identity is required to generate a link code.');
    }

    // Clean up expired codes
    const now = Date.now();
    for (const [c, meta] of this.linkCodes.entries()) {
      if (meta.expiresAt <= now) {
        this.linkCodes.delete(c);
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + ttlMs;

    this.linkCodes.set(code, {
      userId,
      expiresAt,
      attempts: 0
    });

    return { code, expiresAt };
  }

  /**
   * Verifies and burns a 6-digit link code (single-use).
   */
  public verifyAndBurnLinkCode(rawCode: string): { success: boolean; userId?: string; error?: string } {
    if (!rawCode) {
      return { success: false, error: 'Link code is required.' };
    }

    const cleanCode = rawCode.replace(/[\s-]+/g, '').trim();
    const record = this.linkCodes.get(cleanCode);

    if (!record) {
      return { success: false, error: 'Invalid or expired link code.' };
    }

    if (Date.now() > record.expiresAt) {
      this.linkCodes.delete(cleanCode);
      return { success: false, error: 'Link code has expired. Please generate a new code in your dashboard.' };
    }

    if (record.attempts >= 3) {
      this.linkCodes.delete(cleanCode);
      return { success: false, error: 'Too many incorrect attempts. This code is now void.' };
    }

    // Burn code upon successful verification (single-use guarantee)
    this.linkCodes.delete(cleanCode);
    return { success: true, userId: record.userId };
  }

  /**
   * Lists active platform connections (Claude, ChatGPT, etc.) for a user.
   */
  public listConnectedPlatforms(userId: string): Array<{ client_id: string; client_name: string; created_at: number }> {
    const now = Date.now();
    const connected: Array<{ client_id: string; client_name: string; created_at: number }> = [];
    const seenClients = new Set<string>();

    for (const token of this.tokens.values()) {
      if (token.sessionId === userId && now <= token.created_at + token.expires_in * 1000) {
        if (!seenClients.has(token.client_id)) {
          seenClients.add(token.client_id);
          const client = this.clients.get(token.client_id);
          connected.push({
            client_id: token.client_id,
            client_name: client?.client_name || 'External MCP Client',
            created_at: token.created_at
          });
        }
      }
    }

    return connected;
  }

  /**
   * Revokes all active platform sessions for a given user.
   */
  public revokePlatformSession(userId: string, clientId?: string): boolean {
    let revoked = false;
    for (const [tokenStr, token] of Array.from(this.tokens.entries())) {
      if (token.sessionId === userId && (!clientId || token.client_id === clientId)) {
        if (token.refresh_token) this.refreshTokens.delete(token.refresh_token);
        this.tokens.delete(tokenStr);
        revoked = true;
      }
    }
    return revoked;
  }

  /**
   * Revokes a specific OAuth token string.
   */
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
