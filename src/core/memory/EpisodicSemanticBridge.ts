import { EventEmitter } from 'node:events';
import { StandardEvent } from '../events/types';
import { IMemoryStore } from './IMemoryStore';
import { ExperienceRecord } from './ExperienceRecord';
import { Belief } from './types';

export class EpisodicSemanticBridge {
  constructor(private eventBus: EventEmitter, private memoryStore: IMemoryStore) {
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

    const lowerSummary = record.summary.toLowerCase();

    // Distill a failure pattern
    if (lowerSummary.includes('fail') || lowerSummary.includes('error')) {
      // More flexible match for tool name
      const toolMatch = lowerSummary.match(/tool\s*['"]?([^'"\s]+)['"]?/i);
      const toolName = toolMatch ? toolMatch[1] : 'unknown-tool';

      if (toolName !== 'unknown-tool') {
        const content = `Tool '${toolName}' failed consistently during execution.`;
        const existing = this.memoryStore.getBeliefsByCategory('SEMANTIC').find(b => b.content === content);
        
        const count = existing ? existing.evidenceIds.length + 1 : 1;
        const isConfirmed = count >= 3;
        
        if (existing) {
           // Upgrade or maintain status, never downgrade on restart
           existing.epistemicStatus = isConfirmed ? 'CONFIRMED' : 'HYPOTHESIS';
           existing.confidence = Math.min(0.3 + (count * 0.2), 0.95);
           existing.evidenceIds.push(record.id);
           this.memoryStore.updateBelief(existing);
           console.log(`[EpisodicSemanticBridge] Updated semantic failure belief for tool: ${toolName} to ${existing.epistemicStatus} (Count: ${count})`);
        } else {
           const semanticBelief: Belief = {
             id: `belief-semantic-fail-${Date.now()}`,
             category: 'SEMANTIC',
             content,
             epistemicStatus: isConfirmed ? 'CONFIRMED' : 'HYPOTHESIS',
             confidence: Math.min(0.3 + (count * 0.2), 0.95),
             evidenceIds: [record.id],
             contradictionIds: [],
             createdAt: Date.now(),
             updatedAt: Date.now()
           };
           this.memoryStore.storeBelief(semanticBelief);
           console.log(`[EpisodicSemanticBridge] Distilled new semantic failure belief for tool: ${toolName} as ${semanticBelief.epistemicStatus}`);
        }
      }
    }
  }
}
