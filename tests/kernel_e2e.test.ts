import { describe, it, expect, beforeAll } from 'vitest';
import { EventEmitter } from 'events';
import { ConstitutionEngine } from '../src/constitution/ConstitutionEngine';
import { Runtime } from '../src/runtime/Runtime';
import { ExecutionTraceStore } from '../src/core/execution/ExecutionTraceStore';
import { IWorkingMemory } from '../src/core/memory/IWorkingMemory';
import { WorkingMemory } from '../src/memory/WorkingMemory';
import { ChatHistoryStore } from '../src/capabilities/dialogue/ChatHistoryStore';
import { Planner } from '../src/core/planner/Planner';
import { StrategyStore } from '../src/core/strategy/StrategyStore';
import { StrategyEngine } from '../src/core/strategy/StrategyEngine';
import { GoalEngine } from '../src/core/goals/GoalEngine';
import { AttentionEngine } from '../src/core/attention/AttentionEngine';
import { ExperienceBuilder } from '../src/core/memory/ExperienceBuilder';
import { EpisodicSemanticBridge } from '../src/core/memory/EpisodicSemanticBridge';
import { MemoryIngress } from '../src/core/memory/MemoryIngress';
import { Goal } from '../src/core/goals/types';

describe('Kernel E2E Integration', () => {
  let eventBus: EventEmitter;
  let memoryStore: IWorkingMemory;
  let planner: Planner;
  let strategyStore: StrategyStore;
  let strategyEngine: StrategyEngine;
  let goalEngine: GoalEngine;
  let attentionEngine: AttentionEngine;
  let constitutionEngine: ConstitutionEngine;
  let runtime: Runtime;
  let expBuilder: ExperienceBuilder;
  let semanticBridge: EpisodicSemanticBridge;
  let memoryIngress: MemoryIngress;

  const testGoal: Goal = {
    id: 'goal-test-1',
    description: 'Use the mock tool to demonstrate failure',
    priority: 1.0,
    status: 'PENDING',
    stabilityIndex: 1.0,
    createdAt: Date.now(),
    targetState: { toolId: 'failing-tool' }
  };

  let dispatchedTool = '';

  beforeAll(() => {
    eventBus = new EventEmitter();
    memoryStore = new WorkingMemory(eventBus);
    memoryIngress = new MemoryIngress(eventBus, memoryStore);
    planner = new Planner();
    strategyStore = new StrategyStore();
    strategyEngine = new StrategyEngine(strategyStore);
    goalEngine = new GoalEngine();
    attentionEngine = new AttentionEngine(goalEngine, strategyStore);
    constitutionEngine = new ConstitutionEngine();

    runtime = new Runtime(
      constitutionEngine,
      undefined, undefined, undefined,
      new ExecutionTraceStore(eventBus),
      planner, strategyStore, strategyEngine, attentionEngine, goalEngine,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      eventBus, undefined,
      memoryStore,
      new ChatHistoryStore('test-session')
    );

    expBuilder = new ExperienceBuilder(eventBus);
    semanticBridge = new EpisodicSemanticBridge(eventBus, memoryStore as any);

    goalEngine.registerGoal(testGoal);

    eventBus.on('domain.action.dispatched', (event: any) => {
      if (event.payload?.actionPayload?.toolId) {
        dispatchedTool = event.payload.actionPayload.toolId;
      }
      setTimeout(() => {
        eventBus.emit('domain.goal.result', {
          id: `evt-res-${Date.now()}`,
          type: 'domain.goal.result',
          source: 'MockGoalBridge',
          correlationId: event.payload.context.triggerId,
          payload: {
            requestId: event.payload.context.triggerId,
            success: true,
            data: {},
          },
          timestamp: Date.now()
        });
      }, 10);
    });
  });

  it('creates and confirms semantic belief from episodes', async () => {
    for (let i = 0; i < 3; i++) {
      eventBus.emit('system.episode.consolidated', {
        id: `evt-mock-${i}`,
        type: 'system.episode.consolidated',
        source: 'ExperienceBuilder',
        payload: {
          id: `mock-exp-${i}`,
          summary: "The execution of tool 'failing-tool' failed due to a timeout.",
          type: 'GOAL_EXECUTION',
          evidence: [],
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });
    }

    await new Promise(r => setTimeout(r, 100));

    const semanticBeliefs = memoryStore.getBeliefsByCategory('SEMANTIC');
    const failureBelief = semanticBeliefs.find(b => b.content.includes('failing-tool'));

    expect(failureBelief).toBeDefined();
    expect(failureBelief?.epistemicStatus).toBe('CONFIRMED');
  });

  it('planner avoids failing-tool', async () => {
    await runtime.executeCycle(1, testGoal.id);
    await new Promise(r => setTimeout(r, 500));

    expect(dispatchedTool).toBe('mock-read-tool');
  });

  it('execution TraceStore observability tracks timeline and outcome', () => {
    const traceStore = runtime['executionCoordinator']['executionTraceStore'];
    expect(traceStore).toBeDefined();

    const allTraces = traceStore!.getAll();
    expect(allTraces.length).toBeGreaterThan(0);

    const trace = allTraces[0];
    expect(trace.timeline.length).toBeGreaterThanOrEqual(2);
  });

  it('executionReflectionEngine creates adaptive policy', () => {
    const traceStore = runtime['executionCoordinator']['executionTraceStore'];
    for (let i = 0; i < 3; i++) {
      traceStore!.store({
        id: `trace-fragile-${i}`,
        taskId: `task-fragile-${i}`,
        goalId: 'dummy-goal',
        toolCalls: ['fragile-tool'],
        workerAssignments: [],
        intermediateResults: [],
        failures: [],
        costTracking: 0,
        finalOutcome: 'FAILED',
        verificationResult: false,
        settlementStatus: 'NONE',
        timeline: [],
        decisionSnapshots: [],
        intentSnapshot: {},
        plan: {},
        createdAt: Date.now()
      });
    }

    runtime['executionReflectionEngine']?.evaluate();
    
    const adaptations = memoryStore.getBeliefsByCategory('EXECUTION_POLICY_ADAPTATION');
    const fragileAdaptation = adaptations.find(b => b.key === 'adaptation:fragile-tool');
    
    expect(fragileAdaptation).toBeDefined();

    const parsedAdaptation = JSON.parse(fragileAdaptation!.content);
    expect(parsedAdaptation.policy?.retry?.maxRetries).toBe(0);
  });

  it('rejects wallet mutation by policy', () => {
    const walletBelief: any = {
      id: 'wallet-test',
      category: 'STATE',
      key: 'wallet.address',
      content: { address: '0x123' },
      epistemicStatus: 'CONFIRMED',
      confidence: 1.0,
      evidenceIds: [],
      contradictionIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    expect(() => memoryStore.storeBelief(walletBelief)).toThrow(/rejected storage of wallet.address/);
  });

  it('DialogueEngine memory injection excludes protected keys', async () => {
    runtime.setGlobalEventBus(eventBus, { disableMcp: true });
    
    const messages = await (runtime.dialogueEngine as any).buildWorkingMemory();
    const systemMsg = messages.find((m: any) => m.content.includes('[COGNITIVE STATE (WORKING MEMORY)]'));
    
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain('failing-tool');
    expect(systemMsg.content).not.toContain('wallet.address');
    expect(systemMsg.content).not.toContain('0x123');
  });
});
