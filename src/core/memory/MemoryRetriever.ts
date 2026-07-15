import { IWorkingMemory } from './IWorkingMemory';
import { EpisodicMemoryReader } from './EpisodicMemoryReader';
import { VectorMemoryStore } from './VectorMemoryStore';
import { QwenAdapter } from '../../capabilities/llm/QwenAdapter';

export class MemoryRetriever {
  constructor(
    private memoryStore: IWorkingMemory,
    private episodicReader: EpisodicMemoryReader,
    private vectorStore: VectorMemoryStore,
    private llm: QwenAdapter
  ) {}

  public async retrieve(query?: string): Promise<string[]> {
    const contextLines: string[] = [];
    
    // 1. Semantic Beliefs (Facts/Preferences)
    const semanticBeliefs = this.memoryStore.getBeliefsByCategory('SEMANTIC');
    const knownFacts = semanticBeliefs
      .filter(b => b.epistemicStatus === 'CONFIRMED' && (!b.key || !b.key.startsWith('wallet.')))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10)
      .map(b => typeof b.content === 'string' ? b.content : JSON.stringify(b.content));
    
    if (knownFacts.length > 0) {
      contextLines.push('--- KNOWN FACTS & PREFERENCES ---');
      contextLines.push(...knownFacts);
    }

    // 2. Vector Similarity Search (Long-term Episodic recall)
    if (query) {
      try {
        const queryVector = await this.llm.embed(query);
        const similarEpisodes = this.vectorStore.search(queryVector, 3, 0.4);
        if (similarEpisodes.length > 0) {
          contextLines.push('--- RELEVANT PAST EPISODES ---');
          similarEpisodes.forEach(res => {
            contextLines.push(`- ${res.record.metadata.summary} (Match: ${Math.round(res.score*100)}%)`);
          });
        }
      } catch (e) {
        console.error('[MemoryRetriever] Vector search failed:', e);
      }
    }

    // 3. Recent Episodes (Short-term context)
    const recentEpisodes = this.episodicReader.readLastEpisodes(3);
    if (recentEpisodes.length > 0) {
      contextLines.push('--- RECENT ACTIVITY ---');
      recentEpisodes.forEach(ep => {
        contextLines.push(`- ${ep.summary}`);
      });
    }

    return contextLines;
  }
}
