import { GoogleDriveCapability } from '../../../capabilities/google-drive/GoogleDriveCapability';
import { GoogleDriveConnectionRepository } from './GoogleDriveConnectionRepository';
import { SupabaseRestClient } from '../../persistence/SupabaseRestClient';

export class MemoryConsolidationWorker {
  constructor(
    private readonly client: SupabaseRestClient,
    private readonly connections: GoogleDriveConnectionRepository,
    private readonly resolveInstance: (userId: string) => any
  ) {}

  /** Main entry point, called by TemporalClockService or similar */
  public async runCycle(): Promise<void> {
    const now = new Date();
    // Check if it's Sunday (0) and hour is 0 (midnight UTC)
    if (now.getUTCDay() !== 0 || now.getUTCHours() !== 0) {
      return;
    }

    console.log('[MemoryConsolidationWorker] Starting weekly consolidation cycle...');
    const connectedUsers = await this.client.select<{ user_id: string }>(
      'user_cloud_connections',
      `provider=eq.GOOGLE_DRIVE&status=eq.CONNECTED&select=user_id`
    );

    for (const row of connectedUsers) {
      try {
        await this.consolidate(row.user_id);
      } catch (e: any) {
        console.error(`[MemoryConsolidationWorker] Failed for user ${row.user_id}: ${e.message}`);
      }
    }
  }

  public async consolidate(userId: string): Promise<void> {
    const instance = this.resolveInstance(userId);
    if (!instance) throw new Error(`Agent instance not found for ${userId}`);

    const capability = GoogleDriveCapability.fromEnvironment(this.connections);
    if (!capability) throw new Error('GoogleDriveCapability failed to initialize.');

    const now = new Date();
    const year = now.getUTCFullYear();
    const week = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    
    // 1. Export Profile
    const profile = {
      userId,
      language: instance.memoryStore?.getBelief('language_preference') || 'en',
      createdAt: now.toISOString()
    };
    await capability.writeFile(userId, 'SERA_Profile.json', JSON.stringify(profile, null, 2), 'application/json');

    // 2. Export Memory Snapshot
    let activeBeliefs = [];
    if (typeof instance.memoryStore?.getAllBeliefs === 'function') {
      activeBeliefs = instance.memoryStore.getAllBeliefs().filter((b: any) => b.status === 'ACTIVE');
    }
    const memorySnapshot = {
      exportedAt: now.toISOString(),
      beliefs: activeBeliefs
    };
    await capability.writeFile(userId, 'SERA_Memory_Snapshot.json', JSON.stringify(memorySnapshot, null, 2), 'application/json');

    // 3. Export Weekly Journal
    let chatSummary = 'No chats this week.';
    // In a real scenario, we'd query chat history for the last 7 days and summarize it using the ReflectionEngine.
    // For now, we will just dump a placeholder or some basic stats.
    const journalContent = `# SERA Weekly Journal (Week ${week}, ${year})\n\nGenerated on: ${now.toISOString()}\n\n## Summary\n${chatSummary}\n\n## Active Memories\nTotal active beliefs: ${activeBeliefs.length}`;
    
    await capability.writeFile(userId, `SERA_Journal_${year}_W${week}.md`, journalContent, 'text/markdown');

    console.log(`[MemoryConsolidationWorker] Completed for user ${userId}`);
  }

  public async consolidatePrePurge(userId: string, staleRecords: number): Promise<void> {
    const capability = GoogleDriveCapability.fromEnvironment(this.connections);
    if (!capability) return;

    const now = new Date();
    const archiveName = `SERA_Archive_${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, '0')}.md`;
    
    const content = `# SERA Pre-Purge Archive\n\nGenerated on: ${now.toISOString()}\n\nArchiving ${staleRecords} stale records before hygiene cycle deletion.\n\n(End of Archive)`;
    try {
      await capability.writeFile(userId, archiveName, content, 'text/markdown');
      console.log(`[MemoryConsolidationWorker] Pre-purge archive created for user ${userId}`);
    } catch (e: any) {
      console.warn(`[MemoryConsolidationWorker] Pre-purge archive failed for user ${userId}: ${e.message}`);
    }
  }
}
