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

export interface ObservationQuality {
  updatedAt: number;
  source: string;
  freshness: 'STALE' | 'FRESH' | 'SYNCING';
  confidence: number; // 0 to 1
}

export interface WalletState {
  address: string;
  vaultAddress: string;
  balance: number;
  vaultBalance: number;
  network: string;
  asset: string;
  quality: ObservationQuality;
}

export interface TemporalState {
  currentTime: number;
  timezone: string;
  quality: ObservationQuality;
}

export interface ChannelRef {
  id: string;
  name: string;
  platform: string;
  isDirectMessage: boolean;
  memberCount?: number;
}

export interface CommunicationState {
  platforms: {
    [platformId: string]: {
      connected: boolean;
      workspaceId?: string;
      workspaceName?: string;
      activeChannels: ChannelRef[];
      lastActivityAt: number;
      quality: ObservationQuality;
    }
  }
}

export interface WorldStateSnapshot {
  lastUpdatedAt: number;
  wallet: WalletState | null;
  temporal: TemporalState | null;
  communication: CommunicationState | null;
}
