import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { BraveSearchCapability } from '../src/capabilities/search/BraveSearchCapability';
import { CapabilityCatalog } from '../src/core/capabilities/CapabilityCatalog';
import { ToolExecutionHandler } from '../src/capabilities/dialogue/ToolExecutionHandler';
import { GoalBridge } from '../src/runtime/GoalBridge';
import { MemoryIngress } from '../src/core/memory/MemoryIngress';
import { WorkingMemory } from '../src/memory/WorkingMemory';
import { EventTypes, StandardEvent } from '../src/core/events/types';
import { MemoryProposal } from '../src/core/memory/MemoryProposal';
import { ThreadsCapability } from '../src/capabilities/threads/ThreadsCapability';
import { SocialMediaAgent } from '../src/capabilities/agents/SocialMediaAgent';

describe('Tool Standardization and Memory Proposal Integrity', () => {
  const originalApiKey = process.env.BRAVE_API_KEY;

  beforeEach(() => {
    process.env.BRAVE_API_KEY = 'mock-brave-key';
  });

  afterEach(() => {
    process.env.BRAVE_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it('BraveSearchCapability exposes WEB_SEARCH and executes with multiple aliases', async () => {
    const searchCap = new BraveSearchCapability();
    const tools = searchCap.getTools();
    expect(tools.some(t => t.name === 'WEB_SEARCH')).toBe(true);

    // Mock global fetch for Brave API
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('search.brave.com')) {
        return {
          ok: true,
          json: async () => ({
            web: {
              results: [
                { title: 'Sera OS', url: 'https://seraos.xyz', description: 'Autonomous agent OS' }
              ]
            }
          })
        } as any;
      }
      return originalFetch(input, init);
    });

    // Test execution with WEB_SEARCH
    const res1 = await searchCap.executeTool('WEB_SEARCH', { query: 'Sera OS' });
    expect(res1.query).toBe('Sera OS');
    expect(res1.count).toBe(1);
    expect(res1.results[0].title).toBe('Sera OS');

    // Test alias: search
    const res2 = await searchCap.executeTool('search', { query: 'Sera OS' });
    expect(res2.query).toBe('Sera OS');

    // Test alias: brave_web_search
    const res3 = await searchCap.executeTool('brave_web_search', { query: 'Sera OS' });
    expect(res3.query).toBe('Sera OS');
  });

  it('CapabilityCatalog resolves WEB_SEARCH, search, and brave_web_search to web_search connector', () => {
    const catalog = new CapabilityCatalog();
    catalog.registerConnector({
      id: 'web_search',
      name: 'Web Search',
      category: 'connectors',
      description: 'Search connector',
      riskSummary: 'Web Search Tool',
      alwaysActive: true,
      tools: [
        { name: 'WEB_SEARCH', description: 'Search web', parameters: { type: 'object' } }
      ],
      executeTool: vi.fn()
    });

    expect(catalog.getConnectorForTool('WEB_SEARCH')).toBeDefined();
    expect(catalog.getConnectorForTool('search')).toBeDefined();
    expect(catalog.getConnectorForTool('brave_web_search')).toBeDefined();
  });

  it('ToolExecutionHandler emits StandardEvent for REMEMBER_FACT that MemoryIngress consumes without error', async () => {
    const eventBus = new EventEmitter();
    const workingMemory = new WorkingMemory();
    const memoryIngress = new MemoryIngress(eventBus, workingMemory);

    let emittedEvent: any = null;
    eventBus.on(EventTypes.MEMORY_PROPOSAL_REQUESTED, (evt: StandardEvent<MemoryProposal>) => {
      emittedEvent = evt;
    });

    const handler = new ToolExecutionHandler(
      eventBus,
      {} as any, // ModelOrchestrator
      {} as any, // FeasibilityEvaluator
      {} as any, // ProposalResponseHandler
      {} as any  // DialogueResultNarrator
    );

    const mockEvent: StandardEvent<any> = {
      id: 'test-event-1',
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'test',
      timestamp: Date.now(),
      payload: { message: 'Remember my name is Alice' }
    };

    const result = await handler.executeSingleTool({
      toolCall: { id: 'call_1', name: 'REMEMBER_FACT', arguments: { fact: 'User name is Alice' } },
      toolCallId: 'call_1',
      event: mockEvent,
      userMessage: 'Remember my name is Alice',
      sessionId: 'test-session',
      capabilityCatalog: new CapabilityCatalog(),
      autonomyAgreementStore: {} as any,
      buildWorkingMemory: vi.fn(),
      spawnGoalAndAwaitResult: vi.fn(),
      emitEvent: vi.fn()
    });

    expect(result.output.success).toBe(true);
    expect(emittedEvent).not.toBeNull();
    expect(emittedEvent?.payload).toBeDefined();
    expect(emittedEvent?.payload.key).toBeDefined();
    expect(emittedEvent?.payload.value).toBe('User name is Alice');
  });

  it('GoalBridge handles WEB_SEARCH action and emits success event', async () => {
    const eventBus = new EventEmitter();
    const goalBridge = new GoalBridge(eventBus, 'test-session');

    // Mock fetch specifically for Brave API, allowing other calls like RPC through
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('search.brave.com')) {
        return {
          ok: true,
          json: async () => ({
            web: {
              results: [
                { title: 'Sera OS Docs', url: 'https://docs.seraos.xyz', description: 'Documentation' }
              ]
            }
          })
        } as any;
      }
      return originalFetch(input, init);
    });

    const requestId = 'req-web-search-test';
    const resultPromise = new Promise<{ success: boolean; data: any }>((resolve) => {
      const handler = (evt: any) => {
        if (evt.correlationId === requestId) {
          eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, handler);
          resolve(evt.payload);
        }
      };
      eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, handler);
    });

    eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
      id: 'test-evt-search',
      type: EventTypes.DOMAIN_ACTION_DISPATCHED,
      correlationId: requestId,
      source: 'test',
      timestamp: Date.now(),
      payload: {
        actionType: 'WEB_SEARCH',
        requestId,
        query: 'Sera OS'
      }
    });

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.data.results).toBeDefined();
  });

  it('THREADS_PUBLISH executes directly without proposal card, while SCHEDULE_GOAL requires proposal card', async () => {
    const threadsCap = new ThreadsCapability({} as any);
    const publishTool = threadsCap.getTools().find((t: any) => t.name === 'THREADS_PUBLISH');
    expect(publishTool?.requiresApproval).toBe(false);

    const socialAgent = new SocialMediaAgent();
    const agentPublishTool = socialAgent.getTools().find((t: any) => t.name === 'THREADS_PUBLISH');
    expect(agentPublishTool?.requiresApproval).toBe(false);

    const eventBus = new EventEmitter();
    let proposedGoalEvent: any = null;
    eventBus.on(EventTypes.SYSTEM_PROPOSE_GOAL, (evt) => {
      proposedGoalEvent = evt;
    });

    const catalog = new CapabilityCatalog();
    catalog.registerConnector({
      id: 'threads',
      name: 'Threads',
      category: 'communication',
      description: 'Threads connector',
      riskSummary: 'Publishing',
      alwaysActive: true,
      tools: threadsCap.getTools(),
      executeTool: vi.fn().mockResolvedValue({ success: true, postId: '12345' })
    });

    const handler = new ToolExecutionHandler(
      eventBus,
      { generate: vi.fn().mockResolvedValue({ text: 'Card prepared' }) } as any,
      { evaluate: vi.fn().mockReturnValue({ feasible: true }) } as any,
      {} as any,
      {} as any
    );

    const mockEvent: StandardEvent<any> = {
      id: 'test-evt-threads',
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'test',
      timestamp: Date.now(),
      payload: { message: 'Post this to Threads now' }
    };

    // 1. Direct post: isProposal must be FALSE (no proposal card)
    const directResult = await handler.executeSingleTool({
      toolCall: { id: 'call_threads', name: 'THREADS_PUBLISH', arguments: { text: 'Direct post text' } },
      toolCallId: 'call_threads',
      event: mockEvent,
      userMessage: 'Post this to Threads now',
      sessionId: 'test-session',
      capabilityCatalog: catalog,
      autonomyAgreementStore: {} as any,
      buildWorkingMemory: vi.fn().mockResolvedValue([]),
      spawnGoalAndAwaitResult: vi.fn().mockResolvedValue({ success: true, data: { postId: '12345' } }),
      emitEvent: vi.fn()
    });

    expect(directResult.isProposal).toBe(false);
    expect(proposedGoalEvent).toBeNull(); // No proposal card emitted

    // 2. Scheduled/recurring task: isProposal must be TRUE (generates proposal card)
    const scheduleResult = await handler.executeSingleTool({
      toolCall: {
        id: 'call_sched',
        name: 'SCHEDULE_GOAL',
        arguments: {
          scheduleType: 'cron',
          cronExpression: '0 9 * * *',
          humanIntent: 'Post every day at 9 AM',
          actionIntent: 'DYNAMIC_SCHEDULED_ACTION',
          actionParameters: { taskPrompt: 'Daily AI news' }
        }
      },
      toolCallId: 'call_sched',
      event: mockEvent,
      userMessage: 'Schedule daily post at 9 AM',
      sessionId: 'test-session',
      capabilityCatalog: catalog,
      autonomyAgreementStore: {} as any,
      buildWorkingMemory: vi.fn().mockResolvedValue([]),
      spawnGoalAndAwaitResult: vi.fn(),
      emitEvent: (type: string, payload: any) => eventBus.emit(type, payload)
    });

    expect(scheduleResult.isProposal).toBe(true);
    expect(proposedGoalEvent).not.toBeNull();
    expect(proposedGoalEvent.intent).toBe('SCHEDULE_GOAL');
  });
});
