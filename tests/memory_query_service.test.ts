import { describe, expect, it, vi } from 'vitest';
import { WorkingMemory } from '../src/memory/WorkingMemory';
import { MemoryQueryService } from '../src/core/memory/MemoryQueryService';
import { MemoryStatus } from '../src/core/memory/MemoryItem';
import { EvidenceType } from '../src/core/memory/MemoryEvidence';
import { MemoryOperation } from '../src/core/memory/MemoryProposal';
import { MemorySource } from '../src/core/memory/MemorySource';

describe('MemoryQueryService', () => {
  it('builds a bounded, deduplicated attention pack with provenance and no wallet data', async () => {
    const now = Date.now();
    const memoryStore = new WorkingMemory();
    memoryStore.storeBelief({
      id: 'semantic-release',
      category: 'SEMANTIC',
      key: 'workspace.release.strategy',
      content: 'The deployment uses blue-green releases.',
      status: MemoryStatus.ACTIVE,
      epistemicStatus: 'CONFIRMED',
      confidence: 0.9,
      evidenceIds: ['release-doc'],
      contradictionIds: [],
      createdAt: now - 1_000,
      updatedAt: now - 1_000
    });
    memoryStore.proposeBelief({
      operation: MemoryOperation.CREATE,
      key: 'wallet.privateKey',
      value: 'sensitive-wallet-value',
      source: MemorySource.BLOCKCHAIN_OBSERVATION,
      confidence: 1,
      evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: 'wallet-read', timestamp: now },
      category: 'SEMANTIC'
    });
    memoryStore.storeBelief({
      id: 'semantic-unrelated',
      category: 'SEMANTIC',
      content: 'The office pantry is stocked on Mondays.',
      epistemicStatus: 'CONFIRMED',
      confidence: 1,
      evidenceIds: ['office-note'],
      contradictionIds: [],
      createdAt: now,
      updatedAt: now
    });

    const service = new MemoryQueryService(
      memoryStore,
      {
        readLastEpisodes: () => [
          {
            id: 'episode-vector',
            timestamp: now - 2_000,
            type: 'GOAL_EXECUTION',
            summary: 'The deployment health check passed after blue-green cutover.',
            evidence: [{ type: EvidenceType.EXECUTION_TRACE, referenceId: 'trace-1', timestamp: now - 2_000 }]
          },
          {
            id: 'episode-recent',
            timestamp: now - 500,
            type: 'CONVERSATION',
            summary: 'The user asked about the deployment status.',
            evidence: [{ type: EvidenceType.USER_MESSAGE, referenceId: 'message-1', timestamp: now - 500 }]
          }
        ]
      },
      {
        search: () => [{
          record: {
            id: 'episode-vector',
            vector: [0.1, 0.2],
            metadata: {
              summary: 'The deployment health check passed after blue-green cutover.',
              evidenceIds: ['trace-1']
            },
            timestamp: now - 2_000
          },
          score: 0.94
        }]
      },
      { embed: vi.fn(async () => [0.1, 0.2]) }
    );

    const pack = await service.query('What is the deployment status?', { maxItems: 6, tokenBudget: 120 });

    expect(pack.estimatedTokens).toBeLessThanOrEqual(120);
    expect(pack.items.some(item => item.content.includes('sensitive-wallet-value'))).toBe(false);
    expect(pack.items.some(item => item.id === 'semantic-release')).toBe(true);
    expect(pack.items.filter(item => item.id === 'episode-vector')).toHaveLength(1);
    expect(pack.items.find(item => item.id === 'episode-vector')?.evidenceIds).toEqual(['trace-1']);
    expect(pack.items.some(item => item.id === 'semantic-unrelated')).toBe(false);

    const promptContext = service.toPromptContext(pack);
    expect(promptContext.items.some(item => 'evidenceIds' in item)).toBe(false);
    expect(promptContext.items.some(item => item.content.includes('sensitive-wallet-value'))).toBe(false);
    expect(promptContext.items.find(item => item.source === 'SEMANTIC')?.epistemicStatus).toBe('CONFIRMED');
  });

  it('enforces its token budget even when the highest-ranked memory is oversized', async () => {
    const memoryStore = new WorkingMemory();
    memoryStore.storeBelief({
      id: 'semantic-large',
      category: 'SEMANTIC',
      content: `Deployment note: ${'relevant '.repeat(80)}`,
      epistemicStatus: 'CONFIRMED',
      confidence: 1,
      evidenceIds: ['large-note'],
      contradictionIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    const service = new MemoryQueryService(
      memoryStore,
      { readLastEpisodes: () => [] },
      { search: () => [] },
      { embed: async () => [] }
    );

    const pack = await service.query('deployment note', { tokenBudget: 16 });

    expect(pack.estimatedTokens).toBeLessThanOrEqual(16);
    expect(pack.truncated).toBe(true);
    expect(pack.items[0]?.content.endsWith('…')).toBe(true);
  });
});
