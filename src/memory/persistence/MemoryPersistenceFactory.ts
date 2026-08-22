import { IMemoryPersistence } from '../../core/memory/IMemoryPersistence';
import { MemoryVaultDescriptor } from '../../core/memory/MemoryVault';
import { EphemeralMemoryPersistence } from './EphemeralMemoryPersistence';
import { FileMemoryPersistence } from './FileMemoryPersistence';
import { SupabaseMemoryPersistence } from './SupabaseMemoryPersistence';
import { SupabaseRestClient } from '../../core/persistence/SupabaseRestClient';

export type ConfiguredMemoryPersistenceMode = 'local_development' | 'runtime_only' | 'user_cloud' | 'supabase';

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
  const supabaseClient = SupabaseRestClient.fromEnvironment();

  // In production, auto-select 'supabase' mode if Supabase is available and no explicit mode is set
  const mode = input.mode ?? (
    input.environment === 'production'
      ? (supabaseClient ? 'supabase' : 'runtime_only')
      : 'local_development'
  );

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

  if (mode === 'supabase') {
    if (!supabaseClient) {
      console.warn('[MemoryPersistenceFactory] Supabase mode requested but client unavailable. Falling back to runtime_only.');
      return createRuntimeOnlySelection();
    }
    return {
      persistence: new SupabaseMemoryPersistence(input.sessionId, supabaseClient),
      vault: {
        mode: 'RUNTIME_ONLY', // Vault mode stays RUNTIME_ONLY until user-cloud is implemented
        status: 'ACTIVE',
        storageLabel: 'Supabase encrypted storage',
        retentionLabel: 'Persistent across restarts (90-day retention)',
        autonomyReady: false,
        detail: 'SERA persists cognitive memory to Supabase. Beliefs and episodic memories survive container restarts.',
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

  return createRuntimeOnlySelection();
}

function createRuntimeOnlySelection(): MemoryPersistenceSelection {
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
