import { EventEmitter } from 'events';
import { ILiquidityCapability } from './ILiquidityCapability';
import { LiquidityDirectory } from './LiquidityDirectory';
import {
  LiquidityNode,
  LiquidityDiscoveryCriteria,
  LiquidityQuoteRequest,
  LiquidityQuote,
  LiquidityExecutionRequest,
  LiquidityExecutionReceipt,
} from './types';
import { Logger } from '../../core/logging/Logger';

/**
 * Pure, deterministic price lookup. No reasoning belongs in here — per
 * ADR-0004, execution adapters "remain purely deterministic". Whatever
 * decides pricing strategy (an internal book, an oracle, a fixed table)
 * lives behind this interface; ADR-0006 explicitly leaves the real
 * implementation as a follow-up, not something this scaffolding invents.
 */
export interface PricingSource {
  getUnitPrice(asset: string, fiat?: string): number;
}

/** Default DEFAULT_FEE_BPS is only used if a node hasn't set its own feeBps. */
const DEFAULT_FEE_BPS = 50; // 0.5% — placeholder, not a business decision made here
const QUOTE_TTL_MS = 30_000;

export class LiquidityExecutor implements ILiquidityCapability {
  private logger = new Logger('LiquidityExecutor');
  private quotes: Map<string, LiquidityQuote> = new Map();
  private processedIdempotencyKeys: Set<string> = new Set();

  constructor(
    private directory: LiquidityDirectory,
    private pricingSource: PricingSource,
    private eventBus: EventEmitter,
    /**
     * Explicit, injected — defaults to false. A fiat-capable node is
     * unlistable and unquotable while this is false, regardless of what's
     * in its own supportedFiatCurrencies/supportedPaymentMethods. This is
     * the runtime enforcement of ADR-0006's fiat gate: turning fiat on
     * requires a deliberate constructor argument, not a config drift.
     */
    private fiatRailEnabled: boolean = false
  ) {}

  registerNode(node: LiquidityNode): void {
    this.directory.register(node);
    this.logger.info(`Registered liquidity node ${node.nodeId} for agent ${node.agentId}`);
  }

  deregisterNode(nodeId: string): void {
    this.directory.deregister(nodeId);
  }

  updateStatus(
    nodeId: string,
    availability: LiquidityNode['availability'],
    readiness: LiquidityNode['readiness']
  ): void {
    this.directory.updateStatus(nodeId, availability, readiness);
  }

  async discover(criteria: LiquidityDiscoveryCriteria): Promise<LiquidityNode[]> {
    return this.directory.find(criteria, this.fiatRailEnabled);
  }

  async quote(request: LiquidityQuoteRequest): Promise<LiquidityQuote> {
    const node = this.directory.get(request.nodeId);
    if (!node) {
      throw new Error(`Unknown liquidity node: ${request.nodeId}`);
    }

    const wantsFiat = !!request.fiat;
    if (wantsFiat && !this.fiatRailEnabled) {
      throw new Error('Fiat rail is not enabled. This node cannot be quoted for a fiat-denominated request.');
    }
    if (wantsFiat && !node.supportedFiatCurrencies?.includes(request.fiat!)) {
      throw new Error(`Node ${node.nodeId} does not support fiat currency ${request.fiat}`);
    }
    if (!node.supportedAssets.includes(request.asset)) {
      throw new Error(`Node ${node.nodeId} does not support asset ${request.asset}`);
    }
    if (request.amount < node.limits.minAmount || request.amount > node.limits.maxAmount) {
      throw new Error(
        `Requested amount ${request.amount} outside node limits [${node.limits.minAmount}, ${node.limits.maxAmount}]`
      );
    }

    const unitPrice = this.pricingSource.getUnitPrice(request.asset, request.fiat);
    const feeBps = node.feeBps ?? DEFAULT_FEE_BPS;
    const grossValue = unitPrice * request.amount;
    const fee = (grossValue * feeBps) / 10_000;

    const quoteId = `liq-quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const q: LiquidityQuote = {
      quoteId,
      nodeId: node.nodeId,
      asset: request.asset,
      amount: request.amount,
      fiat: request.fiat,
      price: unitPrice,
      fee,
      availableAmount: Math.min(request.amount, node.limits.maxAmount),
      estimatedTimeSeconds: 30,
      expiresAt: Date.now() + QUOTE_TTL_MS,
    };

    this.quotes.set(quoteId, q);
    return q;
  }

  /**
   * NOTE — scaffolding boundary: this settles bookkeeping (idempotency,
   * quote validation, event emission for the reputation hook) but does
   * NOT move any asset. Which rail actually executes the transfer leg
   * (WalletCapability/BaseAdapter for on-chain, something else for fiat)
   * is a deliberate follow-up decision — wiring it here silently would
   * repeat exactly the mistake ADR-0006 was written to avoid. Treat this
   * as simulation/internal execution until that decision is made.
   */
  async execute(request: LiquidityExecutionRequest): Promise<LiquidityExecutionReceipt> {
    const timestamp = Date.now();

    if (this.processedIdempotencyKeys.has(request.idempotencyKey)) {
      return {
        status: 'REJECTED',
        nodeId: '',
        reason: `Idempotency key already processed: ${request.idempotencyKey}`,
        timestamp,
      };
    }

    const q = this.quotes.get(request.quoteId);
    if (!q) {
      return { status: 'REJECTED', nodeId: '', reason: `Unknown or expired quoteId: ${request.quoteId}`, timestamp };
    }
    if (q.expiresAt < timestamp) {
      this.quotes.delete(request.quoteId);
      return { status: 'REJECTED', nodeId: q.nodeId, reason: 'Quote expired', timestamp };
    }

    const node = this.directory.get(q.nodeId);
    if (!node || node.availability !== 'ONLINE' || node.readiness !== 'AVAILABLE') {
      const receipt: LiquidityExecutionReceipt = {
        status: 'FAILED',
        nodeId: q.nodeId,
        asset: q.asset,
        reason: 'Node is no longer available',
        timestamp,
      };
      this.emitOutcome('failed', receipt);
      return receipt;
    }

    this.processedIdempotencyKeys.add(request.idempotencyKey);
    this.quotes.delete(request.quoteId);

    const receipt: LiquidityExecutionReceipt = {
      status: 'SUCCESS',
      executionId: `liq-exec-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      nodeId: q.nodeId,
      amountExecuted: q.amount,
      asset: q.asset,
      timestamp,
    };
    this.emitOutcome('completed', receipt);
    return receipt;
  }

  private emitOutcome(kind: 'completed' | 'failed', receipt: LiquidityExecutionReceipt): void {
    this.eventBus.emit(`liquidity.execution.${kind}`, {
      id: `evt-liquidity-${kind}-${Date.now()}`,
      type: `liquidity.execution.${kind}`,
      source: 'LiquidityExecutor',
      payload: receipt,
      timestamp: Date.now(),
    });
  }
}
