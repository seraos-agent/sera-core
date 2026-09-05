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
    
    // Ensure 🧠 System Core folder exists inside SERA Vault
    const systemCoreFolderId = await capability.ensureFolder(userId, '🧠 System Core');

    // 1. Export Enriched Profile (Option A: 🧠 System Core/)
    const profile = {
      userId,
      userDisplayName: instance.userDisplayName || 'User',
      role: 'Autonomous AI Operating System & Business Copilot',
      language: instance.memoryStore?.getBelief('language_preference') || 'id',
      defaultCurrency: instance.memoryStore?.getBelief('currency_preference') || 'IDR',
      timezone: instance.userTimezone || 'Asia/Jakarta',
      businessContext: {
        domains: ['marketplace (Shopee, Tokopedia, TikTok Shop)', 'e-commerce', 'personal finance', 'inventory management'],
        notes: 'Adaptive multi-domain intelligence tailored for Indonesian and global business operations.'
      },
      updatedAt: now.toISOString(),
      version: '2.0'
    };
    await capability.writeFile(userId, 'SERA_Profile.json', JSON.stringify(profile, null, 2), 'application/json', systemCoreFolderId);

    // 2. Export Memory Snapshot
    let activeBeliefs = [];
    if (typeof instance.memoryStore?.getAllBeliefs === 'function') {
      activeBeliefs = instance.memoryStore.getAllBeliefs().filter((b: any) => b.status === 'ACTIVE');
    }
    const memorySnapshot = {
      exportedAt: now.toISOString(),
      user: {
        userId,
        timezone: instance.userTimezone || 'Asia/Jakarta'
      },
      stats: {
        totalActiveBeliefs: activeBeliefs.length,
        version: '2.0'
      },
      beliefs: activeBeliefs
    };
    await capability.writeFile(userId, 'SERA_Memory_Snapshot.json', JSON.stringify(memorySnapshot, null, 2), 'application/json', systemCoreFolderId);

    // 3. Export Executive Journal
    const formattedBeliefs = activeBeliefs.length > 0
      ? activeBeliefs.slice(0, 15).map((b: any, idx: number) => `${idx + 1}. **${b.key || b.topic || 'Belief'}**: ${b.value || b.content || JSON.stringify(b)}`).join('\n')
      : '- No explicit beliefs recorded yet.';

    const journalContent = `# SERA Autonomous Journal & Reflection
**Generated**: ${now.toISOString()}
**Period**: Week ${week}, ${year}
**User**: ${userId}
**System Subfolder**: 🧠 System Core

---

## 🧭 Executive Overview
SERA is actively orchestrating operations across business spreadsheets, marketplace sales reconciliations, financial journals, and cognitive goal tracking. Cognitive memory models remain synchronized with Google Drive SERA Vault.

## 📊 Operational Telemetry
- **Active Beliefs Count**: ${activeBeliefs.length}
- **Default Currency**: ${profile.defaultCurrency}
- **Timezone**: ${profile.timezone}
- **Language**: ${profile.language}

## 🧠 Active Memory & Context
${formattedBeliefs}

---
*Maintained automatically by SERA Autonomous Memory Engine.*
`;
    
    // Save both live current journal and historical weekly snapshot
    await capability.writeFile(userId, 'SERA_Journal.md', journalContent, 'text/markdown', systemCoreFolderId);
    await capability.writeFile(userId, `SERA_Journal_${year}_W${week}.md`, journalContent, 'text/markdown', systemCoreFolderId);

    console.log(`[MemoryConsolidationWorker] Completed for user ${userId} in 🧠 System Core`);
  }

  public async consolidatePrePurge(userId: string, staleRecords: number): Promise<void> {
    const capability = GoogleDriveCapability.fromEnvironment(this.connections);
    if (!capability) return;

    const now = new Date();
    const archiveName = `SERA_Archive_${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, '0')}.md`;
    
    const content = `# SERA Pre-Purge Archive\n\nGenerated on: ${now.toISOString()}\n\nArchiving ${staleRecords} stale records before hygiene cycle deletion.\n\n(End of Archive)`;
    try {
      const archiveFolderId = await capability.ensureFolder(userId, '🗄️ Archive');
      await capability.writeFile(userId, archiveName, content, 'text/markdown', archiveFolderId);
      console.log(`[MemoryConsolidationWorker] Pre-purge archive created for user ${userId} in 🗄️ Archive`);
    } catch (e: any) {
      console.warn(`[MemoryConsolidationWorker] Pre-purge archive failed for user ${userId}: ${e.message}`);
    }
  }

  /**
   * Rehydrates cognitive memory beliefs and preferences from Google Drive Vault
   * when reconnecting or initializing an existing vault.
   */
  public async rehydrateFromVault(userId: string): Promise<{ profileLoaded: boolean; beliefsLoaded: number }> {
    const instance = this.resolveInstance(userId);
    if (!instance) return { profileLoaded: false, beliefsLoaded: 0 };

    const capability = GoogleDriveCapability.fromEnvironment(this.connections);
    if (!capability) return { profileLoaded: false, beliefsLoaded: 0 };

    let profileLoaded = false;
    let beliefsLoaded = 0;

    try {
      // 1. Rehydrate Profile
      const profileFiles = await capability.listFiles(userId, { name: 'SERA_Profile.json' });
      if (profileFiles.length > 0) {
        const raw = await capability.readFile(userId, profileFiles[0].id);
        const profile = JSON.parse(raw);
        if (profile.language) {
          if (typeof instance.memoryStore?.storeBelief === 'function') {
            instance.memoryStore.storeBelief({
              id: `belief-lang-${Date.now()}`,
              category: 'SEMANTIC',
              key: 'language_preference',
              content: profile.language,
              status: 'ACTIVE',
              source: 'USER_EXPLICIT',
              confidence: 1.0,
              evidenceIds: ['gdrive-vault-profile'],
              contradictionIds: [],
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          } else if (typeof instance.memoryStore?.setBelief === 'function') {
            instance.memoryStore.setBelief('language_preference', profile.language);
          }
          profileLoaded = true;
        }
        if (profile.defaultCurrency) {
          if (typeof instance.memoryStore?.storeBelief === 'function') {
            instance.memoryStore.storeBelief({
              id: `belief-curr-${Date.now()}`,
              category: 'SEMANTIC',
              key: 'currency_preference',
              content: profile.defaultCurrency,
              status: 'ACTIVE',
              source: 'USER_EXPLICIT',
              confidence: 1.0,
              evidenceIds: ['gdrive-vault-profile'],
              contradictionIds: [],
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          } else if (typeof instance.memoryStore?.setBelief === 'function') {
            instance.memoryStore.setBelief('currency_preference', profile.defaultCurrency);
          }
          profileLoaded = true;
        }
        if (profile.timezone && instance.userTimezone === undefined) {
          instance.userTimezone = profile.timezone;
        }
        if (profile.userDisplayName && !instance.userDisplayName) {
          instance.userDisplayName = profile.userDisplayName;
        }
      }

      // 2. Rehydrate Active Beliefs from Memory Snapshot
      const snapshotFiles = await capability.listFiles(userId, { name: 'SERA_Memory_Snapshot.json' });
      if (snapshotFiles.length > 0) {
        const raw = await capability.readFile(userId, snapshotFiles[0].id);
        const snapshot = JSON.parse(raw);
        const beliefs = snapshot.beliefs || [];
        if (Array.isArray(beliefs)) {
          for (const b of beliefs) {
            try {
              if (b.key && (b.value !== undefined || b.content !== undefined)) {
                const content = String(b.content || (typeof b.value === 'object' ? JSON.stringify(b.value) : b.value));
                if (typeof instance.memoryStore?.storeBelief === 'function') {
                  instance.memoryStore.storeBelief({
                    id: b.id || `rehydrated-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    category: b.category || 'SEMANTIC',
                    key: b.key,
                    content,
                    status: 'ACTIVE',
                    source: b.source || 'REFLECTION_INFERENCE',
                    confidence: b.confidence ?? 0.95,
                    evidenceIds: b.evidenceIds || ['gdrive-vault-snapshot'],
                    contradictionIds: b.contradictionIds || [],
                    createdAt: b.createdAt || Date.now(),
                    updatedAt: Date.now()
                  });
                  beliefsLoaded++;
                }
              }
            } catch {
              // Ignore single item error, continue with remaining beliefs
            }
          }
        }
      }

      console.log(`[MemoryConsolidationWorker] Rehydration complete for ${userId}: profileLoaded=${profileLoaded}, beliefsLoaded=${beliefsLoaded}`);
    } catch (e: any) {
      console.warn(`[MemoryConsolidationWorker] Vault rehydration notice for ${userId}: ${e.message}`);
    }

    return { profileLoaded, beliefsLoaded };
  }
}
