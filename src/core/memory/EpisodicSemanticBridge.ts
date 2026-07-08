import { EventEmitter } from 'node:events';
import { StandardEvent } from '../events/types';
import { MemoryStore } from '../../memory/MemoryStore';
import { ExperienceRecord } from './ExperienceRecord';
import { Belief } from '../../memory/types';

export class EpisodicSemanticBridge {
  constructor(private eventBus: EventEmitter, private memoryStore: MemoryStore) {
    this.setupListeners();
    console.log('[EpisodicSemanticBridge] Initialized. Listening for episodes.');
  }

  private setupListeners() {
    this.eventBus.on('system.episode.consolidated', (event: StandardEvent) => {
      this.handleEpisodeConsolidated(event.payload as ExperienceRecord);
    });
  }

  private handleEpisodeConsolidated(record: ExperienceRecord) {
    if (!record || !record.summary) return;

    console.log(`[EpisodicSemanticBridge] Analyzing episode: ${record.id}`);

    // Simple heuristic-based semantic distillation for demo purposes
    // In a full implementation, this would use an LLM or pattern extractor to find recurring themes.
    const lowerSummary = record.summary.toLowerCase();

    // Distill a failure pattern
    if (lowerSummary.includes('failed') || lowerSummary.includes('error')) {
      const toolMatch = lowerSummary.match(/tool '([^']+)'/);
      const toolName = toolMatch ? toolMatch[1] : 'unknown-tool';

      if (toolName !== 'unknown-tool') {
        const content = `Tool '${toolName}' failed consistently during execution.`;
        
        const semanticBelief: Belief = {
          id: `belief-semantic-fail-${Date.now()}`,
          category: 'SEMANTIC',
          content,
          epistemicStatus: 'CONFIRMED',
          confidence: 0.9,
          evidenceIds: [record.id],
          contradictionIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        this.memoryStore.storeBelief(semanticBelief);
        console.log(`[EpisodicSemanticBridge] Distilled new semantic failure belief for tool: ${toolName}`);
      }
    }

    // You can add more heuristics here for successful patterns, user preferences, etc.
  }
}
