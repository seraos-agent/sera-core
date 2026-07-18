import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { StandardEvent } from '../events/types';
import { IWorkingMemory } from './IWorkingMemory';
import { ExperienceRecord } from './ExperienceRecord';
import { EventTypes } from '../events/types';
import { QwenAdapter } from '../../capabilities/llm/QwenAdapter';
import { MemoryOperation, MemoryProposal } from './MemoryProposal';
import { MemorySource } from './MemorySource';
import { EvidenceType } from './MemoryEvidence';

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

  private submitProposal(proposal: MemoryProposal): void {
    this.eventBus.emit(EventTypes.MEMORY_PROPOSAL_REQUESTED, {
      id: `evt-memory-proposal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: EventTypes.MEMORY_PROPOSAL_REQUESTED,
      source: 'EpisodicSemanticBridge',
      timestamp: Date.now(),
      payload: proposal
    } as StandardEvent<MemoryProposal>);
  }

  private semanticFactKey(content: string): string {
    const digest = createHash('sha256').update(content.trim().toLowerCase()).digest('hex').slice(0, 24);
    return `semantic.derived.${digest}`;
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
        const key = `semantic.tool-failure.${toolName.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}`;
        const existing = this.memoryStore.getBeliefByKey(key) || this.memoryStore.getBeliefsByCategory('SEMANTIC').find(b => b.content === content);
        
        const count = existing ? existing.evidenceIds.length + 1 : 1;

        this.submitProposal({
          operation: existing ? MemoryOperation.UPDATE : MemoryOperation.CREATE,
          key,
          value: content,
          source: MemorySource.REFLECTION_INFERENCE,
          evidence: { type: EvidenceType.REFLECTION_PATTERN, referenceId: record.id, timestamp: record.timestamp },
          confidence: Math.min(0.3 + (count * 0.2), 0.95),
          category: 'SEMANTIC'
        });
        console.log(`[EpisodicSemanticBridge] Proposed semantic failure belief for tool: ${toolName} (Evidence count: ${count})`);
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

          const key = this.semanticFactKey(content);
          const existing = this.memoryStore.getBeliefByKey(key);
          this.submitProposal({
            operation: existing ? MemoryOperation.UPDATE : MemoryOperation.CREATE,
            key,
            value: content,
            source: MemorySource.REFLECTION_INFERENCE,
            evidence: { type: EvidenceType.REFLECTION_PATTERN, referenceId: record.id, timestamp: record.timestamp },
            confidence: 0.8,
            category: 'SEMANTIC'
          });
          console.log(`[EpisodicSemanticBridge] Proposed derived semantic belief: ${content}`);
        }
      }
    } catch (llmErr) {
      console.error('[EpisodicSemanticBridge] Failed to distill semantic facts', llmErr);
    }
  }
}
