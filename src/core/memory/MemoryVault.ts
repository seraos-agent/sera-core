/** Ownership and retention policy for a user's cognitive memory. */
export type MemoryVaultMode = 'LOCAL_DEVELOPMENT' | 'RUNTIME_ONLY' | 'USER_CLOUD';
export type MemoryVaultStatus = 'ACTIVE' | 'CONNECTION_REQUIRED';

export interface MemoryVaultDescriptor {
  mode: MemoryVaultMode;
  status: MemoryVaultStatus;
  storageLabel: string;
  retentionLabel: string;
  autonomyReady: boolean;
  detail: string;
}
