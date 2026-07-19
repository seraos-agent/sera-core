import { describe, expect, it } from 'vitest';
import { EphemeralMemoryPersistence } from '../src/memory/persistence/EphemeralMemoryPersistence';
import { FileMemoryPersistence } from '../src/memory/persistence/FileMemoryPersistence';
import { createMemoryPersistence } from '../src/memory/persistence/MemoryPersistenceFactory';

const developmentKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

describe('Memory persistence ownership policy', () => {
  it('uses local encrypted checkpoints only for local development', () => {
    const result = createMemoryPersistence({ sessionId: 'test-user', environment: 'development', developmentEncryptionKey: developmentKey });

    expect(result.persistence).toBeInstanceOf(FileMemoryPersistence);
    expect(result.vault).toMatchObject({ mode: 'LOCAL_DEVELOPMENT', status: 'ACTIVE', autonomyReady: false });
  });

  it('defaults production to runtime-only memory with no persistence adapter', async () => {
    const result = createMemoryPersistence({ sessionId: 'test-user', environment: 'production', developmentEncryptionKey: developmentKey });

    expect(result.persistence).toBeInstanceOf(EphemeralMemoryPersistence);
    expect(result.vault).toMatchObject({ mode: 'RUNTIME_ONLY', status: 'ACTIVE', autonomyReady: false });
    await expect(result.persistence.load()).resolves.toBeNull();
  });

  it('fails closed when user cloud is selected without a cloud adapter', () => {
    const result = createMemoryPersistence({ sessionId: 'test-user', environment: 'production', mode: 'user_cloud', developmentEncryptionKey: developmentKey });

    expect(result.persistence).toBeInstanceOf(EphemeralMemoryPersistence);
    expect(result.vault).toMatchObject({ mode: 'USER_CLOUD', status: 'CONNECTION_REQUIRED', autonomyReady: false });
  });

  it('rejects local development persistence in production', () => {
    expect(() => createMemoryPersistence({ sessionId: 'test-user', environment: 'production', mode: 'local_development', developmentEncryptionKey: developmentKey }))
      .toThrow('not allowed in production');
  });
});
