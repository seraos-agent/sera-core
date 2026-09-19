import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { ReActExecutor } from '../src/capabilities/dialogue/cognitive/ReActExecutor';
import { DialogueEngine } from '../src/capabilities/dialogue/DialogueEngine';
import { EventTypes } from '../src/core/events/types';

describe('Mid-Flight Task Steering & Execution Concurrency', () => {
  describe('ReActExecutor Abort & Steering Isolation', () => {
    let mockOrchestrator: any;
    let mockToolHandler: any;
    let executor: ReActExecutor;

    beforeEach(() => {
      mockOrchestrator = {
        generate: vi.fn()
      };
      mockToolHandler = {
        executeSingleTool: vi.fn()
      };
      executor = new ReActExecutor(mockOrchestrator, mockToolHandler);
    });

    it('returns aborted: true and empty finalAnswer on aborted signal without emitting false upstream latency', async () => {
      const abortController = new AbortController();
      abortController.abort(); // Aborted upfront

      const emitEvent = vi.fn();
      const result = await executor.execute({
        messages: [{ role: 'user', content: 'Audit threads analytics' }],
        rawTools: [],
        turnStartTime: Date.now(),
        hasImages: false,
        event: { id: 'evt-1', type: EventTypes.DIALOGUE_USER_OBSERVED, source: 'test', payload: {}, timestamp: Date.now() },
        userMessage: 'Audit threads analytics',
        sessionId: 'test-session',
        capabilityCatalog: {},
        activeAbortSignal: abortController.signal,
        emitEvent,
        spawnGoalAndAwaitResult: vi.fn(),
        buildWorkingMemory: vi.fn().mockResolvedValue([])
      });

      expect(result.aborted).toBe(true);
      expect(result.finalAnswer).toBe('');
      expect(result.finalAnswer).not.toContain('upstream latency');
      expect(result.finalAnswer).not.toContain('Cognitive service encountered an upstream latency');
    });

    it('does not emit upstream latency error when aborted during LLM generation catch', async () => {
      const abortController = new AbortController();

      mockOrchestrator.generate.mockImplementation(async () => {
        abortController.abort();
        const err: any = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      });

      const emitEvent = vi.fn();
      const result = await executor.execute({
        messages: [{ role: 'user', content: 'Generate report' }],
        rawTools: [],
        turnStartTime: Date.now(),
        hasImages: false,
        event: { id: 'evt-1', type: EventTypes.DIALOGUE_USER_OBSERVED, source: 'test', payload: {}, timestamp: Date.now() },
        userMessage: 'Generate report',
        sessionId: 'test-session',
        capabilityCatalog: {},
        activeAbortSignal: abortController.signal,
        emitEvent,
        spawnGoalAndAwaitResult: vi.fn(),
        buildWorkingMemory: vi.fn().mockResolvedValue([])
      });

      expect(result.aborted).toBe(true);
      expect(result.finalAnswer).toBe('');
      expect(result.finalAnswer).not.toContain('upstream latency');
    });

    it('notifies onExecutionStateChange when operational tools are detected and executes mid-flight steering', async () => {
      const steeringQueue: Array<{ message: string; timestamp: number }> = [];
      const onExecutionStateChange = vi.fn();
      const emitEvent = vi.fn();
      let generateCallCount = 0;

      mockOrchestrator.generate.mockImplementation(async (profile: any, msgs: any[]) => {
        generateCallCount++;
        if (generateCallCount === 1) {
          // Step 1: Model decides to call an operational tool
          return {
            toolCalls: [
              {
                id: 'call_1',
                name: 'GDRIVE_CREATE_SPREADSHEET',
                arguments: { title: 'Threads Audit' }
              }
            ],
            text: 'Membuka spreadsheet...'
          };
        }

        // Step 2: Synthesis after tool execution
        return {
          toolCalls: [],
          text: 'Spreadsheet berhasil dibuat dengan kolom engagement rate tambahan.'
        };
      });

      mockToolHandler.executeSingleTool.mockImplementation(async () => {
        // While the tool is running, user injects a mid-flight instruction
        steeringQueue.push({
          message: 'tolong tambahin kolom engagement rate juga ya',
          timestamp: Date.now()
        });

        return {
          isProposal: false,
          output: { success: true, message: 'Spreadsheet created' }
        };
      });

      const result = await executor.execute({
        messages: [{ role: 'user', content: 'Buatkan spreadsheet analisa threads' }],
        rawTools: [{ name: 'GDRIVE_CREATE_SPREADSHEET' }] as any[],
        turnStartTime: Date.now(),
        hasImages: false,
        event: { id: 'evt-1', type: EventTypes.DIALOGUE_USER_OBSERVED, source: 'test', payload: {}, timestamp: Date.now() },
        userMessage: 'Buatkan spreadsheet analisa threads',
        sessionId: 'test-session',
        capabilityCatalog: {},
        emitEvent,
        spawnGoalAndAwaitResult: vi.fn(),
        buildWorkingMemory: vi.fn().mockResolvedValue([]),
        steeringQueue,
        onExecutionStateChange
      });

      // 1. Tool execution state notification triggered
      expect(onExecutionStateChange).toHaveBeenCalledWith({ isExecutingTools: true });

      // 2. Steering queue was consumed and injected
      expect(steeringQueue.length).toBe(0);

      // 3. Cognitive steps record the plan adjustment
      expect(result.cognitiveSteps.some(s => s.title === 'Plan Adjusted')).toBe(true);

      // 4. Final answer incorporates the result
      expect(result.finalAnswer).toContain('Spreadsheet berhasil dibuat dengan kolom engagement rate tambahan.');
    });
  });

  describe('DialogueEngine Mid-Flight Steering & Cancellation Flow', () => {
    let eventBus: EventEmitter;
    let mockWorldState: any;
    let mockCatalog: any;
    let mockMemoryStore: any;
    let mockChatHistory: any;
    let mockOrchestrator: any;
    let engine: DialogueEngine;

    beforeEach(() => {
      eventBus = new EventEmitter();
      mockWorldState = {
        getWalletState: vi.fn().mockReturnValue({ address: '0x123' }),
        getTemporalState: vi.fn().mockReturnValue({}),
        getSpatialState: vi.fn().mockReturnValue({}),
        getConsentedUsers: vi.fn().mockReturnValue(new Set()),
        setUserPreferredName: vi.fn()
      };
      mockCatalog = {
        getAllCapabilities: vi.fn().mockReturnValue([]),
        allConnectorSummaries: vi.fn().mockReturnValue([])
      };
      mockMemoryStore = {
        getBeliefs: vi.fn().mockReturnValue([]),
        getBeliefsByCategory: vi.fn().mockReturnValue([]),
        storeBelief: vi.fn(),
        getAllEntries: vi.fn().mockReturnValue([]),
        getRecentUserFacts: vi.fn().mockReturnValue([])
      };
      mockChatHistory = {
        getRecentHistory: vi.fn().mockReturnValue([]),
        getAllPlatformMessages: vi.fn().mockReturnValue({}),
        appendPlatformTurn: vi.fn(),
        ensureLoaded: vi.fn().mockResolvedValue(undefined)
      };
      mockOrchestrator = {
        generate: vi.fn().mockResolvedValue({ text: 'Halo! Ada yang bisa dibantu?' })
      };

      engine = new DialogueEngine(
        eventBus,
        mockWorldState,
        mockCatalog,
        mockMemoryStore,
        mockChatHistory,
        mockOrchestrator,
        'test-session',
        undefined,
        { persistLocally: false }
      );
    });

    it('intercepts explicit cancellation ("batal", "stop") and aborts active task session with confirmation', async () => {
      const emittedEvents: any[] = [];
      eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, (e) => emittedEvents.push(e));

      // Simulate an active task running tools
      const abortController = new AbortController();
      (engine as any).activeTaskSession = {
        abortController,
        responseContext: { platform: 'whatsapp', channelId: '628123456789' },
        userMessage: 'Tolong buatkan spreadsheet',
        steeringQueue: [],
        isExecutingTools: true,
        startTime: Date.now()
      };

      // Send explicit cancellation
      await engine.onUserObservation({
        id: 'evt-cancel',
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'WhatsAppAdapter',
        payload: {
          message: 'batal',
          responseContext: { platform: 'whatsapp', channelId: '628123456789' }
        },
        timestamp: Date.now()
      });

      // Task session should be aborted and reset
      expect(abortController.signal.aborted).toBe(true);
      expect((engine as any).activeTaskSession).toBeNull();

      // Clean polite confirmation emitted
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].payload.text).toContain('Baik, pengerjaan tugas telah dihentikan');
    });

    it('intercepts mid-flight steering during tool execution and enqueues without aborting', async () => {
      const emittedEvents: any[] = [];
      eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, (e) => emittedEvents.push(e));

      // Simulate an active task actively executing tools
      const abortController = new AbortController();
      const steeringQueue: any[] = [];
      (engine as any).activeTaskSession = {
        abortController,
        responseContext: { platform: 'whatsapp', channelId: '628123456789' },
        userMessage: 'Tolong buatkan spreadsheet',
        steeringQueue,
        isExecutingTools: true,
        startTime: Date.now()
      };

      // User sends a mid-flight update
      await engine.onUserObservation({
        id: 'evt-steering',
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'WhatsAppAdapter',
        payload: {
          message: 'tambahin kolom views juga ya',
          responseContext: { platform: 'whatsapp', channelId: '628123456789' }
        },
        timestamp: Date.now()
      });

      // Active task is NOT aborted
      expect(abortController.signal.aborted).toBe(false);

      // Item is queued in steeringQueue
      expect(steeringQueue.length).toBe(1);
      expect(steeringQueue[0].message).toBe('tambahin kolom views juga ya');

      // Zero-latency interim acknowledgment emitted
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].payload.isInterim).toBe(true);
      expect(emittedEvents[0].payload.text).toContain('Siap, aku catat dan langsung sesuaikan');
    });

    it('silently supersedes early turn if user sends a follow-up before tools begin execution', async () => {
      const initialAbortController = new AbortController();
      (engine as any).activeTaskSession = {
        abortController: initialAbortController,
        responseContext: { platform: 'whatsapp', channelId: '628123456789' },
        userMessage: 'Halo',
        steeringQueue: [],
        isExecutingTools: false, // Tools have NOT started yet
        startTime: Date.now()
      };

      // Second message arrives immediately
      await engine.onUserObservation({
        id: 'evt-2',
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'WhatsAppAdapter',
        payload: {
          message: 'Tolong buatkan analisa Threads',
          responseContext: { platform: 'whatsapp', channelId: '628123456789' }
        },
        timestamp: Date.now()
      });

      // Initial task was aborted cleanly
      expect(initialAbortController.signal.aborted).toBe(true);
    });

    it('suppresses passive acknowledgment when task is in progress without disrupting task session', async () => {
      const emittedEvents: any[] = [];
      eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, (e) => emittedEvents.push(e));

      const abortController = new AbortController();
      (engine as any).activeTaskSession = {
        abortController,
        responseContext: { platform: 'whatsapp', channelId: '628123456789' },
        userMessage: 'Tolong buatkan spreadsheet',
        steeringQueue: [],
        isExecutingTools: true,
        startTime: Date.now()
      };

      // User sends passive ack
      await engine.onUserObservation({
        id: 'evt-ack',
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'WhatsAppAdapter',
        payload: {
          message: 'ok',
          responseContext: { platform: 'whatsapp', channelId: '628123456789' }
        },
        timestamp: Date.now()
      });

      // No bot reply emitted (suppressed)
      expect(emittedEvents.length).toBe(0);

      // Task is intact
      expect(abortController.signal.aborted).toBe(false);
      expect((engine as any).activeTaskSession).not.toBeNull();
    });
  });
});
