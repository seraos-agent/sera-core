import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpApiKeyStore } from '../src/mcp/McpApiKeyStore';
import { SeraMcpServer, SeraMcpDependencies, SERA_MCP_TOOLS } from '../src/mcp/SeraMcpServer';
import { EventEmitter } from 'events';
import { EventTypes } from '../src/core/events/types';
import { SubscriptionService } from '../src/server/billing/SubscriptionService';
import { SubscriptionLedger } from '../src/server/billing/SubscriptionLedger';
import { ProposalManager } from '../src/core/governance/ProposalManager';

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
  let mockProposalManager: ProposalManager;
  let mockInstance: any;

  beforeEach(() => {
    apiKeyStore = new McpApiKeyStore();
    subscriptionLedger = new SubscriptionLedger();
    subscriptionService = new SubscriptionService(subscriptionLedger);
    mockEventBus = new EventEmitter();
    mockProposalManager = new ProposalManager(mockEventBus);

    // Create a mock SeraAgentInstance with the minimum properties needed
    mockInstance = {
      eventBus: mockEventBus,
      proposalManager: mockProposalManager,
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

  it('exposes all 17 MCP tools including proposal approval tools', () => {
    const toolNames = SERA_MCP_TOOLS.map(t => t.name);
    expect(toolNames).toContain('sera_chat');
    expect(toolNames).toContain('sera_wallet_balance');
    expect(toolNames).toContain('sera_wallet_transfer');
    expect(toolNames).toContain('sera_spot_market_data');
    expect(toolNames).toContain('sera_spot_trade');
    expect(toolNames).toContain('sera_gdrive_write');
    expect(toolNames).toContain('sera_gdrive_append');
    expect(toolNames).toContain('sera_gdrive_delete');
    expect(toolNames).toContain('sera_gdrive_read');
    expect(toolNames).toContain('sera_gdrive_list');
    expect(toolNames).toContain('sera_gdrive_create_sheet');
    expect(toolNames).toContain('sera_threads_publish');
    expect(toolNames).toContain('sera_proposal_approve');
    expect(toolNames).toContain('sera_proposal_reject');
    expect(toolNames).toContain('sera_proposal_list');
    expect(SERA_MCP_TOOLS.length).toBe(19);
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

  it('creates a transfer proposal via sera_wallet_transfer with structured proposal ID', async () => {
    const userId = 'transfer-user';
    apiKeyStore.generateKey(userId);

    const result = await mcpServer.handleToolCallDirect(
      'sera_wallet_transfer',
      { to: '0xRecipient', amount: '10', asset: 'USDC', reason: 'Payment' },
      userId,
      mockInstance
    );

    expect(result.content[0].text).toContain('Transfer Proposal Created');
    expect(result.content[0].text).toContain('0xRecipient');
    expect(result.content[0].text).toContain('10 USDC');
    expect(result.content[0].text).toContain('sera_proposal_approve');

    const pending = mockProposalManager.listPendingProposals();
    expect(pending.length).toBe(1);
    expect(pending[0].intent).toBe('TRANSFER_FUNDS');
  });

  it('lists active proposals via sera_proposal_list', async () => {
    const userId = 'test-user';
    apiKeyStore.generateKey(userId);

    // Initial empty
    const emptyResult = await mcpServer.handleToolCallDirect('sera_proposal_list', {}, userId, mockInstance);
    expect(emptyResult.content[0].text).toContain('No active proposals');

    // Create proposal
    mockProposalManager.createProposal({
      intent: 'TRANSFER_FUNDS',
      parameters: { to: '0x123', amount: 25, asset: 'USDC' },
      userMessage: 'Test transfer'
    });

    const listResult = await mcpServer.handleToolCallDirect('sera_proposal_list', {}, userId, mockInstance);
    expect(listResult.content[0].text).toContain('Pending Governance Proposals (1)');
    expect(listResult.content[0].text).toContain('TRANSFER_FUNDS');
  });

  it('approves and executes a proposal via sera_proposal_approve', async () => {
    const userId = 'test-user';
    apiKeyStore.generateKey(userId);

    const proposalId = mockProposalManager.createProposal({
      intent: 'TRANSFER_FUNDS',
      parameters: { recipientAddress: '0xTarget', amount: 50, asset: 'USDC' },
      userMessage: 'Send 50 USDC'
    });

    // Simulate GoalBridge execution returning DOMAIN_GOAL_RESULT
    mockEventBus.on(EventTypes.DOMAIN_GOAL_SPAWNED, (event: any) => {
      setTimeout(() => {
        mockEventBus.emit(EventTypes.DOMAIN_GOAL_RESULT, {
          payload: {
            requestId: event.payload.requestId,
            success: true,
            data: {
              txHash: '0xabcdef1234567890',
              recipient: '0xTarget',
              amount: 50,
              asset: 'USDC',
              status: 'CONFIRMED'
            }
          }
        });
      }, 50);
    });

    const result = await mcpServer.handleToolCallDirect(
      'sera_proposal_approve',
      { proposalId },
      userId,
      mockInstance
    );

    expect(result.content[0].text).toContain('Approved and Executed Successfully');
    expect(result.content[0].text).toContain('0xabcdef1234567890');
    expect(result.content[0].text).toContain('0xTarget');

    // Proposal should be cleared
    expect(mockProposalManager.getProposal(proposalId)).toBeUndefined();
  });

  it('rejects a proposal via sera_proposal_reject', async () => {
    const userId = 'test-user';
    apiKeyStore.generateKey(userId);

    const proposalId = mockProposalManager.createProposal({
      intent: 'HL_SPOT_ORDER',
      parameters: { coin: 'HYPE', side: 'buy', amount: 100 },
      userMessage: 'Buy HYPE'
    });

    const result = await mcpServer.handleToolCallDirect(
      'sera_proposal_reject',
      { proposalId, reason: 'Changed my mind' },
      userId,
      mockInstance
    );

    expect(result.content[0].text).toContain('Proposal Cancelled');
    expect(result.content[0].text).toContain('Changed my mind');

    // Proposal should be removed
    expect(mockProposalManager.getProposal(proposalId)).toBeUndefined();
  });

  it('returns error when approving non-existent proposal ID', async () => {
    const userId = 'test-user';
    apiKeyStore.generateKey(userId);

    const result = await mcpServer.handleToolCallDirect(
      'sera_proposal_approve',
      { proposalId: 'prop-invalid-999' },
      userId,
      mockInstance
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('was not found or has already been processed');
  });

  it('handles sera_chat by emitting USER_OBSERVED and capturing AGENT_SPEAK', async () => {
    const userId = 'chat-user';
    apiKeyStore.generateKey(userId);
    subscriptionService.recordTopUp(userId, 1);

    let observedEvent: any;
    // Simulate the DialogueEngine responding after a short delay
    mockEventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, (event: any) => {
      observedEvent = event;
      setTimeout(() => {
        mockEventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
          payload: { text: 'Hello from Sera!' }
        });
      }, 50);
    });

    const result = await mcpServer.handleToolCallDirect('sera_chat', { message: 'Hi Sera' }, userId, mockInstance);

    expect(result.content[0].text).toBe('Hello from Sera!');
    expect(observedEvent.payload._responseContext).toEqual({
      platform: 'mcp',
      channelId: 'mcp:chat-user'
    });
    expect(mockInstance.chatHistoryStore.appendUiMessage).not.toHaveBeenCalled();
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

