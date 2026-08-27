import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpApiKeyStore } from '../src/mcp/McpApiKeyStore';
import { SeraMcpServer, SeraMcpDependencies } from '../src/mcp/SeraMcpServer';
import { EventEmitter } from 'events';
import { EventTypes } from '../src/core/events/types';
import { SubscriptionService } from '../src/server/billing/SubscriptionService';
import { SubscriptionLedger } from '../src/server/billing/SubscriptionLedger';

// ── McpApiKeyStore Tests ──────────────────────────────────────────────────────

describe('McpApiKeyStore', () => {
  let store: McpApiKeyStore;

  beforeEach(() => {
    store = new McpApiKeyStore();
  });

  it('generates a key with the sk-sera- prefix and resolves it to the correct user', () => {
    const key = store.generateKey('user-123');
    expect(key).toMatch(/^sk-sera-[a-f0-9]{32}$/);
    expect(store.resolveUser(key)).toBe('user-123');
  });

  it('returns null for an unknown key', () => {
    expect(store.resolveUser('sk-sera-invalid')).toBeNull();
  });

  it('revokes a key so it can no longer resolve', () => {
    const key = store.generateKey('user-456');
    expect(store.revokeKey(key)).toBe(true);
    expect(store.resolveUser(key)).toBeNull();
  });

  it('lists keys for a user with masked display', () => {
    const key1 = store.generateKey('user-789');
    const key2 = store.generateKey('user-789');
    const keys = store.listKeys('user-789');
    expect(keys).toHaveLength(2);
    // Format is: sk-sera- (8) + 2 chars = 10 chars, then ..., then 4 chars
    expect(keys[0].masked).toMatch(/^sk-sera-[a-f0-9]{2}\.\.\.[a-f0-9]{4}$/);
    expect(keys[0].key).toBe(key1);
  });

  it('revokeAllForUser clears all keys for a user', () => {
    store.generateKey('user-clear');
    store.generateKey('user-clear');
    store.generateKey('user-other');
    expect(store.revokeAllForUser('user-clear')).toBe(2);
    expect(store.listKeys('user-clear')).toHaveLength(0);
    // Other user's keys remain
    expect(store.listKeys('user-other')).toHaveLength(1);
  });
});

// ── SeraMcpServer Tests ───────────────────────────────────────────────────────

describe('SeraMcpServer', () => {
  let apiKeyStore: McpApiKeyStore;
  let subscriptionLedger: SubscriptionLedger;
  let subscriptionService: SubscriptionService;
  let mcpServer: SeraMcpServer;
  let mockEventBus: EventEmitter;
  let mockInstance: any;

  beforeEach(() => {
    apiKeyStore = new McpApiKeyStore();
    subscriptionLedger = new SubscriptionLedger();
    subscriptionService = new SubscriptionService(subscriptionLedger);
    mockEventBus = new EventEmitter();

    // Create a mock SeraAgentInstance with the minimum properties needed
    mockInstance = {
      eventBus: mockEventBus,
      worldStateService: {
        getWalletState: () => ({
          address: '0xTestAddress',
          network: 'Base',
          vaultBalance: '1000.00',
          balance: '500.00',
          updatedAt: Date.now(),
        }),
      },
      memoryStore: {
        getAllBeliefs: () => [
          { key: 'user.preference.language', value: 'English', status: 'ACTIVE' },
          { key: 'user.preference.theme', value: 'dark', status: 'ACTIVE' },
        ],
      },
      chatHistoryStore: {
        appendUiMessage: vi.fn(),
      },
    };

    const deps: SeraMcpDependencies = {
      apiKeyStore,
      resolveInstance: () => mockInstance,
      getSubscriptionService: () => subscriptionService,
    };

    mcpServer = new SeraMcpServer(deps);
  });

  it('returns wallet balance via sera_wallet_balance', async () => {
    const userId = 'test-user';
    apiKeyStore.generateKey(userId);

    const result = await mcpServer.handleToolCallDirect('sera_wallet_balance', {}, userId, mockInstance);

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('0xTestAddress');
    expect(result.content[0].text).toContain('1000.00');
    expect(result.content[0].text).toContain('500.00');
  });

  it('returns memory beliefs via sera_memory_read', async () => {
    const userId = 'test-user';
    apiKeyStore.generateKey(userId);

    const result = await mcpServer.handleToolCallDirect('sera_memory_read', {}, userId, mockInstance);

    expect(result.content[0].text).toContain('user.preference.language');
    expect(result.content[0].text).toContain('English');
    expect(result.content[0].text).toContain('2 active beliefs');
  });

  it('returns billing status via sera_billing_status', async () => {
    const userId = 'billing-user';
    apiKeyStore.generateKey(userId);

    // Top up so user has credits
    subscriptionService.recordTopUp(userId, 5);

    const result = await mcpServer.handleToolCallDirect('sera_billing_status', {}, userId, mockInstance);

    expect(result.content[0].text).toContain('Agent Credits');
    expect(result.content[0].text).toContain('Active');
  });

  it('creates a transfer proposal via sera_wallet_transfer', async () => {
    const userId = 'transfer-user';
    apiKeyStore.generateKey(userId);

    let emittedEvent: any = null;
    mockEventBus.on(EventTypes.SYSTEM_PROPOSE_GOAL, (event: any) => {
      emittedEvent = event;
    });

    const result = await mcpServer.handleToolCallDirect(
      'sera_wallet_transfer',
      { to: '0xRecipient', amount: '10', asset: 'USDC', reason: 'Payment' },
      userId,
      mockInstance
    );

    expect(result.content[0].text).toContain('Transfer proposal created');
    expect(result.content[0].text).toContain('0xRecipient');
    expect(result.content[0].text).toContain('10 USDC');
    expect(emittedEvent).not.toBeNull();
    expect(emittedEvent.payload.intent).toBe('TRANSFER_FUNDS');
  });

  it('handles sera_chat by emitting USER_OBSERVED and capturing AGENT_SPEAK', async () => {
    const userId = 'chat-user';
    apiKeyStore.generateKey(userId);
    subscriptionService.recordTopUp(userId, 1);

    // Simulate the DialogueEngine responding after a short delay
    mockEventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, () => {
      setTimeout(() => {
        mockEventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
          payload: { text: 'Hello from Sera!' }
        });
      }, 50);
    });

    const result = await mcpServer.handleToolCallDirect('sera_chat', { message: 'Hi Sera' }, userId, mockInstance);

    expect(result.content[0].text).toBe('Hello from Sera!');
    expect(mockInstance.chatHistoryStore.appendUiMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'Hi Sera' })
    );
  });

  it('returns depleted message when credits are zero for sera_chat', async () => {
    const userId = 'no-credits-user';
    apiKeyStore.generateKey(userId);
    // No top-up — credits are 0

    const result = await mcpServer.handleToolCallDirect('sera_chat', { message: 'Hi' }, userId, mockInstance);

    expect(result.content[0].text).toContain('depleted');
  });

  it('returns error for unknown tool', async () => {
    const result = await mcpServer.handleToolCallDirect('sera_unknown', {}, 'user', mockInstance);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  it('returns "no wallet" when wallet state is empty', async () => {
    const emptyWalletInstance = {
      ...mockInstance,
      worldStateService: { getWalletState: () => null },
    };

    const result = await mcpServer.handleToolCallDirect('sera_wallet_balance', {}, 'user', emptyWalletInstance);
    expect(result.content[0].text).toContain('No wallet');
  });
});
