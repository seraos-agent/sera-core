import { SeraTool } from '../../core/cognitive/Tool';
import { PolymarketService } from './PolymarketService';

export class PolymarketToolCapability {
  private service: PolymarketService;

  constructor(service: PolymarketService) {
    this.service = service;
  }

  public getTools(): SeraTool[] {
    return [
      {
        name: 'POLYMARKET_SEARCH_MARKETS',
        description: 'Search for active prediction markets on Polymarket based on a query (e.g. "election", "sports"). Returns a list of markets, their questions, and their token IDs which can be used to view the orderbook.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search term to filter markets by.'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of markets to return. Default is 10.'
            }
          },
          required: ['query']
        },
        requiresApproval: false
      },
      {
        name: 'POLYMARKET_GET_ORDERBOOK',
        description: 'Retrieve the current orderbook for a specific Polymarket token ID. Shows the bids and asks for YES or NO shares.',
        parameters: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The specific token ID of the market share.'
            }
          },
          required: ['tokenId']
        },
        requiresApproval: false
      },
      {
        name: 'POLYMARKET_TRADE',
        description: 'Execute a trade (buy/sell) on a Polymarket token (Yes or No shares) via the CLOB. Supports Market and Limit orders.',
        parameters: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The specific token ID of the market share.'
            },
            side: {
              type: 'string',
              enum: ['BUY', 'SELL'],
              description: 'Whether to BUY or SELL the shares.'
            },
            amountShares: {
              type: 'number',
              description: 'The number of shares to trade.'
            },
            orderType: {
              type: 'string',
              enum: ['MARKET', 'LIMIT'],
              description: 'Use MARKET for immediate execution, or LIMIT to specify a price.'
            },
            price: {
              type: 'number',
              description: 'The target price per share (e.g. 0.50). Required if orderType is LIMIT.'
            }
          },
          required: ['tokenId', 'side', 'amountShares', 'orderType']
        },
        requiresApproval: true,
        irreversible: true
      }
    ];
  }

  public async executeTool(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'POLYMARKET_SEARCH_MARKETS':
        return await this.service.searchMarkets(args.query, args.limit || 10);
      case 'POLYMARKET_GET_ORDERBOOK':
        return await this.service.getOrderBook(args.tokenId);
      case 'POLYMARKET_TRADE':
        return await this.service.submitOrder(
          args.tokenId, 
          args.side, 
          args.amountShares, 
          args.orderType, 
          args.price
        );
      default:
        throw new Error(`[PolymarketToolCapability] Unknown tool: ${toolName}`);
    }
  }
}
