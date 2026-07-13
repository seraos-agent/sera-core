import { LiquidityQuoteRequest, LiquidityQuote, LiquidityExecutionReceipt } from '../types';

/**
 * ILiquidityProvider defines the contract for any external liquidity source
 * (e.g., OAuth-based exchanges, On-Ramp providers like MoonPay, or native SERA nodes).
 * 
 * LiquidityExecutor routes requests to implementations of this interface based on
 * the LiquidityNode's supported methods and the user's connected providers.
 */
export interface ILiquidityProvider {
  /**
   * Uniquely identifies this provider type (e.g., 'exchange:coinbase', 'onramp:moonpay', 'node:sera').
   */
  readonly providerId: string;

  /**
   * Check if the provider is currently authenticated and ready to execute.
   * For OAuth, this checks token validity. For On-Ramp, this might always return true.
   */
  isReady(agentId: string): Promise<boolean>;

  /**
   * Request a firm or estimated quote from this provider.
   */
  getQuote(request: LiquidityQuoteRequest): Promise<LiquidityQuote>;

  /**
   * Execute a trade or transfer against the provided quote.
   * This is where the actual state mutation (trading on an exchange or generating an on-ramp link) occurs.
   * 
   * @param quoteId The ID of the quote to execute.
   * @param idempotencyKey Key to ensure the execution is not processed multiple times.
   */
  executeTrade(quoteId: string, idempotencyKey: string): Promise<LiquidityExecutionReceipt>;

  /**
   * Query the current status of an execution (e.g., checking if an on-ramp transfer has settled).
   */
  getExecutionStatus(executionId: string): Promise<'PENDING' | 'SUCCESS' | 'FAILED'>;
}
