import {
  LiquidityNode,
  LiquidityDiscoveryCriteria,
  LiquidityQuoteRequest,
  LiquidityQuote,
  LiquidityExecutionRequest,
  LiquidityExecutionReceipt,
} from './types';

/**
 * Mirrors the shape of IExecutionCapability (src/capabilities/wallet/WalletCapability.ts):
 * read/registration methods + a single execute entrypoint.
 *
 * Per ADR-0004 (Strict Execution Boundaries): discovery and quoting are
 * read-only and never trigger execution on their own. Whether to act on a
 * quote is a StrategyEngine/GoalEngine decision upstream — this capability
 * only answers "what's available" and "what would it cost", deterministically.
 */
export interface ILiquidityCapability {
  registerNode(node: LiquidityNode): void;
  deregisterNode(nodeId: string): void;
  updateStatus(
    nodeId: string,
    availability: LiquidityNode['availability'],
    readiness: LiquidityNode['readiness']
  ): void;

  discover(criteria: LiquidityDiscoveryCriteria): Promise<LiquidityNode[]>;
  quote(request: LiquidityQuoteRequest): Promise<LiquidityQuote>;

  execute(request: LiquidityExecutionRequest): Promise<LiquidityExecutionReceipt>;
}
