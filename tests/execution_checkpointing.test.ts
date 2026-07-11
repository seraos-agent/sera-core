import { describe, it, expect, beforeAll } from 'vitest';
import { EventEmitter } from 'events';
import { ExecutionCoordinator } from '../src/runtime/coordinators/ExecutionCoordinator';
import { JsonMemoryStore } from '../src/memory/adapters/JsonMemoryStore';
import { ConstitutionEngine } from '../src/constitution/ConstitutionEngine';
import { AuthorityService } from '../src/delegation/AuthorityService';
import { Goal } from '../src/core/goals/types';
import { Plan } from '../src/core/planner/types';
import { DelegationScope } from '../src/delegation/types';
import { ExecutionContext, ExecutionState } from '../src/core/execution/aios_types';
import { EventTypes } from '../src/core/events/types';

describe('Execution Checkpointing (Suspend & Resume)', () => {
  let eventBus: EventEmitter;
  let memoryStore: JsonMemoryStore;
  let constitutionEngine: ConstitutionEngine;
  let authorityService: AuthorityService;
  let coordinator: ExecutionCoordinator;

  const goal: Goal = {
    id: 'goal-suspend-test',
    description: 'Test suspend and resume',
    priority: 1.0,
    status: 'PENDING',
    stabilityIndex: 1.0,
    createdAt: Date.now(),
    targetState: {}
  };

  const plan: Plan = {
    id: 'plan-suspend-test',
    goalId: goal.id,
    steps: [
      {
        id: 'step-1',
        description: 'mock step',
        action: 'MOCK_ASYNC_ACTION',
        payload: { value: 42 },
        status: 'PENDING' as any
      }
    ],
    status: 'PROPOSED',
    createdAt: Date.now()
  };

  const scope: DelegationScope = {
    id: 'scope-1',
    principalId: 'test-user',
    allowedPermissions: [{ action: 'MOCK_ASYNC_ACTION' }],
    requiresApprovalPermissions: []
  };

  const context: ExecutionContext = {
    executionId: 'exec-1',
    origin: 'test',
    priority: 500,
    createdAt: Date.now()
  };

  beforeAll(() => {
    eventBus = new EventEmitter();
    memoryStore = new JsonMemoryStore();
    constitutionEngine = new ConstitutionEngine();
    authorityService = new AuthorityService();
    
    coordinator = new ExecutionCoordinator(
      constitutionEngine,
      authorityService,
      undefined,
      undefined,
      memoryStore,
      eventBus
    );
  });

  it('suspends task and sets WAITING_CONDITION', async () => {
    let suspended = false;
    let correlationId = '';
    let taskId = '';

    eventBus.on('system.execution.paused', (event: any) => {
      suspended = true;
      taskId = event.taskId;
      if (event.payload?.waitCondition?.correlationId) {
        correlationId = event.payload.waitCondition.correlationId;
      }
    });

    let completed = false;
    eventBus.on('system.execution.completed', (event: any) => {
      completed = true;
    });

    await coordinator.submitTask(goal, plan, scope, context);

    let waitLimit = 20;
    while (!suspended && waitLimit > 0) {
      await new Promise(r => setTimeout(r, 100));
      waitLimit--;
    }

    expect(suspended).toBe(true);

    const scheduler = (coordinator as any).scheduler;
    const instance = scheduler.getActiveInstances().get(taskId);
    
    expect(instance.state).toBe(ExecutionState.WAITING_CONDITION);

    eventBus.emit(EventTypes.DOMAIN_GOAL_RESULT, {
      id: 'mock-res-1',
      type: EventTypes.DOMAIN_GOAL_RESULT,
      source: 'TestBridge',
      correlationId,
      timestamp: Date.now(),
      payload: {
        success: true,
        data: { result: 'WAKE_UP' }
      }
    });

    waitLimit = 20;
    while (!completed && waitLimit > 0) {
      await new Promise(r => setTimeout(r, 100));
      waitLimit--;
    }

    expect(completed).toBe(true);
  });
});
