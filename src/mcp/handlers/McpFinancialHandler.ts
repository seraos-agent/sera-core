import { EventTypes, ProposeGoalPayload } from '../../core/events/types';
import { HyperliquidClient } from '../../capabilities/hyperliquid/HyperliquidClient';

export interface McpFinancialDependencies {
  hyperliquidClient: HyperliquidClient;
  getSubscriptionService: () => any;
}

/**
 * Handles Web3 wallet balances, transfers on Base network,
 * Hyperliquid spot market data/trading, and billing credit inquiries via MCP.
 */
export class McpFinancialHandler {
  constructor(private readonly deps: McpFinancialDependencies) {}

  public async handleWalletBalance(instance: any, userId?: string): Promise<any> {
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

  public handleWalletTransfer(instance: any, args: Record<string, any>): any {
    const { to, amount, asset, reason } = args;
    if (!to || !amount || !asset) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Missing required parameters: to, amount, asset' }]
      };
    }

    const payload: ProposeGoalPayload = {
      intent: 'TRANSFER_FUNDS',
      parameters: {
        recipientAddress: to,
        amount: parseFloat(amount),
        asset: asset.toUpperCase(),
      },
      userMessage: reason || `Transfer ${amount} ${asset} to ${to}`
    };

    const proposalId = instance.proposalManager?.createProposal
      ? instance.proposalManager.createProposal(payload)
      : `prop-${Date.now()}`;

    if (!instance.proposalManager?.createProposal) {
      instance.eventBus.emit(EventTypes.SYSTEM_PROPOSE_GOAL, {
        id: `evt-mcp-proposal-${Date.now()}`,
        type: EventTypes.SYSTEM_PROPOSE_GOAL,
        source: 'McpServer',
        timestamp: Date.now(),
        payload
      });
    }

    return {
      content: [{
        type: 'text',
        text: `📋 **Transfer Proposal Created**\n\n• **Proposal ID**: \`${proposalId}\`\n• **Recipient**: \`${to}\`\n• **Amount**: **${amount} ${asset.toUpperCase()}** (Base Network)\n• **Reason**: ${reason || 'N/A'}\n• **Status**: \`WAITING_APPROVAL\`\n\n⚠️ **Action Required**: Ask the user to confirm this transfer. When the user confirms, call \`sera_proposal_approve\` with \`proposalId: "${proposalId}"\` to execute immediately on-chain.`
      }]
    };
  }

  public async handleSpotMarketData(coin: string): Promise<any> {
    if (!coin) {
      return { isError: true, content: [{ type: 'text', text: 'coin parameter is required (e.g. HYPE, PURR, BTC, ETH, SOL)' }] };
    }
    try {
      const data = await this.deps.hyperliquidClient.getSpotMarketData(coin.toUpperCase());
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

  public handleSpotTrade(instance: any, args: Record<string, any>): any {
    const { coin, side, amount } = args;
    const payload: ProposeGoalPayload = {
      intent: 'HL_SPOT_ORDER',
      parameters: {
        coin: coin.toUpperCase(),
        side: side.toLowerCase(),
        amount: parseFloat(amount),
        orderType: 'market'
      },
      userMessage: `Hyperliquid Spot ${side.toUpperCase()} ${amount} of ${coin.toUpperCase()}`
    };

    const proposalId = instance.proposalManager?.createProposal
      ? instance.proposalManager.createProposal(payload)
      : `prop-${Date.now()}`;

    if (!instance.proposalManager?.createProposal) {
      instance.eventBus.emit(EventTypes.SYSTEM_PROPOSE_GOAL, {
        id: `evt-mcp-spot-${Date.now()}`,
        type: EventTypes.SYSTEM_PROPOSE_GOAL,
        source: 'McpServer',
        timestamp: Date.now(),
        payload
      });
    }

    return {
      content: [{
        type: 'text',
        text: `📋 **Hyperliquid Spot Trade Proposal Created**\n\n• **Proposal ID**: \`${proposalId}\`\n• **Market**: **${coin.toUpperCase()}/USDC**\n• **Side**: **${side.toUpperCase()}**\n• **Size**: **${amount}**\n• **Status**: \`WAITING_APPROVAL\`\n\n⚠️ **Action Required**: Ask the user to confirm this trade. When the user confirms, call \`sera_proposal_approve\` with \`proposalId: "${proposalId}"\` to execute immediately on Hyperliquid.`
      }]
    };
  }

  public handleBillingStatus(userId: string): any {
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
