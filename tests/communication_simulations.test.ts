import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../src/core/events/types';
import { CommunicationBridge } from '../src/capabilities/communication/CommunicationBridge';
import { SlackAdapter } from '../src/capabilities/communication/adapters/SlackAdapter';
import { MemoryIngress } from '../src/core/memory/MemoryIngress';
import { WorkingMemory } from '../src/memory/WorkingMemory';
import { MemoryStatus } from '../src/core/memory/MemoryItem';
import { WorldStateService } from '../src/core/world-state/WorldStateService';

class MockBoltApp {
  private messageListeners: Array<(args: any) => void> = [];
  private eventListeners: Map<string, Array<(args: any) => void>> = new Map();
  public sentMessages: any[] = [];

  public client = {
    auth: {
      test: async () => ({ user_id: 'U_SERA_BOT', user: 'sera' })
    },
    chat: {
      postMessage: async (args: any) => {
        this.sentMessages.push(args);
        return { ts: `mock-ts-${Date.now()}`, ok: true };
      }
    }
  };

  message(handler: (args: any) => void) {
    this.messageListeners.push(handler);
  }

  event(eventName: string, handler: (args: any) => void) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName)!.push(handler);
  }

  simulateIncomingMessage(message: any) {
    for (const handler of this.messageListeners) {
      handler({ message, say: async () => {} });
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeSlackEvent(opts: {
  user?: string; channel?: string; text: string; ts?: string; team?: string; bot_id?: string;
}) {
  return {
    type: 'message',
    user: opts.user ?? 'U_HUMAN',
    channel: opts.channel ?? 'C_GENERAL',
    text: opts.text,
    ts: opts.ts ?? '1720000000.000',
    team: opts.team ?? 'T_WORKSPACE',
    ...(opts.bot_id ? { bot_id: opts.bot_id } : {})
  };
}

describe('Communication Simulations', () => {
  const BOT_USER_ID = 'U_SERA_BOT';

  async function createEnvironment() {
    const eventBus = new EventEmitter();
    const worldStateService = new WorldStateService(eventBus);
    const memoryStore = new WorkingMemory(eventBus);
    new MemoryIngress(eventBus, memoryStore as any);

    const mockBoltApp = new MockBoltApp();
    const slackAdapter = new SlackAdapter(mockBoltApp as any, eventBus, BOT_USER_ID);
    const communicationBridge = new CommunicationBridge(eventBus);
    
    await slackAdapter.start();
    communicationBridge.registerAdapter('slack', slackAdapter);

    return { eventBus, memoryStore, mockBoltApp, communicationBridge, worldStateService };
  }

  describe('Boundary 1: Sensory Filtering', () => {
    it('Ambient channel message emits COMMUNICATION_OBSERVED, NOT DIALOGUE_USER_OBSERVED', async () => {
      const { eventBus, mockBoltApp } = await createEnvironment();

      let commObserved = false;
      let dialogueObserved = false;
      eventBus.on(EventTypes.COMMUNICATION_OBSERVED, () => { commObserved = true; });
      eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, () => { dialogueObserved = true; });

      mockBoltApp.simulateIncomingMessage(makeSlackEvent({ text: 'Good morning team!' }));
      await wait(30);
      
      expect(commObserved).toBe(true);
      expect(dialogueObserved).toBe(false);
    });

    it('Bot messages are filtered out', async () => {
      const { eventBus, mockBoltApp } = await createEnvironment();
      let commObserved = false;
      eventBus.on(EventTypes.COMMUNICATION_OBSERVED, () => { commObserved = true; });

      mockBoltApp.simulateIncomingMessage(makeSlackEvent({
        text: 'I am another bot', bot_id: 'B_OTHER_BOT'
      }));
      await wait(30);
      
      expect(commObserved).toBe(false);
    });
  });

  describe('Boundary 2: Mention Routing & responseContext Injection', () => {
    it('@mention bridges to DIALOGUE_USER_OBSERVED with _responseContext', async () => {
      const { eventBus, mockBoltApp } = await createEnvironment();

      let observedPayload: any = null;
      eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, (event: StandardEvent) => {
        observedPayload = event.payload;
      });

      mockBoltApp.simulateIncomingMessage(makeSlackEvent({
        text: `<@${BOT_USER_ID}> what is the current balance?`,
        channel: 'C_FINANCE',
        ts: '1720001234.000'
      }));
      await wait(30);
      
      expect(observedPayload).not.toBeNull();
      expect(observedPayload.message).toBe('what is the current balance?');
      expect(observedPayload._responseContext?.platform).toBe('slack');
      expect(observedPayload._responseContext?.channelId).toBe('C_FINANCE');
      expect(observedPayload._responseContext?.threadRef).toBe('1720001234.000');
    });

    it('DM bridges to DIALOGUE_USER_OBSERVED', async () => {
      const { eventBus, mockBoltApp } = await createEnvironment();
      let observedContext: any = null;
      eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, (event: StandardEvent) => {
        observedContext = event.payload._responseContext;
      });

      mockBoltApp.simulateIncomingMessage(makeSlackEvent({
        channel: 'D_DM_CHANNEL',
        text: 'hello sera'
      }));
      await wait(30);
      
      expect(observedContext).not.toBeNull();
      expect(observedContext?.platform).toBe('slack');
      expect(observedContext?.channelId).toBe('D_DM_CHANNEL');
    });
  });

  describe('Boundary 3: responseContext Propagation', () => {
    it('DIALOGUE_AGENT_SPEAK includes responseContext when observation had _responseContext', async () => {
      const { eventBus, mockBoltApp } = await createEnvironment();

      const speakEvent: StandardEvent = {
        id: 'evt-speak-1',
        type: EventTypes.DIALOGUE_AGENT_SPEAK,
        source: 'DialogueEngine',
        timestamp: Date.now(),
        payload: {
          text: 'Your balance is 100 USDC.',
          responseContext: { platform: 'slack', channelId: 'C_FINANCE', threadRef: '1720001234.000' }
        }
      };

      eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, speakEvent);
      await wait(30);

      expect(mockBoltApp.sentMessages).toHaveLength(1);
      expect(mockBoltApp.sentMessages[0].channel).toBe('C_FINANCE');
      expect(mockBoltApp.sentMessages[0].text).toBe('Your balance is 100 USDC.');
      expect(mockBoltApp.sentMessages[0].thread_ts).toBe('1720001234.000');
    });

    it('DIALOGUE_AGENT_SPEAK WITHOUT responseContext does NOT go to Slack API', async () => {
      const { eventBus, mockBoltApp } = await createEnvironment();

      const speakEvent: StandardEvent = {
        id: 'evt-speak-2',
        type: EventTypes.DIALOGUE_AGENT_SPEAK,
        source: 'DialogueEngine',
        timestamp: Date.now(),
        payload: { text: 'Hello from web UI.' }
      };

      eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, speakEvent);
      await wait(30);

      expect(mockBoltApp.sentMessages).toHaveLength(0);
    });
  });

  describe('Boundary 4: Tool Execution', () => {
    it('SEND_MESSAGE action dispatched → routes to Slack API → result emitted', async () => {
      const { eventBus, mockBoltApp } = await createEnvironment();

      let resultPayload: any = null;
      eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, (event: StandardEvent) => {
        if (event.correlationId === 'req-comm-001') resultPayload = event.payload;
      });

      const actionEvent: StandardEvent = {
        id: 'evt-action-1',
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'ExecutionDispatcher',
        timestamp: Date.now(),
        payload: {
          actionType: 'SEND_MESSAGE',
          actionPayload: { platform: 'slack', channelId: 'C_ANNOUNCEMENTS', text: 'SERA is now operational.' },
          context: { triggerId: 'req-comm-001' }
        }
      };

      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, actionEvent);
      await wait(60);

      expect(mockBoltApp.sentMessages).toHaveLength(1);
      expect(mockBoltApp.sentMessages[0].channel).toBe('C_ANNOUNCEMENTS');
      expect(mockBoltApp.sentMessages[0].text).toBe('SERA is now operational.');
      expect(resultPayload).not.toBeNull();
      expect(resultPayload.success).toBe(true);
      expect(resultPayload.data?.platformMessageId).toContain('mock-ts-');
    });

    it('SEND_MESSAGE for unknown platform emits failure result', async () => {
      const { eventBus } = await createEnvironment();

      let resultPayload: any = null;
      eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, (event: StandardEvent) => {
        if (event.correlationId === 'req-comm-002') resultPayload = event.payload;
      });

      const actionEvent: StandardEvent = {
        id: 'evt-action-2',
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'ExecutionDispatcher',
        timestamp: Date.now(),
        payload: {
          actionType: 'SEND_MESSAGE',
          actionPayload: { platform: 'discord', channelId: 'C_123', text: 'hello discord' },
          context: { triggerId: 'req-comm-002' }
        }
      };

      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, actionEvent);
      await wait(60);

      expect(resultPayload).not.toBeNull();
      expect(resultPayload.success).toBe(false);
      expect(resultPayload.errorMessage).toContain('discord');
    });
  });

  describe('Boundary 5: Epistemic (Observation → Belief)', () => {
    it('Factual statement in channel flows to MemoryIngress → MemoryStore as PENDING belief', async () => {
      const { memoryStore, mockBoltApp } = await createEnvironment();

      mockBoltApp.simulateIncomingMessage(makeSlackEvent({ text: 'Our server cost is $800 per month' }));
      await wait(50);

      const semanticBeliefs = memoryStore.getBeliefsByCategory('SEMANTIC');
      const found = semanticBeliefs.find((b: any) => typeof b.content === 'string' && b.content.includes('$800'));
      
      expect(found).toBeDefined();
      const status = (found as any).status;
      expect(['PENDING', MemoryStatus.PENDING]).toContain(status);
    });
  });

  describe('Boundary 6: Core Independence', () => {
    it('Non-communication action types not intercepted', async () => {
      const { eventBus, mockBoltApp } = await createEnvironment();

      const actionEvent: StandardEvent = {
        id: 'evt-action-3',
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'GoalBridge',
        timestamp: Date.now(),
        payload: {
          actionType: 'TRANSFER_FUNDS',
          actionPayload: { amount: '10', toAddress: '0xabc' },
          context: { triggerId: 'req-wallet-001' }
        }
      };

      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, actionEvent);
      await wait(30);

      expect(mockBoltApp.sentMessages).toHaveLength(0);
    });
  });
});
