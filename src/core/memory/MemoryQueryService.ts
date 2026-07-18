import { IWorkingMemory } from './IWorkingMemory';
import { ExperienceRecord } from './ExperienceRecord';
import { SearchResult } from './VectorMemoryStore';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface EpisodicMemoryReaderPort {
  readLastEpisodes(count: number): ExperienceRecord[];
}

export interface VectorMemoryStorePort {
  search(queryVector: number[], topK?: number, threshold?: number): SearchResult[];
}

export type AttentionSource = 'SEMANTIC' | 'EPISODIC_VECTOR' | 'EPISODIC_RECENT';

export interface MemoryAttentionItem {
  id: string;
  source: AttentionSource;
  content: string;
  score: number;
  reason: string;
  timestamp: number;
  evidenceIds: string[];
  confidence?: number;
  epistemicStatus?: string;
}

export interface MemoryAttentionPack {
  query?: string;
  items: MemoryAttentionItem[];
  estimatedTokens: number;
  tokenBudget: number;
  truncated: boolean;
}

/** Compact, policy-aware representation intended for the LLM prompt. */
export interface MemoryPromptContext {
  note: string;
  items: Array<{
    source: AttentionSource;
    content: string;
    confidence?: number;
    epistemicStatus?: string;
  }>;
  truncated: boolean;
}

export interface MemoryQueryOptions {
  maxItems?: number;
  tokenBudget?: number;
}

interface Candidate extends MemoryAttentionItem {
  estimatedTokens: number;
}

/**
 * The only service that assembles memory for an LLM call.
 * It retrieves candidates from semantic, vector episodic, and recent episodic
 * memory, then applies a deterministic, policy-aware attention budget.
 */
