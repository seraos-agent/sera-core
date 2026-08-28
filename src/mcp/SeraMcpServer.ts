import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { join } from 'path';
import { McpApiKeyStore } from './McpApiKeyStore';
import { EventTypes, StandardEvent } from '../core/events/types';
import { HyperliquidClient } from '../capabilities/hyperliquid/HyperliquidClient';

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
 * Comprehensive Tool definitions for Sera's MCP Server.
 * Exposes core Sera capabilities to Claude Desktop, Claude Web, ChatGPT, and other LLMs.
 */
export const SERA_MCP_TOOLS = [
  {
    name: 'sera_chat',
    description: 'Send a conversational message or task instruction to your personal Sera AI agent and receive a full reasoning response. Sera can perform crypto analysis, task automation, and trigger creation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The message or prompt to send to Sera' }
      },
      required: ['message']
    }
  },
  {
    name: 'sera_wallet_balance',
    description: 'Check the real-time balance and on-chain address of your Sera Agent Vault wallet on the Base network.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sera_wallet_transfer',
    description: 'Create a governance proposal for a token transfer (ETH, USDC) from your Sera Agent Vault on Base. Requires dashboard approval for safety.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient EVM address on Base' },
        amount: { type: 'string', description: 'Amount to transfer' },
        asset: { type: 'string', description: 'Token symbol (e.g. ETH, USDC)' },
        reason: { type: 'string', description: 'Reason for the transfer' }
      },
      required: ['to', 'amount', 'asset']
    }
  },
  {
    name: 'sera_spot_market_data',
    description: 'Query live sub-second orderbook prices, 24h change, and metrics from Hyperliquid L1 DEX for any spot token (e.g. HYPE, PURR, BTC, ETH, SOL).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        coin: { type: 'string', description: 'Token symbol (e.g. HYPE, PURR, BTC, ETH, SOL)' }
      },
      required: ['coin']
    }
  },
  {
    name: 'sera_spot_trade',
    description: 'Propose a Hyperliquid Spot market buy or sell trade from your connected agent account. Creates a governance proposal for approval.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        coin: { type: 'string', description: 'Spot token symbol (e.g. HYPE, PURR, BTC)' },
        side: { type: 'string', enum: ['buy', 'sell'], description: 'Trade side: buy or sell' },
        amount: { type: 'number', description: 'Amount in USDC or token units to trade' }
      },
      required: ['coin', 'side', 'amount']
    }
  },
  {
    name: 'sera_schedule_create',
    description: 'Create an autonomous 24/7 background scheduled task or cron job on SERA (e.g. dynamic social media posting, hourly price monitoring).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cronExpression: { type: 'string', description: 'Standard 5-part cron expression (e.g. "0 */2 * * *" for every 2 hours, "*/15 * * * *" for every 15 mins)' },
        actionIntent: { type: 'string', description: 'Target action intent (e.g. "DYNAMIC_SCHEDULED_ACTION", "CHECK_WALLET_BALANCE")' },
        taskPrompt: { type: 'string', description: 'Detailed instruction or guidelines for the autonomous agent to execute on schedule' }
      },
      required: ['cronExpression', 'actionIntent', 'taskPrompt']
    }
  },
  {
    name: 'sera_threads_publish',
    description: 'Publish a new post directly to your connected Meta Threads account via SERA.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Content of the Threads post (punchy, authentic, max 1-3 lines, no hashtags)' },
        imageUrl: { type: 'string', description: 'Optional public image URL to attach to the post' }
      },
      required: ['text']
    }
  },
  {
    name: 'sera_memory_read',
    description: 'Read your Sera agent\'s confirmed long-term beliefs, facts, and working memory.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sera_memory_write',
    description: 'Save a key preference, fact, or insight into Sera\'s persistent long-term memory so Sera remembers it in future chats.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Short descriptive key for the memory (e.g. "user_trading_style", "preferred_tokens")' },
        value: { type: 'string', description: 'The fact, insight, or preference to remember' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'sera_billing_status',
    description: 'Check your remaining Sera Agent Credits and subscription entitlement status.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  }
];

export class SeraMcpServer {
  private deps: SeraMcpDependencies;
  private hyperliquidClient: HyperliquidClient;

