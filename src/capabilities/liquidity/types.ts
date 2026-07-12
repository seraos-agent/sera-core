// ── Liquidity Capability — Data Model ──────────────────────────────────────
// See docs/architecture/adr/0006-liquidity-capability.md for the decisions
// this model implements (discovery, quote, and reputation boundaries).

export type LiquidityAvailability = 'ONLINE' | 'OFFLINE';
export type LiquidityReadiness = 'AVAILABLE' | 'UNAVAILABLE';

export interface LiquidityLimits {
  minAmount: number;
  maxAmount: number;
  dailyLimit?: number;
}

/**
 * A Liquidity Node is a role/capability attached to an existing SERA Agent —
 * NOT a new identity system. `agentId` is a reference into the Agent identity
 * that already exists; this model adds no principal of its own.
 */
export interface LiquidityNode {
  nodeId: string;
  agentId: string;

  supportedAssets: string[]; // e.g. ['USDC', 'ETH']

  // Both fiat fields are opt-in and gated by FIAT_RAIL_ENABLED in
  // LiquidityExecutor (ADR-0006). Leave undefined/empty for a crypto-native
  // node (crypto-to-crypto liquidity, swap routing, treasury, commerce
  // settlement) — the capability is fully usable without ever populating
  // these.
  supportedFiatCurrencies?: string[]; // e.g. ['GBP']
  supportedPaymentMethods?: string[]; // e.g. ['bank_transfer']

  // Fee in basis points charged by this node. Placeholder mechanism — no
  // pricing/fee policy has been decided yet; this just makes the field
  // explicit instead of a hidden constant. See PricingSource in
  // LiquidityExecutor.ts.
  feeBps?: number;

  limits: LiquidityLimits;

  availability: LiquidityAvailability;
  readiness: LiquidityReadiness;

  // Pointer only — never an embedded score. Source of truth is a Belief in
  // MemoryStore under category 'REPUTATION', key `reputation:${nodeId}`.
  // See LiquidityReputationBridge.
  reputationRef: string;

  registeredAt: number;
  updatedAt: number;
}

export interface LiquidityDiscoveryCriteria {
  asset: string;
  amount: number;
  fiat?: string;
  region?: string;
}

export interface LiquidityQuoteRequest {
  nodeId: string;
  asset: string;
  amount: number;
  fiat?: string;
  idempotencyKey: string;
}

export interface LiquidityQuote {
  quoteId: string;
  nodeId: string;
  asset: string;
  amount: number;
  fiat?: string;
  price: number; // unit price of `asset`; denominated in `fiat` if present, otherwise a reference unit
  fee: number; // absolute fee, same denomination as `price`
  availableAmount: number;
  estimatedTimeSeconds: number;
  expiresAt: number;
}

export interface LiquidityExecutionRequest {
  quoteId: string;
  idempotencyKey: string;
}

export interface LiquidityExecutionReceipt {
  status: 'SUCCESS' | 'FAILED' | 'REJECTED';
  executionId?: string;
  nodeId: string;
  amountExecuted?: number;
  asset?: string;
  reason?: string;
  timestamp: number;
}
