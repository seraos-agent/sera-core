import express, { Router, Request, Response, NextFunction } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpApiKeyStore } from '../../mcp/McpApiKeyStore';
import { SeraMcpServer, SERA_MCP_TOOLS } from '../../mcp/SeraMcpServer';
import { AgentManager } from '../AgentManager';

export interface McpRouterDependencies {
  mcpApiKeyStore: McpApiKeyStore;
  seraMcpServer: SeraMcpServer;
  agentManager: AgentManager;
}

export function createMcpRouter(deps: McpRouterDependencies): Router {
  const router = Router();
  const { mcpApiKeyStore, seraMcpServer, agentManager } = deps;

  const mcpTransports = new Map<string, SSEServerTransport>();

  // Express CORS and body parser for all MCP and SSE routes
  const mcpCorsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Mcp-Session-Id');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  };

  // Apply CORS middleware and body parsers to MCP routes
  router.use(mcpCorsMiddleware);

  const resolveUserFromRequest = (req: Request): string => {
    const authHeader = (req.headers.authorization as string) || '';
    const tokenCandidate = (req.query.apiKey as string) || (req.query.token as string) || authHeader.replace(/^Bearer\s+/i, '') || '';
    let userId = 'default';
    if (tokenCandidate) {
      const resolved = mcpApiKeyStore.resolveUser(tokenCandidate);
      if (resolved) userId = resolved;
    }
    return userId.toLowerCase();
  };

  // ── 1. Streamable HTTP Transport (Stateless, Industry Standard) ─────────────
  const handleStreamableHTTP = async (req: Request, res: Response) => {
    const userId = resolveUserFromRequest(req);
    console.log(`[MCP Streamable HTTP] POST ${req.path} | User: ${userId} | Method: ${(req.body as any)?.method}`);

    try {
      // Create a fresh stateless transport per request (sessionIdGenerator: undefined)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      // Create a dedicated MCP Server instance bound to this user
      const serverInstance = seraMcpServer.createServer(userId);
      await serverInstance.connect(transport);

      // Handle the request and send the response
      await transport.handleRequest(req, res, req.body);

      // Clean up after response is sent
      res.on('close', () => {
        transport.close().catch(() => {});
        serverInstance.close().catch(() => {});
      });
    } catch (error: any) {
      console.error('[MCP Streamable HTTP] Error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: (req.body as any)?.id ?? null
        });
      }
    }
  };

  // ── 2. Legacy SSE Handshake ────────────────────────────────────────────────
  const handleSse = async (req: Request, res: Response) => {
    const userId = resolveUserFromRequest(req);
    console.log(`[MCP SSE] Incoming SSE connection. User: ${userId}`);

    // Construct canonical endpoint URL for message posts
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const baseUrl = isLocal ? `http://${host}` : 'https://mcp.seraos.xyz';
    const messageEndpoint = `${baseUrl}/message`;

    // Create a dedicated transport for this connection using the absolute URL
    const transport = new SSEServerTransport(messageEndpoint, res);
    mcpTransports.set(transport.sessionId, transport);

    // Create and connect the MCP Server instance bound strictly to this user
    const serverInstance = seraMcpServer.createServer(userId);
    await serverInstance.connect(transport);

    res.on('close', () => {
      mcpTransports.delete(transport.sessionId);
    });
  };

  // ── 3. Legacy Post Message Handler with Stateless Cross-Replica Fail-Safe ──
  const handlePostMessage = async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = mcpTransports.get(sessionId);
    if (transport) {
      return await transport.handlePostMessage(req, res, req.body);
    }

    // Stateless fallback if session was closed or initialized on another replica
    const body = req.body;
    const id = body?.id;
    const method = body?.method;
    const params = body?.params || {};
    const userId = resolveUserFromRequest(req);

    console.log(`[MCP Stateless Message Fallback] Method: ${method}, User: ${userId}, SessionId: ${sessionId}`);

    if (method === 'initialize') {
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'SERA MCP Server', version: '1.2.0' }
        }
      });
    }

    if (method === 'notifications/initialized' || method === 'ping') {
      return res.status(200).json({ jsonrpc: '2.0', id, result: {} });
    }

    if (method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: { tools: SERA_MCP_TOOLS }
      });
    }

    if (method === 'tools/call') {
      const toolName = params.name;
      const args = params.arguments || {};
      const instance = agentManager.getOrCreateInstance(userId);
      try {
        const result = await seraMcpServer.handleToolCallDirect(toolName, args, userId, instance);
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result
        });
      } catch (e: any) {
        console.error(`[MCP Stateless Call Error] Tool: ${toolName}, Error:`, e);
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: e.message || 'Internal tool execution error' }
        });
      }
    }

    return res.status(200).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  };

  // ── Route Mounts ───────────────────────────────────────────────────────────
  // Streamable HTTP Routes (at Root and /mcp)
  router.post('/', express.json(), handleStreamableHTTP);
  router.post('/mcp', express.json(), handleStreamableHTTP);

  router.delete('/', (req, res) => {
    res.status(405).json({ error: 'Session termination not supported in stateless mode.' });
  });
  router.delete('/mcp', (req, res) => {
    res.status(405).json({ error: 'Session termination not supported in stateless mode.' });
  });

  // SSE Routes
  router.get('/mcp/sse', handleSse);
  router.get('/sse', handleSse);
  router.get('/mcp', (req, res) => {
    if (req.headers.accept?.includes('text/event-stream') || req.query.sessionId) {
      return handleSse(req, res);
    }
    res.status(405).json({ error: 'Method Not Allowed. Use POST /mcp for MCP requests.' });
  });

  // Legacy POST Message Routes
  router.post('/mcp/message', express.json(), handlePostMessage);
  router.post('/message', express.json(), handlePostMessage);

  return router;
}
