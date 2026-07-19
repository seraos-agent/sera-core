import { IMemoryPersistence } from '../../core/memory/IMemoryPersistence';
import { MemoryVaultDescriptor } from '../../core/memory/MemoryVault';
import { EphemeralMemoryPersistence } from './EphemeralMemoryPersistence';
import { FileMemoryPersistence } from './FileMemoryPersistence';

export type ConfiguredMemoryPersistenceMode = 'local_development' | 'runtime_only' | 'user_cloud';

export interface MemoryPersistenceFactoryInput {
  sessionId: string;
  environment: string;
  mode?: ConfiguredMemoryPersistenceMode;
  /** Development-only fixture key. Production must never rely on this value. */
  developmentEncryptionKey: string;
}

export interface MemoryPersistenceSelection {
  persistence: IMemoryPersistence;
  vault: MemoryVaultDescriptor;
}

/**
 * Central policy boundary for cognitive-memory retention. A user-cloud mode
 * never falls back to SERA server storage when its provider is unavailable.
 */
export function createMemoryPersistence(input: MemoryPersistenceFactoryInput): MemoryPersistenceSelection {
  const mode = input.mode ?? (input.environment === 'production' ? 'runtime_only' : 'local_development');

  if (mode === 'local_development') {
    if (input.environment === 'production') {
      throw new Error('local_development memory persistence is not allowed in production.');
    }
    return {
      persistence: new FileMemoryPersistence(input.sessionId, input.developmentEncryptionKey),
      vault: {
        mode: 'LOCAL_DEVELOPMENT',
        status: 'ACTIVE',
        storageLabel: 'Local development storage',
        retentionLabel: 'Encrypted local checkpoint',
        autonomyReady: false,
        detail: 'Development-only storage on the machine running SERA. It is not a user-owned cloud vault.',
      },
    };
  }

  if (mode === 'user_cloud') {
    return {
      persistence: new EphemeralMemoryPersistence(),
      vault: {
        mode: 'USER_CLOUD',
        status: 'CONNECTION_REQUIRED',
        storageLabel: 'User-owned cloud',
        retentionLabel: 'No SERA copy',
        autonomyReady: false,
        detail: 'A user-cloud adapter and revocable delegation are required before memory can persist for offline autonomy.',
      },
    };
  }

  return {
    persistence: new EphemeralMemoryPersistence(),
    vault: {
      mode: 'RUNTIME_ONLY',
      status: 'ACTIVE',
      storageLabel: 'Runtime memory only',
      retentionLabel: 'Discarded when the runtime stops',
      autonomyReady: false,
      detail: 'SERA keeps cognitive memory only while this runtime is active. No checkpoint is written to SERA storage.',
    },
  };
}
