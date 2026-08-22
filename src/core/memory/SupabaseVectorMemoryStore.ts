import { SupabaseRestClient } from '../persistence/SupabaseRestClient';
import { VectorRecord, SearchResult } from './VectorMemoryStore';

/**
 * SupabaseVectorMemoryStore — Persistent vector memory backed by Supabase pgvector.
 *
 * Drop-in replacement for VectorMemoryStore that persists embeddings to the
 * `sera_vector_memories` table. Uses the `match_vector_memories` RPC function
 * for cosine similarity search via pgvector.
 *
 * Falls back gracefully if Supabase is unavailable: insert silently fails,
 * search returns empty results. The caller (ExperienceBuilder, MemoryQueryService)
 * already handles empty results.
 */

interface SupabaseVectorMatch {
  id: string;
  session_id: string;
  metadata: Record<string, any>;
  created_at: string;
  similarity: number;
}

export class SupabaseVectorMemoryStore {
  private readonly client: SupabaseRestClient | null;
  private readonly sessionId: string;

  constructor(sessionId: string = 'default', client?: SupabaseRestClient | null) {
    this.sessionId = sessionId;
    this.client = client ?? SupabaseRestClient.fromEnvironment();
  }

  public async insert(id: string, vector: number[], metadata: Record<string, any>): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.upsert('sera_vector_memories', {
        id,
        session_id: this.sessionId,
        embedding: JSON.stringify(vector),
        metadata,
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
      }, 'id,session_id');
    } catch (error) {
      console.warn('[SupabaseVectorMemoryStore] Failed to insert vector, degrading gracefully:', error instanceof Error ? error.message : error);
    }
  }

  public async search(queryVector: number[], topK: number = 3, threshold: number = 0.5): Promise<SearchResult[]> {
    if (!this.client) return [];
    try {
      const matches = await this.client.rpc<SupabaseVectorMatch[]>('match_vector_memories', {
        query_embedding: JSON.stringify(queryVector),
        match_session_id: this.sessionId,
        match_threshold: threshold,
        match_count: topK,
      });

      if (!matches || !Array.isArray(matches)) return [];

      return matches.map(match => ({
        record: {
          id: match.id,
          vector: [], // We don't return the full vector from search — saves bandwidth
          metadata: match.metadata || {},
          timestamp: new Date(match.created_at).getTime(),
        },
        score: match.similarity,
      }));
    } catch (error) {
      console.warn('[SupabaseVectorMemoryStore] Search failed, returning empty:', error instanceof Error ? error.message : error);
      return [];
    }
  }
}
