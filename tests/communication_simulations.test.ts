import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../src/core/events/types';
import { CommunicationBridge } from '../src/capabilities/communication/CommunicationBridge';
import { SlackAdapter } from '../src/capabilities/communication/adapters/SlackAdapter';
import { MemoryIngress } from '../src/core/memory/MemoryIngress';
import { MemoryStore } from '../src/memory/MemoryStore';
import { MemoryStatus } from '../src/core/memory/MemoryItem';
import { WorldStateService } from '../src/core/world-state/WorldStateService';

// ── MockBoltApp ──────────────────────────────────────────────────────────────
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

  // Bolt's app.message() registration
  message(handler: (args: any) => void) {
    this.messageListeners.push(handler);
  }

  // Bolt's app.event() registration (e.g. app_mention)
  event(eventName: string, handler: (args: any) => void) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName)!.push(handler);
  }

  // Test helper: inject an incoming Slack message
  simulateIncomingMessage(message: any) {
    for (const handler of this.messageListeners) {
      handler({ message, say: async () => {} });
    }
  }
}


// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Test Suite ───────────────────────────────────────────────────────────────
async function runTests() {
  const BOT_USER_ID = 'U_SERA_BOT';
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.log(`  ❌ FAIL: ${name}`);
      console.log(`         ${err.message}`);
      failed++;
    }
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  // ── Setup ────────────────────────────────────────────────────────────────
  async function createEnvironment() {
    const eventBus = new EventEmitter();
    const worldStateService = new WorldStateService(eventBus);
    // MemoryStore wires its own internal MemoryPolicyEngine
    const memoryStore = new MemoryStore(eventBus);
    new MemoryIngress(eventBus, memoryStore);

    const mockBoltApp = new MockBoltApp();
    // Pass BOT_USER_ID as initial value — start() will resolve it again via auth.test
    const slackAdapter = new SlackAdapter(mockBoltApp, eventBus, BOT_USER_ID);
    const communicationBridge = new CommunicationBridge(eventBus);
    // Await adapter registration so auth.test resolves before any messages are simulated
    await slackAdapter.start();
    communicationBridge.registerAdapter('slack', slackAdapter);

    return { eventBus, memoryStore, mockBoltApp, communicationBridge, worldStateService };
  }


  console.log('\n==============================================================');
  console.log('  COMMUNICATION CAPABILITY — SIMULATED E2E VALIDATION');
  console.log('==============================================================\n');

  // ────────────────────────────────────────────────────────────────────────
  // TEST 1: Ambient message → COMMUNICATION_OBSERVED only (no dialogue bridge)
  // ────────────────────────────────────────────────────────────────────────
  console.log('-- Boundary 1: Sensory Filtering --');
  await test('Ambient channel message emits COMMUNICATION_OBSERVED, NOT DIALOGUE_USER_OBSERVED', async () => {
    const { eventBus, mockBoltApp } = await createEnvironment();

    let commObserved = false;
    let dialogueObserved = false;
    eventBus.on(EventTypes.COMMUNICATION_OBSERVED, () => { commObserved = true; });
    eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, () => { dialogueObserved = true; });

    mockBoltApp.simulateIncomingMessage(makeSlackEvent({
      text: 'Good morning team!'
    }));

    await wait(30);
    assert(commObserved, 'Expected COMMUNICATION_OBSERVED to be emitted');
    assert(!dialogueObserved, 'Expected DIALOGUE_USER_OBSERVED NOT to be emitted for ambient message');
  });

  await test('Bot messages are filtered out — COMMUNICATION_OBSERVED not emitted', async () => {
    const { eventBus, mockBoltApp } = await createEnvironment();
    let commObserved = false;
    eventBus.on(EventTypes.COMMUNICATION_OBSERVED, () => { commObserved = true; });

    mockBoltApp.simulateIncomingMessage(makeSlackEvent({
      text: 'I am another bot', bot_id: 'B_OTHER_BOT'
    }));

    await wait(30);
    assert(!commObserved, 'Expected bot messages to be silently filtered');
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 2: @mention → bridges to DialogueEngine WITH responseContext
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n-- Boundary 2: Mention Routing & responseContext Injection --');
  await test('@mention bridges to DIALOGUE_USER_OBSERVED with _responseContext', async () => {
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
    assert(observedPayload !== null, 'Expected DIALOGUE_USER_OBSERVED to fire');
    assert(
      observedPayload.message === 'what is the current balance?',
      `Expected mention stripped from message, got: "${observedPayload.message}"`
    );
    assert(observedPayload._responseContext?.platform === 'slack', 'Expected _responseContext.platform = slack');
    assert(observedPayload._responseContext?.channelId === 'C_FINANCE', 'Expected _responseContext.channelId = C_FINANCE');
    assert(observedPayload._responseContext?.threadRef === '1720001234.000', 'Expected _responseContext.threadRef = ts');
  });

  await test('DM (channel starts with D) bridges to DIALOGUE_USER_OBSERVED', async () => {
    const { eventBus, mockBoltApp } = await createEnvironment();
    let dialogueFired = false;
    let observedContext: any = null;
    eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, (event: StandardEvent) => {
      dialogueFired = true;
      observedContext = event.payload._responseContext;
    });

    mockBoltApp.simulateIncomingMessage(makeSlackEvent({
      channel: 'D_DM_CHANNEL',   // DM channel
      text: 'hello sera'
    }));

    await wait(30);
    assert(dialogueFired, 'Expected DM to bridge to DIALOGUE_USER_OBSERVED');
    assert(observedContext?.platform === 'slack', 'Expected platform=slack in responseContext');
    assert(observedContext?.channelId === 'D_DM_CHANNEL', 'Expected DM channelId in responseContext');
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 3: _responseContext propagates through → DIALOGUE_AGENT_SPEAK
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n-- Boundary 3: responseContext Propagation (DialogueEngine bypass) --');
  await test('DIALOGUE_AGENT_SPEAK includes responseContext when observation had _responseContext', async () => {
    // We test CommunicationBridge + DialogueEngine integration by directly
    // simulating what SlackAdapter emits → check what CommunicationBridge receives

    const { eventBus, mockBoltApp } = await createEnvironment();

    // Listen for what actually goes to the Slack API (via CommunicationBridge → SlackAdapter)
    let messageRoutedToSlack: any = null;

    // Simulate DialogueEngine emitting DIALOGUE_AGENT_SPEAK with responseContext
    // (This is what DialogueEngine now does after our fix)
    const speakEvent: StandardEvent = {
      id: 'evt-speak-1',
      type: EventTypes.DIALOGUE_AGENT_SPEAK,
      source: 'DialogueEngine',
      timestamp: Date.now(),
      payload: {
        text: 'Your balance is 100 USDC.',
        responseContext: {
          platform: 'slack',
          channelId: 'C_FINANCE',
          threadRef: '1720001234.000'
        }
      }
    };

    eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, speakEvent);
    await wait(30);

    // CommunicationBridge should have routed to SlackAdapter → mockBoltApp.client.chat.postMessage
    assert(mockBoltApp.sentMessages.length === 1, `Expected 1 message sent to Slack, got ${mockBoltApp.sentMessages.length}`);
    assert(mockBoltApp.sentMessages[0].channel === 'C_FINANCE', 'Expected message sent to C_FINANCE');
    assert(mockBoltApp.sentMessages[0].text === 'Your balance is 100 USDC.', 'Expected correct message text');
    assert(mockBoltApp.sentMessages[0].thread_ts === '1720001234.000', 'Expected correct thread_ts for reply');
  });

  await test('DIALOGUE_AGENT_SPEAK WITHOUT responseContext does NOT go to Slack API', async () => {
    const { eventBus, mockBoltApp } = await createEnvironment();

    // Simulate normal Socket.io-originating reply (no responseContext)
    const speakEvent: StandardEvent = {
      id: 'evt-speak-2',
      type: EventTypes.DIALOGUE_AGENT_SPEAK,
      source: 'DialogueEngine',
      timestamp: Date.now(),
      payload: {
        text: 'Hello from web UI.',
        // No responseContext
      }
    };

    eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, speakEvent);
    await wait(30);

    assert(mockBoltApp.sentMessages.length === 0, `Expected 0 Slack messages for UI reply, got ${mockBoltApp.sentMessages.length}`);
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 4: SEND_MESSAGE tool execution → CommunicationBridge → SlackAdapter
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n-- Boundary 4: Tool Execution (DOMAIN_ACTION_DISPATCHED) --');
  await test('SEND_MESSAGE action dispatched → routes to Slack API → result emitted', async () => {
    const { eventBus, mockBoltApp } = await createEnvironment();

    let resultPayload: any = null;
    eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, (event: StandardEvent) => {
      if (event.correlationId === 'req-comm-001') {
        resultPayload = event.payload;
      }
    });

    const actionEvent: StandardEvent = {
      id: 'evt-action-1',
      type: EventTypes.DOMAIN_ACTION_DISPATCHED,
      source: 'ExecutionDispatcher',
      timestamp: Date.now(),
      payload: {
        actionType: 'SEND_MESSAGE',
        actionPayload: {
          platform: 'slack',
          channelId: 'C_ANNOUNCEMENTS',
          text: 'SERA is now operational.'
        },
        context: { triggerId: 'req-comm-001' }
      }
    };

    eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, actionEvent);
    await wait(60);

    assert(mockBoltApp.sentMessages.length === 1, `Expected 1 message sent to Slack`);
    assert(mockBoltApp.sentMessages[0].channel === 'C_ANNOUNCEMENTS', 'Expected correct channel');
    assert(mockBoltApp.sentMessages[0].text === 'SERA is now operational.', 'Expected correct text');
    assert(resultPayload !== null, 'Expected DOMAIN_GOAL_RESULT to be emitted');
    assert(resultPayload.success === true, 'Expected success=true');
    assert(resultPayload.data?.platformMessageId?.startsWith('mock-ts-'), 'Expected platformMessageId from mock');
  });

  await test('SEND_MESSAGE for unknown platform emits failure result', async () => {
    const { eventBus } = await createEnvironment();

    let resultPayload: any = null;
    eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, (event: StandardEvent) => {
      if (event.correlationId === 'req-comm-002') {
        resultPayload = event.payload;
      }
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

    assert(resultPayload !== null, 'Expected DOMAIN_GOAL_RESULT');
    assert(resultPayload.success === false, 'Expected failure for unregistered platform');
    assert(resultPayload.errorMessage?.includes('discord'), 'Expected error to mention platform name');
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 5: Epistemic pathway — fact in channel → governed memory
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n-- Boundary 5: Epistemic (Observation → Belief) --');
  await test('Factual statement in channel flows to MemoryIngress → MemoryStore as PENDING belief', async () => {
    const { eventBus, memoryStore, mockBoltApp } = await createEnvironment();

    mockBoltApp.simulateIncomingMessage(makeSlackEvent({
      text: 'Our server cost is $800 per month'
    }));

    await wait(50);

    const semanticBeliefs = memoryStore.getBeliefsByCategory('SEMANTIC');
    const found = semanticBeliefs.find((b: any) =>
      typeof b.content === 'string' && b.content.includes('$800')
    );
    assert(found !== undefined, 'Expected memory store to contain belief about server cost');
    // MemoryStatus.PENDING means unverified — policy engine held it pending verification
    const status = (found as any).status;
    assert(
      status === MemoryStatus.PENDING || status === 'PENDING',
      `Expected PENDING status (unverified claim), got: ${status}`
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 6: Core independence — non-Slack action types not intercepted
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n-- Boundary 6: Core Independence (no leak) --');
  await test('Non-communication DOMAIN_ACTION_DISPATCHED is silently ignored by CommunicationBridge', async () => {
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

    assert(mockBoltApp.sentMessages.length === 0, 'Expected CommunicationBridge to NOT intercept TRANSFER_FUNDS');
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n==============================================================');
  console.log(`  RESULTS: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`  FAILED:  ${failed} test(s)`);
    process.exitCode = 1;
  } else {
    console.log('  STATUS:  ALL BOUNDARIES VERIFIED ✅');
    console.log('  READY:   Proceed to Slack Bolt Socket Mode wiring.');
  }
  console.log('==============================================================\n');
}

runTests().catch(err => {
  console.error('Unexpected error during validation:', err);
  process.exitCode = 1;
});
