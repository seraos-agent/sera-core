import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { join } from 'path';
import { McpApiKeyStore } from './McpApiKeyStore';
import { EventTypes, StandardEvent } from '../core/events/types';

/**
 * Resolved context after authenticating an MCP request.
 * Contains everything needed to interact with the user's Sera agent.
 */
export interface McpUserContext {
  userId: string;
  instance: any; // SeraAgentInstance — typed as `any` to avoid circular imports
}

/**
 * Dependency container injected into the MCP server at startup.
 * This follows the same pattern as server/index.ts: the server boundary
 * is an adapter, not the composition root.
 */
export interface SeraMcpDependencies {
  apiKeyStore: McpApiKeyStore;
  resolveInstance: (userId: string) => any; // AgentManager.getOrCreateInstance
  getSubscriptionService: () => any;        // AgentManager.getSubscriptionService
}

/**
 * Tool definitions for Sera's MCP Server.
 * These are the capabilities exposed to external AI platforms.
 */
const SERA_MCP_TOOLS = [
  {
    name: 'sera_chat',
    description: 'Send a message to your personal Sera AI agent and receive a response. Sera can help with crypto operations, task automation, and general conversation. The response may include proposals that need approval on the Sera dashboard.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The message to send to Sera' }
      },
      required: ['message']
    }
  },
  {
    name: 'sera_wallet_balance',
    description: 'Check the current balance and address of your Sera Agent Vault wallet.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sera_wallet_transfer',
    description: 'Propose a token transfer from your Sera Agent Vault. This does NOT execute immediately — it creates a governance proposal that must be approved on your Sera dashboard.',
    inputSchema: {
      type: 'object' as const,
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
    description: 'Read your Sera agent\'s confirmed beliefs and working memory. This shows what Sera currently knows about you and your preferences.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sera_billing_status',
    description: 'Check your remaining Sera Agent Credits balance and subscription status.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  }
];

/**
 * Core MCP Server for Sera.
 *
 * Exposes Sera's capabilities as MCP tools that can be consumed by
 * Claude Desktop, ChatGPT, and any MCP-compatible AI platform.
 *
 * Architecture: This is a transport adapter (like Socket.io in server/index.ts).
 * It translates MCP tool calls into EventBus events on the user's
 * SeraAgentInstance.
 */
export class SeraMcpServer {
  private deps: SeraMcpDependencies;

  constructor(deps: SeraMcpDependencies) {
    this.deps = deps;
  }

  /**
   * Creates a new Server instance configured with Sera's tools.
   * Required for transports like SSE where each connection needs its own Server instance.
   * @param defaultApiKey Optional API key to use for all requests on this server instance (used by SSE).
   */
  public createServer(defaultApiKey?: string): Server {
    let icons: any[] | undefined;
    try {
      const iconPath = join(__dirname, '../../sera-frontend/public/favicon.svg');
      const svgBase64 = readFileSync(iconPath, 'base64');
      icons = [{
        src: `data:image/svg+xml;base64,${svgBase64}`,
        mimeType: 'image/svg+xml'
      }];
    } catch (e) {
      console.warn('[SeraMcpServer] Could not load Sera logo for MCP serverInfo.');
    }

    const server = new Server(
      {
        name: 'sera-agent',
        version: '1.0.0',
        icons
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers(server, defaultApiKey);
    return server;
  }


  /**
   * Direct tool call handler for the HTTP proxy route.
   * Bypasses the MCP SDK's internal request pipeline and calls
   * the tool handlers directly with a pre-resolved user + instance.
   */
  public async handleToolCallDirect(
    toolName: string,
    args: Record<string, any>,
    userId: string,
    instance: any
  ): Promise<any> {
    switch (toolName) {
      case 'sera_chat':
        return await this.handleChat(instance, userId, args.message);
      case 'sera_wallet_balance':
        return this.handleWalletBalance(instance);
      case 'sera_wallet_transfer':
        return this.handleWalletTransfer(instance, args);
      case 'sera_memory_read':
        return this.handleMemoryRead(instance);
      case 'sera_billing_status':
        return this.handleBillingStatus(userId);
      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }]
        };
    }
  }

  private setupHandlers(server: Server, defaultApiKey?: string): void {
    // ── List Tools ─────────────────────────────────────────────────────────
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: SERA_MCP_TOOLS };
    });

    // ── Call Tool ──────────────────────────────────────────────────────────
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = (request.params.arguments || {}) as Record<string, any>;

      // For V1, the API key is passed via the _meta field or environment.
      // In Streamable HTTP, it comes from the Authorization header (handled by
      // the HTTP middleware before reaching here).
      // In stdio mode, it comes from the SERA_API_KEY environment variable.
      // In SSE mode, it comes from the defaultApiKey passed to createServer.
      const apiKey = defaultApiKey
        || (request.params as any)?._meta?.apiKey
        || process.env.SERA_API_KEY
        || '';

      const userId = this.deps.apiKeyStore.resolveUser(apiKey);
      if (!userId) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: 'Authentication failed. Please provide a valid Sera API key. You can generate one from the Sera dashboard under Platform Connectors.'
          }]
        };
      }

      // Resolve the user's agent instance
      const instance = this.deps.resolveInstance(userId);
      if (!instance) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: 'Unable to initialize your Sera agent instance. Please ensure your account is active.'
          }]
        };
      }

      try {
        switch (toolName) {
          case 'sera_chat':
            return await this.handleChat(instance, userId, args.message);
          case 'sera_wallet_balance':
            return this.handleWalletBalance(instance);
          case 'sera_wallet_transfer':
            return this.handleWalletTransfer(instance, args);
          case 'sera_memory_read':
            return this.handleMemoryRead(instance);
          case 'sera_billing_status':
            return this.handleBillingStatus(userId);
          default:
            return {
              isError: true,
              content: [{ type: 'text', text: `Unknown tool: ${toolName}` }]
            };
        }
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Sera encountered an error: ${error.message}` }]
        };
      }
    });
  }

  // ── Tool Implementations ──────────────────────────────────────────────────

  /**
   * sera_chat: Send a message to the user's DialogueEngine and await the response.
   *
   * This mirrors the Socket.io `chat:message` handler in server/index.ts,
   * but uses a Promise-based pattern to capture the AGENT_SPEAK response.
   */
  private async handleChat(instance: any, userId: string, message: string): Promise<any> {
    if (!message || typeof message !== 'string' || !message.trim()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'A message is required.' }]
      };
    }

    // Check credit balance before processing
    const subscriptionService = this.deps.getSubscriptionService();
    const credits = subscriptionService.getAgentCredits(userId);
    if (credits <= 0) {
      return {
        content: [{
          type: 'text',
          text: '🔋 Agent Energy Core depleted. Please top up your tokens on the Sera dashboard to continue.'
        }]
      };
    }

    // Create a one-shot listener that captures the agent's response
    return new Promise<any>((resolve) => {
      const timeout = setTimeout(() => {
        instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
        instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);
        resolve({
          content: [{
            type: 'text',
            text: 'Sera is still processing your request. Please check the Sera dashboard for updates.'
          }]
        });
      }, 30_000); // 30s timeout for complex operations

      const onSpeak = (event: any) => {
        clearTimeout(timeout);
        instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
        instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);
        const payload = event.payload || event;
        resolve({
          content: [{ type: 'text', text: payload.text || 'Sera responded but the message was empty.' }]
        });
      };

      const onProposal = (event: any) => {
        clearTimeout(timeout);
        instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
        instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);
        const payload = event.payload || event;
        resolve({
          content: [{
            type: 'text',
            text: `📋 Sera has generated a governance proposal (ID: ${payload.proposalId}).\n\nIntent: ${payload.intent}\nParameters: ${JSON.stringify(payload.parameters, null, 2)}\n\n⚠️ Please open the Sera dashboard to review and approve/reject this proposal.`
          }]
        });
      };

      instance.eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
      instance.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);

      // Emit the user message — exactly like server/index.ts line 547-555
      const event: StandardEvent = {
        id: `evt-mcp-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'McpServer',
        payload: { message: message.trim() },
        timestamp: Date.now(),
      };
      instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);

      // Also store in chat history for continuity
      instance.chatHistoryStore.appendUiMessage({
        id: event.timestamp,
        role: 'user',
        content: message.trim(),
      });
    });
  }

  /**
   * sera_wallet_balance: Returns the current wallet state from WorldStateService.
   */
  private handleWalletBalance(instance: any): any {
    const walletState = instance.worldStateService.getWalletState();
    if (!walletState || !walletState.address) {
      return {
        content: [{
          type: 'text',
          text: 'No wallet is currently connected to your Sera agent. Please set up a wallet on the Sera dashboard first.'
        }]
      };
    }

    const lines = [
      `**Sera Agent Vault**`,
      `Address: \`${walletState.address}\``,
      `Network: ${walletState.network || 'Base'}`,
      `Vault Balance: ${walletState.vaultBalance ?? 'Unknown'} USDC`,
      `Main Wallet Balance: ${walletState.balance ?? 'Unknown'} USDC`,
    ];

    if (walletState.updatedAt) {
      lines.push(`Last updated: ${new Date(walletState.updatedAt).toISOString()}`);
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }]
    };
  }

  /**
   * sera_wallet_transfer: Creates a governance proposal for a transfer.
   * The transfer is NOT executed immediately — it requires approval on the Sera dashboard.
   */
  private handleWalletTransfer(instance: any, args: Record<string, any>): any {
    const { to, amount, asset, reason } = args;
    if (!to || !amount || !asset) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Missing required parameters: to, amount, asset' }]
      };
    }

    // Emit SYSTEM_PROPOSE_GOAL — this follows the same path as DialogueEngine line 412
    const proposalEvent: StandardEvent = {
      id: `evt-mcp-proposal-${Date.now()}`,
      type: EventTypes.SYSTEM_PROPOSE_GOAL,
      source: 'McpServer',
      timestamp: Date.now(),
      payload: {
        intent: 'TRANSFER_FUNDS',
        parameters: {
          recipientAddress: to,
          amount: parseFloat(amount),
          asset: asset.toUpperCase(),
        },
        userMessage: reason || `Transfer ${amount} ${asset} to ${to}`
      }
    };
    instance.eventBus.emit(EventTypes.SYSTEM_PROPOSE_GOAL, proposalEvent);

    return {
      content: [{
        type: 'text',
        text: `✅ Transfer proposal submitted to Sera governance.\n\n- To: ${to}\n- Amount: ${amount} ${asset.toUpperCase()}\n- Reason: ${reason || 'N/A'}\n\n⚠️ This transfer will NOT execute until you approve it on the Sera dashboard.`
      }]
    };
  }

  /**
   * sera_memory_read: Returns the current working memory beliefs.
   */
  private handleMemoryRead(instance: any): any {
    const memoryStore = instance.memoryStore;
    if (!memoryStore) {
      return {
        content: [{ type: 'text', text: 'Memory store is not available.' }]
      };
    }

    // Access beliefs from WorkingMemory
    const allBeliefs = typeof memoryStore.getAllBeliefs === 'function'
      ? memoryStore.getAllBeliefs()
      : [];

    if (allBeliefs.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'Sera\'s working memory is currently empty. Interact with Sera to build up beliefs and preferences.'
        }]
      };
    }

    const formatted = allBeliefs
      .filter((b: any) => b.status === 'ACTIVE')
      .map((b: any) => `- **${b.key}**: ${typeof b.value === 'string' ? b.value : JSON.stringify(b.value)}`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `**Sera Working Memory** (${allBeliefs.filter((b: any) => b.status === 'ACTIVE').length} active beliefs)\n\n${formatted || 'No active beliefs found.'}`
      }]
    };
  }

  /**
   * sera_billing_status: Returns the current Agent Credits balance.
   */
  private handleBillingStatus(userId: string): any {
    const subscriptionService = this.deps.getSubscriptionService();
    const credits = subscriptionService.getAgentCredits(userId);
    const hasEntitlement = subscriptionService.hasActiveEntitlement(userId);

    const displayCredits = credits === Infinity ? '∞ (Dev Mode)' : credits.toLocaleString();

    return {
      content: [{
        type: 'text',
        text: `**Sera Billing Status**\n\nAgent Credits: ${displayCredits}\nStatus: ${hasEntitlement ? '✅ Active' : '⚠️ Inactive — top up required'}\n\nEach chat interaction consumes 1,000 credits. Top up via the Sera dashboard.`
      }]
    };
  }
}
