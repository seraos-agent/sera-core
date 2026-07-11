import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_URL = 'http://127.0.0.1:3001/api/mcp';
const SECRET = process.env.SERA_MCP_SECRET || 'sera_secure_internal_mcp_key_9912'; // Fallback for dev

export class McpServerProxy {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'sera-mcp-proxy',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'sera_read_memory',
            description: 'Read SERA\'s confirmed beliefs and memories to understand current context and rules.',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'sera_propose_transfer',
            description: 'Propose a wallet transfer. This will NOT execute immediately. It will be sent to SERA\'s Constitution Engine and wait for human approval.',
            inputSchema: {
              type: 'object',
              properties: {
                action: { type: 'string', description: 'Action name (e.g. transfer_funds)' },
                target: { type: 'string', description: 'Target wallet address' },
                amount: { type: 'string', description: 'Amount to transfer' },
                asset: { type: 'string', description: 'Asset symbol (e.g. ETH, USDC)' },
                description: { type: 'string', description: 'Why this transfer is needed' }
              },
              required: ['action', 'target', 'amount', 'asset', 'description']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (request.params.name === 'sera_read_memory') {
          const res = await fetch(`${API_URL}/memory`, {
            headers: { 'Authorization': `Bearer ${SECRET}` }
          });
          const data = await res.json();
          return {
            content: [{ type: 'text', text: data.text || JSON.stringify(data) }]
          };
        }
        
        if (request.params.name === 'sera_propose_transfer') {
          const res = await fetch(`${API_URL}/proposal`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SECRET}` 
            },
            body: JSON.stringify(request.params.arguments)
          });
          const data = await res.json();
          return {
            content: [{ type: 'text', text: `Proposal submitted to SERA Governance. Intent ID: ${data.intentId}. Wait for human approval.` }]
          };
        }

        throw new Error(`Tool not found: ${request.params.name}`);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to communicate with SERA Core: ${error.message}` }]
        };
      }
    });
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // Note: No console.log here because it breaks stdio!
  }
}
