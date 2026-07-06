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
        }
      },
      {
        name: 'CHECK_WALLET_BALANCE',
        description: 'Use this tool to check the current wallet balance of the SERA agent.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];
  }
}
