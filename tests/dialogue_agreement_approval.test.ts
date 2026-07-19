import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { DialogueEngine } from '../src/capabilities/dialogue/DialogueEngine';
import { ChatHistoryStore } from '../src/capabilities/dialogue/ChatHistoryStore';
import { EventTypes, StandardEvent } from '../src/core/events/types';
import { ProposalManager } from '../src/core/governance/ProposalManager';
import { WorldStateService } from '../src/core/world-state/WorldStateService';
import { AutonomyAgreementStore } from '../src/core/autonomy/AutonomyAgreementStore';

const observed = (message: string): StandardEvent => ({
  id: `evt-${message}`,
  type: EventTypes.DIALOGUE_USER_OBSERVED,
  source: 'test',
  timestamp: Date.now(),
  payload: { message }
});

describe('conversational Operating Agreement approval', () => {
  it('creates a paper-only Full Access proposal and accepts "iya" without an LLM round trip', async () => {
    const eventBus = new EventEmitter();
    new ProposalManager(eventBus);
    new DialogueEngine(
      eventBus,
      new WorldStateService(eventBus, 'dialogue-agreement-test'),
      { getTool: () => undefined },
      { getHistory: () => [] } as any,
      new ChatHistoryStore('dialogue-agreement-test'),
      {} as any,
      'dialogue-agreement-test',
      new AutonomyAgreementStore()
    );

    const proposals: any[] = [];
    const spawned: any[] = [];
    eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, (event: StandardEvent) => proposals.push(event.payload));
    eventBus.on(EventTypes.DOMAIN_GOAL_SPAWNED, (event: StandardEvent) => spawned.push(event.payload));

    eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, observed('kelola paper trading BTC saya dengan full access'));
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      intent: 'ACTIVATE_AUTONOMY_AGREEMENT',
      parameters: { mode: 'FULL_ACCESS', permissions: ['PAPER_TRADE'], title: 'Paper trading BTC' }
    });

    eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, observed('iya'));
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({
      intent: 'ACTIVATE_AUTONOMY_AGREEMENT',
      parameters: { _userMessage: 'kelola paper trading BTC saya dengan full access' }
    });
  });
});
