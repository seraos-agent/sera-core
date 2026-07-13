import { ILiquidityProvider } from './ILiquidityProvider';
import { LiquidityQuoteRequest, LiquidityQuote, LiquidityExecutionReceipt } from '../types';

/**
 * OnRampAdapter handles integrations with 3rd-party Fiat-to-Crypto providers (e.g., MoonPay, Stripe Crypto).
 * 
 * SERA does not custody fiat or touch the transaction. It merely requests a quote and generates
 * a checkout URL where the user performs KYC and payment. The provider sends crypto directly to the wallet.
 */
export class OnRampAdapter implements ILiquidityProvider {
  public readonly providerId: string;
  private simulatedQuotes = new Map<string, LiquidityQuote>();

  constructor(providerName: string = 'stripe') {
    this.providerId = `onramp:${providerName}`;
  }

  async isReady(agentId: string): Promise<boolean> {
    // On-ramp providers typically don't require agent-side authentication beyond public API keys,
    // as the user authenticates directly in the provider's UI window.
    return true;
  }

  async getQuote(request: LiquidityQuoteRequest): Promise<LiquidityQuote> {
    // Scaffold: In reality, this would hit the provider's REST API (e.g., Stripe /v1/crypto/quotes)
    const quoteId = `onramp-quote-${Date.now()}`;
    const price = request.asset === 'USDC' ? 1.02 : 3000; // Fake premium for on-ramp fees
    const fee = request.amount * 0.02; // 2% processing fee

    const q: LiquidityQuote = {
      quoteId,
      nodeId: request.nodeId,
      asset: request.asset,
      amount: request.amount,
      fiat: request.fiat,
      price,
      fee,
      availableAmount: request.amount,
      estimatedTimeSeconds: 300, // On-ramps can take a few minutes
      expiresAt: Date.now() + 600_000,
    };
    
    this.simulatedQuotes.set(quoteId, q);
    return q;
  }

  async executeTrade(quoteId: string, idempotencyKey: string): Promise<LiquidityExecutionReceipt> {
    const q = this.simulatedQuotes.get(quoteId);
    if (!q) {
      throw new Error(`Invalid or expired quote: ${quoteId}`);
    }

    // Scaffold: Execution here means generating a checkout session and returning the URL as 'reason'
    // or tracking ID. SERA doesn't move funds here; it hands off to the user.
    return {
      status: 'SUCCESS', // Translates to "Session Created Successfully"
      executionId: `session-${Date.now()}`,
      nodeId: q.nodeId,
      amountExecuted: q.amount,
      asset: q.asset,
      reason: `Please complete payment at: https://buy.stripe.com/test_${idempotencyKey}`,
      timestamp: Date.now(),
    };
  }

  async getExecutionStatus(executionId: string): Promise<'PENDING' | 'SUCCESS' | 'FAILED'> {
    // Scaffold: Would poll the provider's API or rely on webhooks to check if the crypto was delivered.
    return 'PENDING';
  }
}
