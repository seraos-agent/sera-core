import { EventTypes, StandardEvent } from '../core/events/types';
import { ExecutionEventBus } from '../core/events/ExecutionEventBus';
import { GoalBridge } from './GoalBridge';

/**
 * ExecutionDispatcher — The hands of SERA's intent execution.
 * 
 * Architecture Role:
 * - Domain router for execution.
 * - Receives raw action types (e.g. 'TRANSFER_FUNDS', 'CHECK_WALLET_BALANCE')
 * - Routes them to the specific domain handlers (currently GoalBridge, later GitHub, Commerce, etc.)
 * - Keeps Runtime stateless and domain-agnostic.
 */
export class ExecutionDispatcher {
  constructor(
    private eventBus: ExecutionEventBus,
    private goalBridge: GoalBridge
  ) {}

  /**
   * Dispatches the action to the appropriate domain capability.
   */
  public async dispatch(actionType: string, payload: Record<string, any>, context: Record<string, any>): Promise<void> {
    console.log(`[ExecutionDispatcher] Routing action: ${actionType}`);

    try {
      switch (actionType) {
        case 'CHECK_WALLET_BALANCE':
          await this.goalBridge.handleCheckBalance(context.triggerId || `req-${Date.now()}`);
          break;

        case 'TRANSFER_FUNDS':
          await this.goalBridge.handleTransferFunds(context.triggerId || `req-${Date.now()}`, payload);
          break;

        // Future domains can be added here (e.g. GITHUB_PR_MERGE)

        default:
          console.warn(`[ExecutionDispatcher] Unknown action type: ${actionType}`);
      }
    } catch (err: any) {
      console.error(`[ExecutionDispatcher] Error during dispatch of ${actionType}:`, err.message);
    }
  }
}
