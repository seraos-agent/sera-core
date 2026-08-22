import { IMemoryPersistence, MemorySnapshot } from '../../core/memory/IMemoryPersistence';
import { SupabaseRestClient } from '../../core/persistence/SupabaseRestClient';

/**
 * SupabaseMemoryPersistence — Persists WorkingMemory snapshots (beliefs & events)
 * to the `sera_memory_snapshots` table in Supabase.
 *
 * This ensures that an agent's confirmed beliefs and recent event history survive
 * Cloud Run container restarts. The snapshot is a single JSON blob per session,
 * upserted on save and fetched on load.
 */

interface SnapshotRow {
  session_id: string;
  snapshot: MemorySnapshot;
  updated_at: string;
}

export class SupabaseMemoryPersistence implements IMemoryPersistence {
  private readonly client: SupabaseRestClient;
  private readonly sessionId: string;

  constructor(sessionId: string, client: SupabaseRestClient) {
    this.sessionId = sessionId;
    this.client = client;
  }

  public async save(snapshot: MemorySnapshot): Promise<void> {
    try {
      await this.client.upsert('sera_memory_snapshots', {
        session_id: this.sessionId,
        snapshot,
        updated_at: new Date().toISOString(),
      }, 'session_id');
      console.log(`[SupabaseMemoryPersistence] Checkpoint saved to Supabase.`);
    } catch (error) {
      console.error('[SupabaseMemoryPersistence] Failed to save snapshot:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  public async load(): Promise<MemorySnapshot | null> {
    try {
      const rows = await this.client.select<SnapshotRow>(
        'sera_memory_snapshots',
        `session_id=eq.${encodeURIComponent(this.sessionId)}`
      );
      if (!rows || rows.length === 0) {
        console.log('[SupabaseMemoryPersistence] No existing snapshot found. Starting fresh.');
        return null;
      }
      console.log(`[SupabaseMemoryPersistence] Snapshot loaded from Supabase (updated: ${rows[0].updated_at}).`);
      return rows[0].snapshot;
    } catch (error) {
      console.error('[SupabaseMemoryPersistence] Failed to load snapshot:', error instanceof Error ? error.message : error);
      return null;
    }
  }
}
