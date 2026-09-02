import { ISubAgent, SubAgentDomain } from './types';
import { SeraTool } from '../../core/cognitive/Tool';

export class DeFiSubAgent implements ISubAgent {
  readonly domain: SubAgentDomain = 'defi';
  readonly name = 'SERA DeFi Specialist';
  readonly description = 'Specialized in Hyperliquid real-time crypto prices, rankings, orderbooks, and Base Network USDC wallet operations.';

  getTools(): SeraTool[] {
    return [
      {
        name: 'HL_SPOT_MARKET_DATA',
        description: 'Primary and authoritative oracle for real-time cryptocurrency prices, 24h volume, price changes, and coin rankings from Hyperliquid orderbook (e.g. BTC, ETH, HYPE, SOL, PURR).',
        parameters: {
          type: 'object',
          properties: {
            coin: { type: 'string', description: 'Token symbol (e.g. HYPE, ETH, BTC, SOL)' },
            limit: { type: 'number', description: 'Number of top coins to return when querying market overview (e.g. 10)' }
          }
        }
      },
      {
        name: 'HL_SPOT_ORDER',
        description: 'Places a spot buy or sell order on Hyperliquid (Market or Limit).',
        parameters: {
          type: 'object',
          properties: {
            coin: { type: 'string', description: 'Token symbol' },
            side: { type: 'string', enum: ['buy', 'sell'] },
            amount: { type: 'number', description: 'Amount in USDC' },
            orderType: { type: 'string', enum: ['market', 'limit'] },
            limitPrice: { type: 'number' }
          },
          required: ['coin', 'side', 'amount']
        },
        requiresApproval: true
      },
      {
        name: 'HL_SPOT_PORTFOLIO',
        description: 'Fetches user complete spot portfolio with all token holdings and USD valuations on Hyperliquid.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'CHECK_WALLET_BALANCE',
        description: 'Checks the current real-time USDC and ETH balance of the Base Network wallet.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'TRANSFER_FUNDS',
        description: 'Prepares a transfer of USDC from the agent balance on Base Network to a recipient address.',
        parameters: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Amount of USDC to transfer' },
            recipientAddress: { type: 'string', description: '0x recipient address on Base Network' }
          },
          required: ['amount', 'recipientAddress']
        },
        requiresApproval: true
      }
    ];
  }

  getSystemPrompt(): string {
    return `You are the SERA DeFi & Market Specialist Sub-Agent.
Your mission is to provide accurate real-time crypto prices, token rankings, and wallet operations.

CRITICAL RULES:
- Use HL_SPOT_MARKET_DATA as the primary source of truth for crypto prices, orderbooks, and top market overviews (e.g. BTC, ETH, HYPE, SOL).
- For broad crypto news, macro analysis, or non-listed tokens, use the WEB_SEARCH tool.
- When formatting token prices or rankings in chat, use clean Markdown tables (| Rank | Coin | Price (USDC) | 24h Change | Volume |).
- For quick visual comparisons, you may output \`\`\`barchart code blocks.
- When transferring funds or executing spot orders, ensure precise numbers and warn the user before generating the proposal card.`;
  }
}
