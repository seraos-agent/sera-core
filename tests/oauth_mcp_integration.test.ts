import { describe, it, expect } from 'vitest';
import { OAuthStore } from '../src/server/auth/oauth/OAuthStore';
import { McpApiKeyStore } from '../src/mcp/McpApiKeyStore';
import { SERA_MCP_TOOLS } from '../src/mcp/SeraMcpServer';
import { createHash, randomBytes } from 'crypto';

describe('OAuth 2.0 Dynamic Client Registration & MCP Integration', () => {
  it('should register a new OAuth client dynamically (RFC 7591)', () => {
    const store = new OAuthStore();
    const client = store.registerClient({
      client_name: 'Claude Web Integration',
      redirect_uris: ['https://claude.ai/oauth/callback'],
      grant_types: ['authorization_code', 'refresh_token']
    });

    expect(client.client_id).toMatch(/^sera_client_/);
    expect(client.client_name).toBe('Claude Web Integration');
    expect(client.redirect_uris).toEqual(['https://claude.ai/oauth/callback']);
    expect(store.getClient(client.client_id)).toBeDefined();
  });

  it('should perform authorization code exchange with PKCE S256 challenge', () => {
    const store = new OAuthStore();
    const client = store.registerClient({
      client_name: 'Claude Test Client',
      redirect_uris: ['https://claude.ai/callback'],
      token_endpoint_auth_method: 'none'
    });

    // Generate PKCE code_verifier and code_challenge (S256)
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    // Create auth code
    const authCode = store.createAuthorizationCode({
      client_id: client.client_id,
      redirect_uri: 'https://claude.ai/callback',
      sessionId: '0x1234567890abcdef',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    expect(authCode).toMatch(/^sera_code_/);

    // Exchange auth code with verifier
    const token = store.exchangeCode({
      code: authCode,
      client_id: client.client_id,
      code_verifier: codeVerifier,
      redirect_uri: 'https://claude.ai/callback'
    });

    expect(token.access_token).toMatch(/^sera_mcp_at_/);
    expect(token.refresh_token).toMatch(/^sera_mcp_rt_/);
    expect(token.sessionId).toBe('0x1234567890abcdef');

    // Verify session resolution
    expect(store.resolveSession(token.access_token)).toBe('0x1234567890abcdef');
  });

  it('should resolve both API keys and OAuth tokens in McpApiKeyStore', () => {
    const oauthStore = new OAuthStore();
    const apiKeyStore = new McpApiKeyStore(oauthStore);

    // 1. Test standard API key
    const rawKey = apiKeyStore.generateKey('user-alice');
    expect(apiKeyStore.resolveUser(rawKey)).toBe('user-alice');

    // 2. Test OAuth Bearer token
    const client = oauthStore.registerClient({
      redirect_uris: ['https://claude.ai/callback']
    });
    const authCode = storeCode(oauthStore, client.client_id, 'user-bob');
    const token = oauthStore.exchangeCode({
      code: authCode,
      client_id: client.client_id
    });

    expect(apiKeyStore.resolveUser(token.access_token)).toBe('user-bob');
    expect(apiKeyStore.resolveUser(`Bearer ${token.access_token}`)).toBe('user-bob');
  });

  it('should expose expanded MCP tool suite', () => {
    const toolNames = SERA_MCP_TOOLS.map(t => t.name);
    expect(toolNames).toContain('sera_chat');
    expect(toolNames).toContain('sera_wallet_balance');
    expect(toolNames).toContain('sera_wallet_transfer');
    expect(toolNames).toContain('sera_spot_market_data');
    expect(toolNames).toContain('sera_spot_trade');
    expect(toolNames).toContain('sera_schedule_create');
    expect(toolNames).toContain('sera_threads_publish');
    expect(toolNames).toContain('sera_memory_read');
    expect(toolNames).toContain('sera_memory_write');
    expect(toolNames).toContain('sera_billing_status');
  });
});

function storeCode(store: OAuthStore, clientId: string, sessionId: string): string {
  return store.createAuthorizationCode({
    client_id: clientId,
    redirect_uri: 'https://claude.ai/callback',
    sessionId
  });
}
