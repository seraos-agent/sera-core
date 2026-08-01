#!/usr/bin/env node
/**
 * Sera MCP Stdio Entrypoint
 *
 * This script runs as a standalone process invoked by Claude Desktop (or any
 * MCP client that supports stdio transport). It acts as a thin proxy that:
 *
 * 1. Connects to the running Sera Core server via HTTP
 * 2. Translates MCP stdio messages into HTTP requests
 * 3. Returns the results back over stdio
 *
 * Configuration (via environment variables or Claude Desktop mcp.json):
 *   SERA_API_KEY   — Your Sera API key (generate from the dashboard)
 *   SERA_CORE_URL  — URL of the running Sera Core server (default: http://127.0.0.1:3001)
 *
 * Claude Desktop mcp.json example:
 * {
 *   "mcpServers": {
 *     "sera": {
 *       "command": "node",
 *       "args": ["path/to/sera-mcp-stdio.js"],
 *       "env": {
 *         "SERA_API_KEY": "sk-sera-...",
 *         "SERA_CORE_URL": "http://127.0.0.1:3001"
 *       }
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const SERA_CORE_URL = process.env.SERA_CORE_URL || 'http://127.0.0.1:3001';
const SERA_API_KEY = process.env.SERA_API_KEY || '';

const server = new Server(
  { name: 'sera-agent-stdio', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

/**
 * Proxy a tool call to the running Sera Core /mcp endpoint.
 */
async function proxyToolCall(toolName: string, args: Record<string, any>): Promise<any> {
  const response = await fetch(`${SERA_CORE_URL}/mcp/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERA_API_KEY}`,
    },
    body: JSON.stringify({ name: toolName, arguments: args }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      isError: true,
      content: [{ type: 'text', text: `Sera Core returned HTTP ${response.status}: ${errorText}` }]
    };
  }

  return await response.json();
}

// ── List Tools ─────────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const response = await fetch(`${SERA_CORE_URL}/mcp/tools`, {
      headers: { 'Authorization': `Bearer ${SERA_API_KEY}` },
    });

    if (!response.ok) {
      // Fallback: return a hardcoded list so the user can still see tools
      return { tools: getStaticToolList() };
    }

    return await response.json();
  } catch {
    // Sera Core not running — return static list with a note
    return { tools: getStaticToolList() };
  }
});

// ── Call Tool ──────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!SERA_API_KEY) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: 'SERA_API_KEY environment variable is not set. Generate an API key from the Sera dashboard (Platform Connectors) and add it to your MCP configuration.'
      }]
    };
  }

  try {
    return await proxyToolCall(
      request.params.name,
      (request.params.arguments || {}) as Record<string, any>
    );
  } catch (error: any) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Failed to connect to Sera Core at ${SERA_CORE_URL}. Is the server running? Error: ${error.message}`
      }]
    };
  }
});

function getStaticToolList() {
  return [
    {
      name: 'sera_chat',
      description: 'Send a message to your personal Sera AI agent and receive a response.',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string', description: 'The message to send to Sera' } },
        required: ['message']
      }
    },
    {
      name: 'sera_wallet_balance',
      description: 'Check the current balance and address of your Sera Agent Vault wallet.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'sera_wallet_transfer',
      description: 'Propose a token transfer from your Sera Agent Vault (requires dashboard approval).',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient wallet address' },
          amount: { type: 'string', description: 'Amount to transfer' },
          asset: { type: 'string', description: 'Token symbol (e.g. ETH, USDC)' },
          reason: { type: 'string', description: 'Reason for the transfer' }
        },
        required: ['to', 'amount', 'asset']
      }
    },
    {
      name: 'sera_memory_read',
      description: 'Read your Sera agent\'s confirmed beliefs and working memory.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'sera_billing_status',
      description: 'Check your remaining Sera Agent Credits balance.',
      inputSchema: { type: 'object', properties: {} }
    }
  ];
}

// ── Start ──────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: No console.log here — stdout is reserved for MCP stdio protocol.
}

main().catch(() => process.exit(1));
