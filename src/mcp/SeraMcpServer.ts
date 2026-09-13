import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { McpApiKeyStore } from './McpApiKeyStore';
import { HyperliquidClient } from '../capabilities/hyperliquid/HyperliquidClient';
import { SERA_MCP_TOOLS } from './tools/mcpToolDefinitions';
import { McpChatAndProposalHandler } from './handlers/McpChatAndProposalHandler';
import { McpFinancialHandler } from './handlers/McpFinancialHandler';
import { McpIntegrationHandler } from './handlers/McpIntegrationHandler';

export { SERA_MCP_TOOLS };

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
 */
export interface SeraMcpDependencies {
  apiKeyStore: McpApiKeyStore;
  resolveInstance: (userId: string) => any; // AgentManager.getOrCreateInstance
  getSubscriptionService: () => any;        // AgentManager.getSubscriptionService
}

/**
 * High-level MCP Server facade for SERA.
 * Exposes core agent capabilities, financial operations, and third-party integrations
 * to Claude Desktop, Claude Web, ChatGPT, Cursor, and other external MCP clients.
 */
export class SeraMcpServer {
  private readonly deps: SeraMcpDependencies;
  private readonly hyperliquidClient: HyperliquidClient;
  private readonly chatHandler: McpChatAndProposalHandler;
  private readonly financialHandler: McpFinancialHandler;
  private readonly integrationHandler: McpIntegrationHandler;

  constructor(deps: SeraMcpDependencies) {
    this.deps = deps;
    this.hyperliquidClient = new HyperliquidClient();

    this.chatHandler = new McpChatAndProposalHandler({
      getSubscriptionService: () => this.deps.getSubscriptionService()
    });

    this.financialHandler = new McpFinancialHandler({
      hyperliquidClient: this.hyperliquidClient,
      getSubscriptionService: () => this.deps.getSubscriptionService()
    });

    this.integrationHandler = new McpIntegrationHandler();
  }

  public createServer(defaultUserId?: string): Server {
    let icons: any[] | undefined;
    try {
      const iconPath = join(__dirname, '../../sera-frontend/public/favicon.svg');
      const svgBase64 = readFileSync(iconPath, 'base64');
      icons = [{
        src: `data:image/svg+xml;base64,${svgBase64}`,
        mimeType: 'image/svg+xml'
      }];
    } catch (e) {
      // ignore
    }

    const server = new Server(
      {
        name: 'sera-agent',
        version: '1.2.0',
        icons
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers(server, defaultUserId);
    return server;
  }

  public async handleToolCallDirect(
    toolName: string,
    args: Record<string, any>,
    userId: string,
    instance: any
  ): Promise<any> {
    switch (toolName) {
      // ── Chat & Proposals ──────────────────────────────────────────────────
      case 'sera_chat':
        return await this.chatHandler.handleChat(instance, userId, args.message);
      case 'sera_proposal_approve':
        return await this.chatHandler.handleProposalApprove(instance, args.proposalId);
      case 'sera_proposal_reject':
        return this.chatHandler.handleProposalReject(instance, args.proposalId, args.reason);
      case 'sera_proposal_list':
        return this.chatHandler.handleProposalList(instance);
      case 'sera_schedule_create':
        return this.chatHandler.handleScheduleCreate(instance, args);

      // ── Financial & Trading ───────────────────────────────────────────────
      case 'sera_wallet_balance':
        return await this.financialHandler.handleWalletBalance(instance, userId);
      case 'sera_wallet_transfer':
        return this.financialHandler.handleWalletTransfer(instance, args);
      case 'sera_spot_market_data':
        return await this.financialHandler.handleSpotMarketData(args.coin);
      case 'sera_spot_trade':
        return this.financialHandler.handleSpotTrade(instance, args);
      case 'sera_billing_status':
        return this.financialHandler.handleBillingStatus(userId);

      // ── Ecosystem Integrations & Memory ───────────────────────────────────
      case 'sera_threads_publish':
        return await this.integrationHandler.handleThreadsPublish(instance, userId, args);
      case 'sera_memory_read':
        return this.integrationHandler.handleMemoryRead(instance);
      case 'sera_memory_write':
        return this.integrationHandler.handleMemoryWrite(instance, args);
      case 'sera_gdrive_write':
        return this.integrationHandler.handleGDriveWrite(instance, args);
      case 'sera_gdrive_read':
        return this.integrationHandler.handleGDriveRead(instance, args);
      case 'sera_gdrive_list':
        return this.integrationHandler.handleGDriveList(instance, args);
      case 'sera_gdrive_create_sheet':
        return this.integrationHandler.handleGDriveCreateSheet(instance, args);
      case 'sera_gdrive_append':
        return this.integrationHandler.handleGDriveAppend(instance, args);
      case 'sera_gdrive_delete':
        return this.integrationHandler.handleGDriveDelete(instance, args);
      case 'sera_vault_deep_search':
        return await this.integrationHandler.handleVaultDeepSearch(instance, args);

      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }]
        };
    }
  }

  private setupHandlers(server: Server, defaultUserId?: string): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: SERA_MCP_TOOLS };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = (request.params.arguments || {}) as Record<string, any>;

      const rawToken = (request.params as any)?._meta?.apiKey
        || (request.params as any)?._meta?.authorization
        || (request.params as any)?._meta?.token
        || '';

      let userId = defaultUserId || 'default';
      if (rawToken) {
        const resolved = this.deps.apiKeyStore.resolveUser(rawToken);
        if (resolved) userId = resolved;
      } else if (defaultUserId && defaultUserId !== 'default') {
        const resolved = this.deps.apiKeyStore.resolveUser(defaultUserId);
        userId = resolved || defaultUserId;
      }

      userId = userId.toLowerCase();

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
        return await this.handleToolCallDirect(toolName, args, userId, instance);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Sera encountered an error: ${error.message}` }]
        };
      }
    });
  }
}
