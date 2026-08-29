import { SupabaseRestClient } from '../persistence/SupabaseRestClient';
import { GoogleDriveConnectionRepository } from '../integrations/google-drive/GoogleDriveConnectionRepository';
import { MemoryConsolidationWorker } from '../integrations/google-drive/MemoryConsolidationWorker';
/**
 * HygieneDaemon — Automated garbage collection for SERA's persistent state.
 *
 * Runs periodic cleanup tasks to prevent unbounded growth of database tables.
 * Each cleanup cycle is independent and fault-tolerant: if one task fails,
 * the others still execute.
 *
 * Started once in server/index.ts alongside TemporalClockService.
 */

export interface HygieneConfig {
  /** Interval between cleanup cycles in milliseconds. Default: 6 hours. */
  intervalMs?: number;
  /** Maximum age for vector memories in days. Default: 90. */
  vectorRetentionDays?: number;
  /** Maximum age for episodic memories in days. Default: 90. */
  episodicRetentionDays?: number;
}

export interface HygieneCycleResult {
  vectorMemoriesCleaned: number;
  episodicMemoriesCleaned: number;
  orphanedSecretsCleaned: number;
  durationMs: number;
}

export class HygieneDaemon {
  private readonly client: SupabaseRestClient;
  private readonly intervalMs: number;
  private readonly vectorRetentionDays: number;
  private readonly episodicRetentionDays: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(client: SupabaseRestClient, config: HygieneConfig = {}) {
    this.client = client;
    this.intervalMs = config.intervalMs ?? 6 * 60 * 60 * 1000; // 6 hours
    this.vectorRetentionDays = config.vectorRetentionDays ?? 90;
    this.episodicRetentionDays = config.episodicRetentionDays ?? 90;
  }

  public start(): void {
    console.log(`[HygieneDaemon] Started. Cleanup every ${this.intervalMs / (60 * 60 * 1000)}h. Retention: vector=${this.vectorRetentionDays}d, episodic=${this.episodicRetentionDays}d.`);
    // Run first cycle after a short delay (let the system fully boot first)
    this.timer = setTimeout(() => {
      void this.runCycle();
      // Then schedule recurring cycles
      this.timer = setInterval(() => void this.runCycle(), this.intervalMs);
    }, 60_000); // 1 minute after boot
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      clearTimeout(this.timer);
      this.timer = null;
      console.log('[HygieneDaemon] Stopped.');
    }
  }

  public async runCycle(): Promise<HygieneCycleResult> {
    const startTime = Date.now();
    console.log('[HygieneDaemon] Starting cleanup cycle...');

    let vectorMemoriesCleaned = 0;
    let episodicMemoriesCleaned = 0;
    let orphanedSecretsCleaned = 0;

    // Task 1: Clean stale vector memories (last_accessed_at > N days)
    try {
      const cutoffDate = new Date(Date.now() - this.vectorRetentionDays * 24 * 60 * 60 * 1000).toISOString();
      // Count before delete for reporting
      const staleVectors = await this.client.select<{ id: string }>(
        'sera_vector_memories',
        `last_accessed_at=lt.${cutoffDate}&select=id`
      );
      if (staleVectors.length > 0) {
        await this.client.delete('sera_vector_memories', `last_accessed_at=lt.${cutoffDate}`);
        vectorMemoriesCleaned = staleVectors.length;
      }
    } catch (error) {
      console.warn('[HygieneDaemon] Vector memory cleanup failed:', error instanceof Error ? error.message : error);
    }

    // Task 2: Clean old episodic memories (created_at > N days)
    try {
      const cutoffDate = new Date(Date.now() - this.episodicRetentionDays * 24 * 60 * 60 * 1000).toISOString();
      const staleEpisodes = await this.client.select<{ id: string, session_id: string }>(
        'sera_episodic_memories',
        `created_at=lt.${cutoffDate}&select=id,session_id`
      );
      if (staleEpisodes.length > 0) {
        try {
          const gdriveConnections = GoogleDriveConnectionRepository.fromEnvironment();
          if (gdriveConnections) {
            const worker = new MemoryConsolidationWorker(this.client, gdriveConnections, () => null);
            const users = new Map<string, number>();
            for (const ep of staleEpisodes) {
              if (ep.session_id) users.set(ep.session_id, (users.get(ep.session_id) || 0) + 1);
            }
            for (const [userId, count] of users.entries()) {
              await worker.consolidatePrePurge(userId, count);
            }
          }
        } catch (err: any) {
          console.warn('[HygieneDaemon] Pre-purge consolidation failed:', err.message);
        }

        await this.client.delete('sera_episodic_memories', `created_at=lt.${cutoffDate}`);
        episodicMemoriesCleaned = staleEpisodes.length;
      }
    } catch (error) {
      console.warn('[HygieneDaemon] Episodic memory cleanup failed:', error instanceof Error ? error.message : error);
    }

    // Task 3: Clean orphaned secrets (soft-deleted entries with empty ciphertext)
    try {
      const orphanedSecrets = await this.client.select<{ id: string }>(
        'sera_secrets',
        `ciphertext=eq.&select=id`
      );
      if (orphanedSecrets.length > 0) {
        await this.client.delete('sera_secrets', `ciphertext=eq.`);
        orphanedSecretsCleaned = orphanedSecrets.length;
      }
    } catch (error) {
      console.warn('[HygieneDaemon] Orphaned secrets cleanup failed:', error instanceof Error ? error.message : error);
    }

    const durationMs = Date.now() - startTime;
    const result: HygieneCycleResult = { vectorMemoriesCleaned, episodicMemoriesCleaned, orphanedSecretsCleaned, durationMs };

    const totalCleaned = vectorMemoriesCleaned + episodicMemoriesCleaned + orphanedSecretsCleaned;
    if (totalCleaned > 0) {
      console.log(`[HygieneDaemon] Cycle complete (${durationMs}ms): ${vectorMemoriesCleaned} vectors, ${episodicMemoriesCleaned} episodes, ${orphanedSecretsCleaned} secrets cleaned.`);
    } else {
      console.log(`[HygieneDaemon] Cycle complete (${durationMs}ms): No stale data found. System is clean.`);
    }

    return result;
  }
}
