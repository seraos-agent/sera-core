import { EventEmitter } from 'node:events';
import { StandardEvent } from '../events/types';
import { IWorkingMemory } from './IWorkingMemory';
import { ExperienceRecord } from './ExperienceRecord';
import { Belief } from './types';
import { QwenAdapter } from '../../capabilities/llm/QwenAdapter';

export class EpisodicSemanticBridge {
  private llm: QwenAdapter;

  constructor(private eventBus: EventEmitter, private memoryStore: IWorkingMemory) {
    this.llm = new QwenAdapter();
    this.setupListeners();
    console.log('[EpisodicSemanticBridge] Initialized. Listening for episodes.');
  }

  private setupListeners() {
    this.eventBus.on('system.episode.consolidated', (event: StandardEvent) => {
      this.handleEpisodeConsolidated(event.payload as ExperienceRecord);
    });
  }

  private async handleEpisodeConsolidated(record: ExperienceRecord) {
    if (!record || !record.summary) return;

    console.log(`[EpisodicSemanticBridge] Analyzing episode: ${record.id}`);

    const lowerSummary = record.summary.toLowerCase();

    // 1. Hardcoded Failure Distillation
    if (lowerSummary.includes('fail') || lowerSummary.includes('error')) {
      const toolMatch = lowerSummary.match(/tool\s*['"]?([^'"\s]+)['"]?/i);
      const toolName = toolMatch ? toolMatch[1] : 'unknown-tool';

      if (toolName !== 'unknown-tool') {
        const content = `Tool '${toolName}' failed consistently during execution.`;
        const existing = this.memoryStore.getBeliefsByCategory('SEMANTIC').find(b => b.content === content);
        
        const count = existing ? existing.evidenceIds.length + 1 : 1;
        const isConfirmed = count >= 3;
        
        if (existing) {
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

    // 2. LLM Preference Distillation
    const prompt = `Analyze this episode summary and extract any permanent user facts or preferences.
Episode Summary: "${record.summary}"
Rules:
1. ONLY return a JSON array of strings. Each string is a factual preference (e.g., ["User prefers casual tone", "User trades heavily on Base"]).
2. If there are no permanent preferences or facts (e.g., just a routine action or normal chat), return an empty array [].
3. Do not include temporary goals (like "User wants to transfer 10 USDC").
4. Return raw JSON array, no markdown.`;

    try {
      const response = await this.llm.generate([{ role: 'user', content: prompt }]);
      let facts: string[] = [];
      try {
        let text = response.text.trim();
        if (text.startsWith('```json')) text = text.slice(7, -3).trim();
        if (text.startsWith('```')) text = text.slice(3, -3).trim();
        facts = JSON.parse(text);
      } catch (e) {
        // Ignored
      }

      if (Array.isArray(facts) && facts.length > 0) {
        for (const fact of facts) {
          const content = fact.trim();
          if (!content) continue;

          const existing = this.memoryStore.getBeliefsByCategory('SEMANTIC').find(b => b.content === content);
          if (existing) {
             existing.evidenceIds.push(record.id);
             existing.epistemicStatus = 'CONFIRMED';
             this.memoryStore.updateBelief(existing);
             console.log(`[EpisodicSemanticBridge] Reinforced semantic belief: ${content}`);
          } else {
             const semanticBelief: Belief = {
               id: `belief-semantic-pref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
               category: 'SEMANTIC',
               content,
               epistemicStatus: 'CONFIRMED',
               confidence: 0.8,
               evidenceIds: [record.id],
               contradictionIds: [],
               createdAt: Date.now(),
               updatedAt: Date.now()
             };
             this.memoryStore.storeBelief(semanticBelief);
             console.log(`[EpisodicSemanticBridge] Extracted new semantic belief: ${content}`);
          }
        }
      }
    } catch (llmErr) {
      console.error('[EpisodicSemanticBridge] Failed to distill semantic facts', llmErr);
    }
  }
}
