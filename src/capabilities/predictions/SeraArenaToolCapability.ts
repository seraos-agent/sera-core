import { SeraTool } from '../../core/cognitive/Tool';
import { PredictionEngineService } from './PredictionEngineService';

export class SeraArenaToolCapability {
  private service: PredictionEngineService;

  constructor(service: PredictionEngineService) {
    this.service = service;
  }

  public getTools(): SeraTool[] {
    return [
      {
        name: 'SERA_ARENA_SEARCH_MARKETS',
        description: 'Search for active prediction markets on Sera Arena. Returns a list of markets, their status, expiry time, and current total UP/DOWN pools.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        requiresApproval: false
      },
      {
        name: 'SERA_ARENA_GET_ORDERBOOK',
        description: 'Retrieve the current pool sizes (Total UP and Total DOWN) and the dynamic multipliers for a specific Sera Arena market.',
        parameters: {
          type: 'object',
          properties: {
            marketId: {
              type: 'string',
              description: 'The specific market ID (e.g. "btc-5m-rolling").'
            }
          },
          required: ['marketId']
        },
        requiresApproval: false
      },
      {
        name: 'SERA_ARENA_TRADE',
        description: 'Execute a trade (place a bet) on a Sera Arena market (UP or DOWN) using USDC.',
        parameters: {
          type: 'object',
          properties: {
            marketId: {
              type: 'string',
              description: 'The specific market ID.'
            },
            side: {
              type: 'string',
              enum: ['UP', 'DOWN'],
              description: 'Whether to bet UP or DOWN.'
            },
            amount: {
              type: 'number',
              description: 'The amount of USDC to stake.'
            }
          },
          required: ['marketId', 'side', 'amount']
        },
        requiresApproval: true,
        irreversible: true
      }
    ];
  }

  public async executeTool(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'SERA_ARENA_SEARCH_MARKETS':
        // We will add getActiveMarkets to the service
        return this.service.getActiveMarkets();
      case 'SERA_ARENA_GET_ORDERBOOK':
        // We will add getMarketDetails to the service
        return this.service.getMarketDetails(args.marketId);
      case 'SERA_ARENA_TRADE':
        // We will add agentPlaceOrder to the service
        // We need an agent identifier, we can pass "SERA_AGENT"
        return this.service.agentPlaceOrder("SERA_AGENT", args.marketId, args.side, args.amount);
      default:
        throw new Error(`[SeraArenaToolCapability] Unknown tool: ${toolName}`);
    }
  }
}
