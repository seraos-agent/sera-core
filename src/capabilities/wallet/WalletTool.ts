import { IWalletCapability } from './WalletCapability';
import { TransferRequest, WalletId } from './types';
import { WorldStateService } from '../../core/world-state/WorldStateService';
import { Observation } from '../../core/world-state/types';

export class WalletTool {
  private walletCapability: IWalletCapability;
  private worldStateService: WorldStateService;
  private walletId: WalletId;

  constructor(
    walletCapability: IWalletCapability,
    worldStateService: WorldStateService,
    walletId: WalletId
  ) {
    this.walletCapability = walletCapability;
    this.worldStateService = worldStateService;
    this.walletId = walletId;
  }

  async execute(request: TransferRequest): Promise<any> {
    try {
      // 1. Actuator Execution
      const receipt = await this.walletCapability.executeTransfer(this.walletId, request);

      // 2. Actuator Feedback Loop -> World State Ingestion
      if (receipt.status === 'SUCCESS' && receipt.transactionHash) {
        const observation: Observation<{ amount: number; asset: string }, { chainId: string; type: string }> = {
          id: `obs-out-${receipt.transactionHash}`,
          type: 'STATE_MUTATION',
          epistemicWeight: 'FACTUAL',
          source: {
            connectorId: 'WALLET_ACTUATOR_FEEDBACK',
            externalReferenceId: receipt.transactionHash, // Idempotency key for WorldState
            metadata: {
              chainId: this.walletId.network,
              type: 'OUTBOUND_TRANSFER'
            }
          },
          payload: {
            // Negative amount to reflect outflow in WorldState
            amount: -receipt.amountTransferred,
            asset: receipt.asset
          },
          observedAt: receipt.timestamp
        };

        // Ingest the observation back into the World State
        this.worldStateService.ingest(observation);
      }

      return receipt;
    } catch (error: any) {
      console.error(`[WalletTool] Execution failed:`, error.message);
      return {
        status: 'FAILED',
        amountTransferred: 0,
        asset: request.asset,
        reason: error.message,
        timestamp: Date.now()
      };
    }
  }
}
