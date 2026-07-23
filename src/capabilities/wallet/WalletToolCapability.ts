import { SeraTool } from '../../core/cognitive/Tool';

export class WalletToolCapability {
  
  public getTools(): SeraTool[] {
    return [
      {
        name: 'TRANSFER_FUNDS',
        description: 'Use this tool to transfer USDC to a specific recipient address.',
        parameters: {
          type: 'object',
          properties: {
            recipient: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['EXTERNAL_ADDRESS', 'DOMAIN_INTERNAL'] },
                address: { type: 'string', description: 'The 0x address of the recipient' }
              },
              required: ['type']
            },
            amount: {
              type: ['number', 'string'],
              description: 'The amount of USDC to transfer, or "all" to send the entire balance'
            },
            asset: {
              type: 'string',
              description: 'The asset symbol, e.g. usdc'
            },
            fromWallet: {
              type: 'string',
              description: 'Optional. "user_main_wallet" or "agent_vault"'
            }
          },
          required: ['recipient', 'amount']
        },
        requiresApproval: true,
        irreversible: true
      },
      {
        name: 'CHECK_WALLET_BALANCE',
        description: 'Use this tool to check, view, or inquire about the balance of either the user\'s personal wallet or the Sera agent\'s internal vault.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        requiresApproval: false
      },
      {
        name: 'SCHEDULE_GOAL',
        description: 'Use this tool to schedule a recurring or future action (such as checking asset prices periodically or making delayed transfers). You must specify the target action to be performed.',
        parameters: {
          type: 'object',
          properties: {
            scheduleType: { type: 'string', enum: ['cron', 'exact'], description: 'Type of schedule: cron for recurring, exact for a one-time delay.' },
            humanIntent: { type: 'string', description: 'A professional summary of WHEN this will happen (e.g. "Every 5 minutes", "Every 30 seconds", "Every Monday at 9:00 AM", "In 20 seconds").' },
            cronExpression: { type: 'string', description: 'If recurring, standard cron expression in UTC (e.g. "*/5 * * * *" for every 5 mins, "0 9 * * 1" for every Monday 9am UTC).' },
            delaySeconds: { type: 'number', description: 'If exact timestamp, how many seconds from now this should execute. e.g. 20' },
            actionIntent: { type: 'string', description: 'The tool to execute (e.g. HYPERLIQUID_CANDLES, HYPERLIQUID_MARKET_SUMMARY, TRANSFER_FUNDS, CHECK_WALLET_BALANCE)' },
            actionParameters: { type: 'object', description: 'The exact parameters required for the actionIntent (e.g. { "coin": "BTC" } for HYPERLIQUID_CANDLES or HYPERLIQUID_MARKET_SUMMARY).' }
          },
          required: ['scheduleType', 'humanIntent', 'actionIntent', 'actionParameters']
        },
        requiresApproval: true
      }
    ];
  }
}
