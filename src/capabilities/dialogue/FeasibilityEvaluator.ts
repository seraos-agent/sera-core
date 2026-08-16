import { WorldStateService } from '../../core/world-state/WorldStateService';

export interface FeasibilityResult {
  feasible: boolean;
  reason?: string;
}

/**
 * FeasibilityEvaluator — Performs pre-proposal validation checks on user intents.
 *
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/)
 * Relevancy: Enforces Rule 5 (Pre-Proposal Validation vs Feasibility) & Rule 7 (Universal Codebase Language).
 */
export class FeasibilityEvaluator {
  constructor(private readonly worldStateService: WorldStateService) {}

  public evaluate(intent: string, parameters: any): FeasibilityResult {
    let checkIntent = intent;
    let checkParams = parameters;

    if (intent === 'SCHEDULE_GOAL' && parameters && parameters.actionIntent) {
      checkIntent = parameters.actionIntent;
      checkParams = parameters.actionParameters || {};
    }



    if (checkIntent === 'TRANSFER_FUNDS') {
      const walletState = this.worldStateService.getWalletState();
      if (!walletState) return { feasible: false, reason: 'Wallet state is completely unknown or disconnected.' };

      const requestedAmount = checkParams.amount;
      const currentBalance = walletState.balance;
      const vaultBalance = walletState.vaultBalance;
      const effectiveBalance = checkParams.fromWallet === 'user_main_wallet' ? currentBalance : vaultBalance;

      if (requestedAmount === 'all') {
        if (effectiveBalance <= 0) return { feasible: false, reason: 'Insufficient funds. Available balance is 0 USDC.' };
      } else {
        const amount = parseFloat(requestedAmount);
        if (isNaN(amount) || amount <= 0) return { feasible: false, reason: 'Invalid amount specified.' };
        if (amount > effectiveBalance) return { feasible: false, reason: `Insufficient funds. Requested: ${amount}, Available: ${effectiveBalance} USDC.` };
      }
    }

    return { feasible: true };
  }
}
