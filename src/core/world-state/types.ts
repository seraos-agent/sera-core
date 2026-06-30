export type EpistemicWeight = 'FACTUAL' | 'SOCIAL';

export type ObservationType =
  | 'STATE_MUTATION'
  | 'STATE_PENDING'
  | 'STATE_DROPPED'
  | 'MESSAGE'
  | 'ENVIRONMENT';

export interface ObservationSource<TMeta = Record<string, unknown>> {
  connectorId: string;
  externalReferenceId: string; // The idempotency key (e.g., TX hash)
  metadata: TMeta;
}

export interface Observation<TPayload = unknown, TMeta = Record<string, unknown>> {
  id: string;
  type: ObservationType;
  epistemicWeight: EpistemicWeight;
  source: ObservationSource<TMeta>;
  payload: TPayload;
  observedAt: number;
}

export interface WorldStateSnapshot {
  lastUpdatedAt: number;
  // Core does not parse the internal domain state. 
  // For Phase 8.0 Walking Skeleton, we just hold a generic state block.
  state: Record<string, any>;
}
