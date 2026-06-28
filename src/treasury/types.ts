export interface Allocation {
  allocationId: string;
  name: string;
  totalBudget: number;
  availableBudget: number;
  reservedBudget: number;
  settledAmount: number;
  purpose: string;
  authorityScope: string;
}

export interface Treasury {
  treasuryId: string;
  ownerId: string;
  allocations: Map<string, Allocation>;
}

export interface SpendingRequest {
  amount: number;
  allocationId: string;
  purpose: string;
  metadata?: Record<string, any>;
}

export type SpendingDecisionStatus = 'AUTHORIZED' | 'REQUIRES_APPROVAL' | 'DENIED';

export interface SpendingDecision {
  status: SpendingDecisionStatus;
  reason: string;
  source: string;
}

export type PaymentStatus = 
  | 'PAYMENT_PLANNED'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_EXECUTING'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_SETTLED'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'PAYMENT_RELEASED';