export class MemoryQueryService {
  private readonly defaultMaxItems = 10;
  private readonly defaultTokenBudget = 900;
  private readonly stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'dengan', 'di', 'dari', 'for', 'how', 'in',
    'is', 'it', 'ke', 'of', 'on', 'or', 'pada', 'the', 'to', 'untuk', 'what', 'with', 'yang'
  ]);

  constructor(
    private memoryStore: IWorkingMemory,
    private episodicReader: EpisodicMemoryReaderPort,
    private vectorStore: VectorMemoryStorePort,
    private embeddingProvider: EmbeddingProvider
  ) {}

  public async query(query?: string, options: MemoryQueryOptions = {}): Promise<MemoryAttentionPack> {
    const maxItems = options.maxItems ?? this.defaultMaxItems;
    const tokenBudget = options.tokenBudget ?? this.defaultTokenBudget;
    const queryTokens = this.tokenize(query || '');
    const candidates: Candidate[] = [];
    const seenIds = new Set<string>();

    for (const belief of this.memoryStore.getBeliefsByCategory('SEMANTIC')) {
      if (!this.isEligibleSemanticBelief(belief)) continue;

      const lexicalScore = this.lexicalSimilarity(queryTokens, belief.content);
      if (queryTokens.length > 0 && lexicalScore === 0) continue;

      candidates.push({
        id: belief.id,
        source: 'SEMANTIC',
        content: belief.content,
        score: this.roundScore((0.55 * lexicalScore) + (0.25 * belief.confidence) + (0.2 * this.recencyScore(belief.updatedAt))),
        reason: queryTokens.length === 0 ? 'confirmed semantic memory' : 'lexical relevance, confidence, and recency',
        timestamp: belief.updatedAt,
        evidenceIds: belief.evidenceIds,
        confidence: belief.confidence,
        epistemicStatus: belief.epistemicStatus,
        estimatedTokens: this.estimateTokens(belief.content)
      });
      seenIds.add(belief.id);
    }

    if (query && query.trim()) {
      try {
        const queryVector = await this.embeddingProvider.embed(query);
        const matches = this.vectorStore.search(queryVector, 12, 0.25);
        for (const match of matches) {
          if (seenIds.has(match.record.id)) continue;
          const metadata = match.record.metadata || {};
          const summary = typeof metadata.summary === 'string' ? metadata.summary : '';
          if (!summary) continue;

          candidates.push({
            id: match.record.id,
            source: 'EPISODIC_VECTOR',
            content: summary,
            score: this.roundScore((0.75 * match.score) + (0.15 * this.recencyScore(match.record.timestamp)) + (0.1 * this.evidenceScore(metadata.evidenceIds))),
            reason: 'semantic similarity with recency and evidence support',
            timestamp: match.record.timestamp,
            evidenceIds: this.toStringArray(metadata.evidenceIds),
            estimatedTokens: this.estimateTokens(summary)
          });
          seenIds.add(match.record.id);
        }
      } catch (error) {
        // Retrieval must degrade safely: a transient embedding failure may not block dialogue.
        console.warn('[MemoryQueryService] Vector recall skipped:', error instanceof Error ? error.message : error);
      }
    }

    const recentEpisodes = this.episodicReader.readLastEpisodes(8);
    for (const episode of recentEpisodes) {
      if (!episode?.id || !episode.summary || seenIds.has(episode.id)) continue;
      const lexicalScore = this.lexicalSimilarity(queryTokens, episode.summary);
      candidates.push({
        id: episode.id,
        source: 'EPISODIC_RECENT',
        content: episode.summary,
        score: this.roundScore((0.4 * lexicalScore) + (0.4 * this.recencyScore(episode.timestamp)) + (0.2 * this.evidenceScore(episode.evidence.map(evidence => evidence.referenceId)))),
        reason: queryTokens.length === 0 ? 'recent episodic context' : 'recent activity with lexical relevance',
        timestamp: episode.timestamp,
        evidenceIds: episode.evidence.map(evidence => evidence.referenceId),
        estimatedTokens: this.estimateTokens(episode.summary)
      });
      seenIds.add(episode.id);
    }

    return this.buildAttentionPack(query, candidates, maxItems, tokenBudget);
  }

  /**
   * Keep retrieval provenance in MemoryAttentionPack for observability while
   * omitting IDs, timestamps, scoring internals, and evidence references from
   * the prompt. Those fields consume context without improving model judgment.
   */
  public toPromptContext(pack: MemoryAttentionPack): MemoryPromptContext {
    return {
      note: 'Confirmed semantic items are durable beliefs. Episodic items are context, not proof; do not present them as verified facts.',
      items: pack.items.map(item => ({
        source: item.source,
        content: item.content,
        ...(item.confidence === undefined ? {} : { confidence: item.confidence }),
        ...(item.epistemicStatus === undefined ? {} : { epistemicStatus: item.epistemicStatus })
      })),
      truncated: pack.truncated
    };
  }

  private buildAttentionPack(query: string | undefined, candidates: Candidate[], maxItems: number, tokenBudget: number): MemoryAttentionPack {
    const perSourceLimit: Record<AttentionSource, number> = {
      SEMANTIC: 4,
      EPISODIC_VECTOR: 4,
      EPISODIC_RECENT: 3
    };
    const sourceCounts: Record<AttentionSource, number> = {
      SEMANTIC: 0,
      EPISODIC_VECTOR: 0,
      EPISODIC_RECENT: 0
    };
    const items: MemoryAttentionItem[] = [];
    let estimatedTokens = 0;
    let truncated = false;

    candidates.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
    for (const candidate of candidates) {
      if (items.length >= maxItems || sourceCounts[candidate.source] >= perSourceLimit[candidate.source]) {
        truncated = true;
        continue;
      }

      const remainingTokens = tokenBudget - estimatedTokens;
      if (remainingTokens <= 0) {
        truncated = true;
        continue;
      }

      const content = candidate.estimatedTokens > remainingTokens
        ? this.truncateToBudget(candidate.content, remainingTokens)
        : candidate.content;
      const itemTokens = this.estimateTokens(content);
      if (!content || itemTokens > remainingTokens) {
        truncated = true;
        continue;
      }

      const { estimatedTokens: _candidateTokens, ...item } = candidate;
      items.push({ ...item, content });
      estimatedTokens += itemTokens;
      sourceCounts[candidate.source]++;
      if (content !== candidate.content) truncated = true;
    }

    return { query, items, estimatedTokens, tokenBudget, truncated };
  }

  private isEligibleSemanticBelief(belief: { epistemicStatus: string; key?: string }): boolean {
    return belief.epistemicStatus === 'CONFIRMED' && !belief.key?.startsWith('wallet.');
  }

  private tokenize(value: string): string[] {
    return Array.from(new Set(
      (value.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [])
        .filter(token => !this.stopWords.has(token))
    ));
  }

  private lexicalSimilarity(queryTokens: string[], content: string): number {
    if (queryTokens.length === 0) return 0.25;
    const contentTokens = new Set(this.tokenize(content));
    const overlaps = queryTokens.filter(token => contentTokens.has(token)).length;
    return overlaps / queryTokens.length;
  }

  private recencyScore(timestamp: number): number {
    const ageHours = Math.max(0, Date.now() - timestamp) / (60 * 60 * 1000);
    return 1 / (1 + (ageHours / 168)); // half-strength after one week
  }

  private evidenceScore(evidenceIds: unknown): number {
    const count = this.toStringArray(evidenceIds).length;
    return Math.min(1, count / 3);
  }

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private estimateTokens(content: string): number {
    return Math.max(1, Math.ceil(content.length / 4));
  }

  private truncateToBudget(content: string, tokenBudget: number): string {
    if (tokenBudget <= 1) return '';
    return `${content.slice(0, Math.max(0, (tokenBudget - 1) * 4)).trim()}…`;
  }

  private roundScore(score: number): number {
    return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
  }
}
