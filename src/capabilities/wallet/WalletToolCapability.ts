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
              type: 'number',
              description: 'The amount of USDC to transfer'
            },
            asset: {
              type: 'string',
              description: 'The asset symbol, e.g. usdc'
            }
          },
          required: ['recipient', 'amount']
        },
        requiresApproval: true
      },
      {
        name: 'CHECK_WALLET_BALANCE',
        description: 'Use this tool to check, view, or inquire about the balance of either the user\'s personal wallet or the SERA agent\'s internal vault.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        requiresApproval: false
      },
      {
        name: 'SCHEDULE_GOAL',
        description: 'Use this tool to schedule a recurring or future action. You must specify the action to be performed.',
        parameters: {
          type: 'object',
          properties: {
            scheduleType: { type: 'string', enum: ['cron', 'exact'], description: 'Type of schedule: cron for recurring, exact for a one-time delay.' },
            humanIntent: { type: 'string', description: 'A professional, clear, and concise summary of WHEN this will happen, translated into a formal statement. e.g. "In 20 seconds"' },
            cronExpression: { type: 'string', description: 'If recurring, the standard cron expression in UTC.' },
            delaySeconds: { type: 'number', description: 'If exact timestamp, how many seconds from now this should execute. e.g. 20' },
            actionIntent: { type: 'string', description: 'The actual tool or action to execute (e.g. TRANSFER_FUNDS, CHECK_WALLET_BALANCE)' },
            actionParameters: { type: 'object', description: 'The parameters for the actionIntent' }
          },
          required: ['scheduleType', 'humanIntent', 'actionIntent', 'actionParameters']
        },
        requiresApproval: true
      }
    ];
  }
}