  constructor(deps: SeraMcpDependencies) {
    this.deps = deps;
    this.hyperliquidClient = new HyperliquidClient();
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
      case 'sera_chat':
        return await this.handleChat(instance, userId, args.message);
      case 'sera_wallet_balance':
        return await this.handleWalletBalance(instance, userId);
      case 'sera_wallet_transfer':
        return this.handleWalletTransfer(instance, args);
      case 'sera_spot_market_data':
        return await this.handleSpotMarketData(args.coin);
      case 'sera_spot_trade':
        return this.handleSpotTrade(instance, args);
      case 'sera_schedule_create':
        return this.handleScheduleCreate(instance, args);
      case 'sera_threads_publish':
        return await this.handleThreadsPublish(instance, userId, args);
      case 'sera_memory_read':
        return this.handleMemoryRead(instance);
      case 'sera_memory_write':
        return this.handleMemoryWrite(instance, args);
      case 'sera_billing_status':
        return this.handleBillingStatus(userId);
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

  // ── Tool Implementations ──────────────────────────────────────────────────

  private async handleChat(instance: any, userId: string, message: string): Promise<any> {
    if (!message || typeof message !== 'string' || !message.trim()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'A message is required.' }]
      };
    }

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
      }, 35_000);

      const onSpeak = (event: any) => {
        clearTimeout(timeout);
        instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
        instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);
        const payload = event.payload || event;
        resolve({
          content: [{ type: 'text', text: payload.text || 'Sera completed the response.' }]
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
            text: `📋 Sera has generated a governance proposal (ID: ${payload.proposalId}).\n\nIntent: ${payload.intent}\nParameters: ${JSON.stringify(payload.parameters, null, 2)}\n\n⚠️ Please review and approve on your Sera dashboard.`
          }]
        });
      };

      instance.eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
      instance.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);

      const event: StandardEvent = {
        id: `evt-mcp-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'McpServer',
        payload: { message: message.trim() },
        timestamp: Date.now(),
      };
      instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);

      instance.chatHistoryStore.appendUiMessage({
        id: event.timestamp,
        role: 'user',
        content: message.trim(),
      });
    });
  }

  private async handleWalletBalance(instance: any, userId?: string): Promise<any> {
    if (instance.goalBridge?.walletInitializing) {
      try {
        await instance.goalBridge.walletInitializing;
      } catch (e) {
        // ignore initialization error and fallback to state
      }
    }

    const walletState = instance.worldStateService?.getWalletState?.();

    // 1. Personal Wallet is the authenticated user's external Web3 address
    let personalAddress = (userId && userId.startsWith('0x') && userId.length === 42)
      ? userId
      : walletState?.address;

    // 2. Agent Vault Address is the autonomous 1:1 agent custodial wallet on Base
    let vaultAddress = walletState?.vaultAddress || instance.goalBridge?.currentWalletId?.address;

    // If vaultAddress is somehow duplicated with personal address, resolve true agent vault
    if (vaultAddress && personalAddress && vaultAddress.toLowerCase() === personalAddress.toLowerCase()) {
      const bridgeVault = instance.goalBridge?.currentWalletId?.address;
      vaultAddress = (bridgeVault && bridgeVault.toLowerCase() !== personalAddress.toLowerCase())
        ? bridgeVault
        : undefined;
    }

    if (!personalAddress && !vaultAddress) {
      return {
        content: [{
          type: 'text',
          text: 'No wallet is currently connected to your Sera agent. Please set up a wallet on the Sera dashboard first.'
        }]
      };
    }

    const lines = [
      `**Sera Agent Vault & Balances (Base Network)**`,
      `• Personal Wallet: \`${personalAddress || 'N/A'}\``,
      `• Agent Vault Address: \`${vaultAddress || 'Synchronizing with Base chain...'}\``,
      `• Network: Base Mainnet`,
      `• Vault Balance: ${walletState?.vaultBalance ?? '0'} USDC`,
      `• Personal Wallet Balance: ${walletState?.balance ?? '0'} USDC`,
    ];

    if (walletState?.updatedAt) {
      lines.push(`• Last Updated: ${new Date(walletState.updatedAt).toISOString()}`);
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }]
    };
  }

  private handleWalletTransfer(instance: any, args: Record<string, any>): any {
    const { to, amount, asset, reason } = args;
    if (!to || !amount || !asset) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Missing required parameters: to, amount, asset' }]
      };
    }

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
        text: `✅ Transfer proposal created on Sera.\n\n• Recipient: \`${to}\`\n• Amount: **${amount} ${asset.toUpperCase()}**\n• Reason: ${reason || 'N/A'}\n\n⚠️ Requires approval on the Sera dashboard to execute on-chain.`
      }]
    };
  }

  private async handleSpotMarketData(coin: string): Promise<any> {
    if (!coin) {
      return { isError: true, content: [{ type: 'text', text: 'coin parameter is required (e.g. HYPE, PURR, BTC, ETH, SOL)' }] };
    }
    try {
      const data = await this.hyperliquidClient.getSpotMarketData(coin.toUpperCase());
      const sign = data.priceChange24hPercent >= 0 ? '+' : '';
      return {
        content: [{
          type: 'text',
          text: `**Hyperliquid L1 DEX — ${data.coin}/USDC**\n• Mid Price: $${data.midPrice.toLocaleString()}\n• 24h Change: ${sign}${data.priceChange24hPercent}%\n• 24h Volume: $${data.volume24h.toLocaleString()}\n• Best Bid: $${data.bestBid} | Best Ask: $${data.bestAsk}`
        }]
      };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to fetch Hyperliquid market data for ${coin}: ${e.message}` }] };
    }
  }

  private handleSpotTrade(instance: any, args: Record<string, any>): any {
    const { coin, side, amount } = args;
    const proposalEvent: StandardEvent = {
      id: `evt-mcp-spot-${Date.now()}`,
      type: EventTypes.SYSTEM_PROPOSE_GOAL,
      source: 'McpServer',
      timestamp: Date.now(),
      payload: {
        intent: 'HL_SPOT_ORDER',
        parameters: {
          coin: coin.toUpperCase(),
          side: side.toLowerCase(),
          amount: parseFloat(amount),
          orderType: 'market'
        },
        userMessage: `Hyperliquid Spot ${side.toUpperCase()} ${amount} of ${coin.toUpperCase()}`
      }
    };
    instance.eventBus.emit(EventTypes.SYSTEM_PROPOSE_GOAL, proposalEvent);

    return {
      content: [{
        type: 'text',
        text: `✅ Hyperliquid Spot trade proposal created on Sera.\n\n• Market: **${coin.toUpperCase()}/USDC**\n• Side: **${side.toUpperCase()}**\n• Size: **${amount}**\n\n⚠️ Open your Sera dashboard to review and approve execution.`
      }]
    };
  }

  private handleScheduleCreate(instance: any, args: Record<string, any>): any {
    const { cronExpression, actionIntent, taskPrompt } = args;
    const proposalEvent: StandardEvent = {
      id: `evt-mcp-schedule-${Date.now()}`,
      type: EventTypes.SYSTEM_PROPOSE_GOAL,
      source: 'McpServer',
      timestamp: Date.now(),
      payload: {
        intent: 'SCHEDULE_GOAL',
        parameters: {
          scheduleType: 'cron',
          cronExpression: cronExpression || '0 */2 * * *',
          humanIntent: `Scheduled ${actionIntent}`,
          actionIntent: actionIntent || 'DYNAMIC_SCHEDULED_ACTION',
          actionParameters: { taskPrompt: taskPrompt || 'Execute automated background task.' }
        },
        userMessage: `Create schedule ${cronExpression}: ${taskPrompt}`
      }
    };
    instance.eventBus.emit(EventTypes.SYSTEM_PROPOSE_GOAL, proposalEvent);

    return {
      content: [{
        type: 'text',
        text: `✅ Background schedule proposal registered on Sera.\n\n• Cron: \`${cronExpression}\`\n• Action: \`${actionIntent}\`\n• Task: "${taskPrompt}"\n\n⚠️ Proposal is pending on your Sera dashboard.`
      }]
    };
  }

  private async handleThreadsPublish(instance: any, userId: string, args: Record<string, any>): Promise<any> {
    const { text, imageUrl } = args;
    if (!text) {
      return { isError: true, content: [{ type: 'text', text: 'Post text is required.' }] };
    }

    try {
      const threadsApi = instance.runtime?.threadsApi;
      if (!threadsApi) {
        throw new Error('Threads capability is not initialized on this instance.');
      }

      const postId = await threadsApi.publishPost(userId, text.trim(), undefined, imageUrl);
      return {
        content: [{
          type: 'text',
          text: `🎉 Successfully published post to Meta Threads!\n\n• Post ID: \`${postId}\`\n• Text: "${text.trim()}"`
        }]
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to publish to Threads: ${e.message}` }]
      };
    }
  }

  private handleMemoryRead(instance: any): any {
    const memoryStore = instance.memoryStore;
    if (!memoryStore) {
      return { content: [{ type: 'text', text: 'Memory store is not available.' }] };
    }

    const allBeliefs = typeof memoryStore.getAllBeliefs === 'function'
      ? memoryStore.getAllBeliefs()
      : [];

    const activeBeliefs = allBeliefs.filter((b: any) => b.status === 'ACTIVE');
    if (activeBeliefs.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'Sera\'s persistent memory is currently empty. Interact with Sera to build up memories and preferences.'
        }]
      };
    }

    const formatted = activeBeliefs
      .map((b: any) => `• **${b.key}**: ${typeof b.value === 'string' ? b.value : JSON.stringify(b.value)}`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `**Sera Persistent Memory** (${activeBeliefs.length} active beliefs)\n\n${formatted}`
      }]
    };
  }

  private handleMemoryWrite(instance: any, args: Record<string, any>): any {
    const { key, value } = args;
    if (!key || !value) {
      return { isError: true, content: [{ type: 'text', text: 'Both key and value are required.' }] };
    }

    try {
      if (instance.memoryStore?.setBelief) {
        instance.memoryStore.setBelief(key, value);
      }
      return {
        content: [{
          type: 'text',
          text: `🧠 Successfully stored into Sera long-term memory: **${key}** = "${value}"`
        }]
      };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to write memory: ${e.message}` }] };
    }
  }

  private handleBillingStatus(userId: string): any {
    const subscriptionService = this.deps.getSubscriptionService();
    const credits = subscriptionService.getAgentCredits(userId);
    const hasEntitlement = subscriptionService.hasActiveEntitlement(userId);

    const displayCredits = credits === Infinity ? '∞ (Dev Mode)' : credits.toLocaleString();

    return {
      content: [{
        type: 'text',
        text: `**Sera Billing Status**\n\n• Agent Credits: **${displayCredits}**\n• Status: ${hasEntitlement ? '✅ Active' : '⚠️ Inactive — top up required'}`
      }]
    };
  }
}
