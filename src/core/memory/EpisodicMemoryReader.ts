import * as fs from 'node:fs';
import * as path from 'node:path';
import { SupabaseRestClient } from '../persistence/SupabaseRestClient';

interface SupabaseEpisodicRow {
  id: string;
  session_id: string;
  summary: string;
  type: string;
  evidence: any[];
  created_at: string;
}

export class EpisodicMemoryReader {
  private filePath: string;
  private readonly persistLocally: boolean;
  private readonly supabaseClient: SupabaseRestClient | null;
  private readonly sessionId: string;

  constructor(sessionId: string = 'default', options: { persistLocally?: boolean } = {}) {
    this.persistLocally = options.persistLocally ?? true;
    this.sessionId = sessionId;
    const safeSessionId = sessionId.replace(/:/g, '-');
    this.filePath = path.join(process.cwd(), '.data', 'sessions', safeSessionId, 'episodic_memory.jsonl');
    this.supabaseClient = SupabaseRestClient.fromEnvironment();
  }

  /**
   * Safely reads the last N episodes.
   * Tries local JSONL file first, then falls back to Supabase if empty/missing.
   */
  public readLastEpisodes(count: number): any[] {
    // Try local file first
    const localEpisodes = this.readLocalEpisodes(count);
    if (localEpisodes.length > 0) return localEpisodes;

    // No local data — this is expected on Cloud Run after restart.
    // We cannot await here (sync interface), so return empty.
    // The vector store (SupabaseVectorMemoryStore) handles persistent recall via search().
    return [];
  }

  /**
   * Async variant that can fall back to Supabase when local file is empty.
   * Used by MemoryQueryService when it needs episodic context.
   */
  public async readLastEpisodesAsync(count: number): Promise<any[]> {
    const localEpisodes = this.readLocalEpisodes(count);
    if (localEpisodes.length > 0) return localEpisodes;

    // Fall back to Supabase
    if (!this.supabaseClient) return [];
    try {
      const rows = await this.supabaseClient.select<SupabaseEpisodicRow>(
        'sera_episodic_memories',
        `session_id=eq.${encodeURIComponent(this.sessionId)}&order=created_at.desc&limit=${count}`
      );
      if (!rows || rows.length === 0) return [];
      return rows.map(row => ({
        id: row.id,
        timestamp: new Date(row.created_at).getTime(),
        type: row.type,
        summary: row.summary,
        evidence: row.evidence || [],
      })).reverse(); // Return in chronological order (oldest first)
    } catch (error) {
      console.warn('[EpisodicMemoryReader] Supabase fallback failed:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  private readLocalEpisodes(count: number): any[] {
    if (!this.persistLocally) return [];
    if (!fs.existsSync(this.filePath)) return [];

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      const tailLines = lines.slice(-count);
      return tailLines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      }).filter(item => item !== null);
    } catch (error) {
      console.error('[EpisodicMemoryReader] Error reading episodic memory:', error);
      return [];
    }
  }
}
