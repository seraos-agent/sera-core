import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createAdminRouter } from '../src/server/routes/adminRoutes';

describe('Admin Control Tower Routes', () => {
  let app: express.Express;
  let mockAgentManager: any;
  let mockSubscriptionService: any;
  let mockSupabaseClient: any;

  beforeEach(() => {
    process.env.SERA_ADMIN_SECRET = 'test-secret-key-123';
    process.env.ADMIN_EMAILS = 'admin@seraos.xyz,test@seraos.xyz';

    mockSubscriptionService = {
      credits: new Map<string, number>([['user-alpha', 500000], ['dev', 9999999]]),
      getAgentCredits: vi.fn((id: string) => mockSubscriptionService.credits.get(id) || 0),
      addCreditsDirectly: vi.fn((id: string, amount: number) => {
        const current = mockSubscriptionService.credits.get(id) || 0;
        mockSubscriptionService.credits.set(id, current + amount);
      }),
      consumeCredits: vi.fn((id: string, amount: number) => {
        const current = mockSubscriptionService.credits.get(id) || 0;
        mockSubscriptionService.credits.set(id, Math.max(0, current - amount));
      })
    };

    mockAgentManager = {
      getSubscriptionService: vi.fn(() => mockSubscriptionService),
      getAllInstances: vi.fn(() => [
        {
          sessionId: 'user-alpha',
          personalWalletAddress: '0x1111111111111111111111111111111111111111',
          triggerStore: {
            getAll: vi.fn(() => [{ id: 'trig-1', type: 'cron' }]),
            delete: vi.fn()
          },
          autonomyAgreementStore: {
            getAll: vi.fn(() => [{ id: 'agree-1', toolIntent: 'threads_post' }])
          },
          memoryStore: {
            getSnapshot: vi.fn(() => ({ protectedBeliefs: [{ belief: 'User prefers concise reports' }] }))
          }
        }
      ]),
      getInstance: vi.fn((sessionId: string) => {
        if (sessionId === 'user-alpha') {
          return {
            sessionId: 'user-alpha',
            personalWalletAddress: '0x1111111111111111111111111111111111111111',
            triggerStore: {
              getAll: vi.fn(() => [{ id: 'trig-1', type: 'cron' }]),
              delete: vi.fn()
            },
            autonomyAgreementStore: {
              getAll: vi.fn(() => [{ id: 'agree-1', toolIntent: 'threads_post' }])
            },
            memoryStore: {
              getSnapshot: vi.fn(() => ({ protectedBeliefs: [{ belief: 'User prefers concise reports' }] }))
            }
          };
        }
        return null;
      })
    };

    mockSupabaseClient = {
      select: vi.fn(async (table: string) => {
        if (table === 'user_cloud_connections') {
          return [
            { user_id: 'user-alpha', provider: 'google-drive', status: 'CONNECTED' },
            { user_id: 'user-beta', provider: 'threads', status: 'CONNECTED' }
          ];
        }
        return [];
      }),
      upsert: vi.fn(async () => ({})),
      signInWithPassword: vi.fn()
    };

    app = express();
    app.use(express.json());
    app.use('/api/admin', createAdminRouter({ agentManager: mockAgentManager, supabaseClient: mockSupabaseClient }));
  });

  it('rejects unauthorized access without credentials', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/overview`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized');
    } finally {
      server.close();
    }
  });

  it('rejects invalid admin secret key', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/overview`, {
        headers: { 'x-admin-key': 'wrong-key' }
      });
      expect(res.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it('grants access with valid x-admin-key', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/overview`, {
        headers: { 'x-admin-key': 'test-secret-key-123' }
      });
      const json = await res.json();
      if (res.status !== 200) {
        console.error('Overview error response:', json);
      }
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.activeSessions).toBe(1);
      expect(json.data.activeAutomations).toBe(1);
    } finally {
      server.close();
    }
  });

  it('logs in via adminKey and returns session token', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: 'test-secret-key-123' })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.adminKey).toBe('test-secret-key-123');
      expect(json.user.role).toBe('superadmin');
    } finally {
      server.close();
    }
  });

  it('fetches users directory and details', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
        headers: { 'x-admin-key': 'test-secret-key-123' }
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.users.length).toBeGreaterThanOrEqual(2);

      const alpha = json.users.find((u: any) => u.id === 'user-alpha');
      expect(alpha).toBeDefined();
      expect(alpha.connections.googleDrive).toBe(true);

      // Detail test
      const detailRes = await fetch(`http://127.0.0.1:${port}/api/admin/users/user-alpha`, {
        headers: { 'x-admin-key': 'test-secret-key-123' }
      });
      expect(detailRes.status).toBe(200);
      const detailJson = await detailRes.json();
      expect(detailJson.user.triggers.length).toBe(1);
      expect(detailJson.user.memoryBeliefs.length).toBe(1);
    } finally {
      server.close();
    }
  });

  it('adjusts user credits successfully', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/users/user-alpha/credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'test-secret-key-123'
        },
        body: JSON.stringify({ amount: 150000 })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.agentCredits).toBe(650000);
      expect(mockSubscriptionService.addCreditsDirectly).toHaveBeenCalledWith('user-alpha', 150000);
    } finally {
      server.close();
    }
  });

  it('synchronizes Claude MCP status between list and inspect detail without false positives', async () => {
    const mockSecretManager = {
      getSecret: vi.fn(async (key: string) => {
        if (key === 'ACTIVATIONS_user-with-claude') return JSON.stringify(['claude', 'telegram']);
        if (key === 'ACTIVATIONS_user-alpha') return JSON.stringify(['threads']);
        return null;
      }),
      setSecret: vi.fn()
    };

    const mockOAuth = {
      listConnectedPlatforms: vi.fn((uid: string) => {
        if (uid === 'user-oauth-claude') return [{ client_id: 'claude-ai-mcp', client_name: 'Anthropic Claude', created_at: Date.now() }];
        return [];
      })
    };

    const customApp = express();
    customApp.use(express.json());
    customApp.use('/api/admin', createAdminRouter({
      agentManager: mockAgentManager,
      supabaseClient: mockSupabaseClient,
      secretManager: mockSecretManager as any,
      oauthStore: mockOAuth as any
    }));

    const server = customApp.listen(0);
    const port = (server.address() as any).port;

    try {
      // 1. Check user-alpha (has no Claude)
      const listRes = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
        headers: { 'x-admin-key': 'test-secret-key-123' }
      });
      const listJson = await listRes.json();
      const alphaUser = listJson.users.find((u: any) => u.id === 'user-alpha');
      expect(alphaUser.connections.claude).toBe(false);

      const detailRes = await fetch(`http://127.0.0.1:${port}/api/admin/users/user-alpha`, {
        headers: { 'x-admin-key': 'test-secret-key-123' }
      });
      const detailJson = await detailRes.json();
      expect(detailJson.user.connections.claude).toBe(false);
      // Main table and detail MUST match
      expect(detailJson.user.connections.claude).toBe(alphaUser.connections.claude);

      // 2. Check user-with-claude (has Claude in activations)
      const detailClaudeRes = await fetch(`http://127.0.0.1:${port}/api/admin/users/user-with-claude`, {
        headers: { 'x-admin-key': 'test-secret-key-123' }
      });
      const detailClaudeJson = await detailClaudeRes.json();
      expect(detailClaudeJson.user.connections.claude).toBe(true);

      // 3. Check user-oauth-claude (has Claude in OAuth)
      const detailOAuthRes = await fetch(`http://127.0.0.1:${port}/api/admin/users/user-oauth-claude`, {
        headers: { 'x-admin-key': 'test-secret-key-123' }
      });
      const detailOAuthJson = await detailOAuthRes.json();
      expect(detailOAuthJson.user.connections.claude).toBe(true);
    } finally {
      server.close();
    }
  });
});
