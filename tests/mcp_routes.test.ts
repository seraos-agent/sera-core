import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createMcpRouter } from '../src/server/routes/mcpRoutes';
import { McpApiKeyStore } from '../src/mcp/McpApiKeyStore';
import { SeraMcpServer } from '../src/mcp/SeraMcpServer';

describe('MCP Routes & Streamable HTTP Transport', () => {
  let app: express.Express;
  let apiKeyStore: McpApiKeyStore;
  let seraMcpServer: SeraMcpServer;
  let mockAgentManager: any;

  const standardHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };

  beforeEach(() => {
    apiKeyStore = new McpApiKeyStore();
    apiKeyStore.generateKey('test-user');

    mockAgentManager = {
      getOrCreateInstance: (userId: string) => ({
        sessionId: userId,
        worldStateService: {
          getWalletState: () => ({
            address: '0x1234567890123456789012345678901234567890',
            balance: 0,
            ethBalance: 0,
            network: 'Base'
          })
        },
        memoryVault: {},
        chatHistoryStore: { ensureLoaded: async () => {}, getUiMessages: () => [] },
        triggerStore: { ensureLoaded: async () => {}, getAll: () => [] },
        observationStore: { getAll: () => [] },
        autonomyAgreementStore: { getAll: () => [] }
      }),
      getSubscriptionService: () => ({
        getRemainingPeriods: () => 1,
        getAgentCredits: () => 1000
      })
    };

    seraMcpServer = new SeraMcpServer({
      apiKeyStore,
      resolveInstance: (id) => mockAgentManager.getOrCreateInstance(id),
      getSubscriptionService: () => mockAgentManager.getSubscriptionService()
    });

    app = express();
    app.use(createMcpRouter({
      mcpApiKeyStore: apiKeyStore,
      seraMcpServer,
      agentManager: mockAgentManager
    }));
  });

  it('handles initialize request on POST / with JSON-RPC 2.0 protocol info', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: standardHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
          }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(1);
      expect(data.result.capabilities.tools).toBeDefined();
    } finally {
      server.close();
    }
  });

  it('handles tools/list request on POST / returning all 10 SERA tools', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: standardHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result.tools).toBeDefined();
      expect(data.result.tools.length).toBe(14);
      const toolNames = data.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('sera_chat');
      expect(toolNames).toContain('sera_wallet_balance');
      expect(toolNames).toContain('sera_threads_publish');
      expect(toolNames).toContain('sera_gdrive_write');
      expect(toolNames).toContain('sera_gdrive_read');
      expect(toolNames).toContain('sera_gdrive_list');
      expect(toolNames).toContain('sera_gdrive_create_sheet');
    } finally {
      server.close();
    }
  });

  it('handles tools/call on POST / executing wallet balance query', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: standardHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'sera_wallet_balance',
            arguments: {}
          }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result.content[0].type).toBe('text');
      expect(data.result.content[0].text).toContain('Sera Agent Vault & Balances');
    } finally {
      server.close();
    }
  });

  it('returns 405 on DELETE / in stateless mode', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'DELETE' });
      expect(res.status).toBe(405);
    } finally {
      server.close();
    }
  });

  it('allows CORS preflight with Mcp-Session-Id header', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'OPTIONS' });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-headers')).toContain('Mcp-Session-Id');
    } finally {
      server.close();
    }
  });
});
