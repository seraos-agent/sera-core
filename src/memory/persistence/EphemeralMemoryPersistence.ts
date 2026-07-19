import { IMemoryPersistence, MemorySnapshot } from '../../core/memory/IMemoryPersistence';

/**
 * Deliberately does not write to disk, a database, or a remote service.
 * A fresh runtime starts with no recovered cognitive memory.
 */
export class EphemeralMemoryPersistence implements IMemoryPersistence {
  async load(): Promise<MemorySnapshot | null> {
    return null;
  }

  async save(_snapshot: MemorySnapshot): Promise<void> {
    // Runtime-only: the snapshot is intentionally discarded.
  }
}
