import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { ExecutionCoordinator } from '../src/runtime/coordinators/ExecutionCoordinator';
import { ConstitutionEngine } from '../src/constitution/ConstitutionEngine';
import { AuthorityService } from '../src/delegation/AuthorityService';

import { Goal } from '../src/core/goals/types';
import { Plan } from '../src/core/planner/types';
import { DelegationScope, AuthorityDecision } from '../src/delegation/types';
import { ExecutionContext } from '../src/core/execution/aios_types';
import { EventTypes } from '../src/core/events/types';

describe('Human-In-The-Loop Governance', () => {
  let eventBus: EventEmitter;
  let coordinator: ExecutionCoordinator;
  let authorityService: AuthorityService;
  let constitutionEngine: ConstitutionEngine;

  beforeEach(() => {
    eventBus = new EventEmitter();
    authorityService = new AuthorityService();
    constitutionEngine = new ConstitutionEngine();
    
    // Mock authority to require approval
    vi.spyOn(authorityService, 'evaluate').mockReturnValue({
      status: 'REQUIRES_APPROVAL',
      reason: 'Testing HITL'
    });

    coordinator = new ExecutionCoordinator(
      constitutionEngine,
      authorityService,
      undefined,
      undefined,
      {} as any, // Simple mock
      eventBus
    );

    vi.spyOn((coordinator as any).scheduler, 'submitTask');
  });

  it('pauses execution and emits GOAL_REQUIRES_APPROVAL when authority requires it', async () => {
    const goal: Goal = { id: 'g1', intentId: 'i1', description: 'Test', status: 'IN_PROGRESS', priority: 1, stabilityIndex: 1, createdAt: Date.now() };
    const plan: Plan = { id: 'p1', goalId: 'g1', steps: [{ id: 's1', action: 'wallet:transfer', status: 'PENDING', description: 'desc', payload: {} }], confidence: 1, createdAt: Date.now() };
    const scope: DelegationScope = { id: 'scope1', principalId: 'u1', allowedPermissions: [], requiresApprovalPermissions: [{ action: 'wallet:transfer' }] };
    const ctx: ExecutionContext = { executionId: 'e1', origin: 'test', priority: 1, createdAt: Date.now() };

    let approvalEventFired = false;
    let receivedTaskId = '';
    
    eventBus.on(EventTypes.GOAL_REQUIRES_APPROVAL, (payload) => {
      approvalEventFired = true;
      receivedTaskId = payload.taskId;
    });

    await coordinator.submitTask(goal, plan, scope, ctx);

    // Should NOT have submitted to scheduler
    expect((coordinator as any).scheduler.submitTask).not.toHaveBeenCalled();
    expect(approvalEventFired).toBe(true);
    
    // Approve it
    const success = coordinator.approveTask(receivedTaskId);
    expect(success).toBe(true);
    
    // Should NOW have submitted to scheduler
    expect((coordinator as any).scheduler.submitTask).toHaveBeenCalled();
  });
  
  it('rejects execution when rejectTask is called', async () => {
    const goal: Goal = { id: 'g2', intentId: 'i1', description: 'Test', status: 'IN_PROGRESS', priority: 1, stabilityIndex: 1, createdAt: Date.now() };
    const plan: Plan = { id: 'p2', goalId: 'g2', steps: [{ id: 's2', action: 'wallet:transfer', status: 'PENDING', description: 'desc', payload: {} }], confidence: 1, createdAt: Date.now() };
    const scope: DelegationScope = { id: 'scope1', principalId: 'u1', allowedPermissions: [], requiresApprovalPermissions: [{ action: 'wallet:transfer' }] };
    const ctx: ExecutionContext = { executionId: 'e2', origin: 'test', priority: 1, createdAt: Date.now() };

    let receivedTaskId = '';
    eventBus.on(EventTypes.GOAL_REQUIRES_APPROVAL, (payload) => {
      receivedTaskId = payload.taskId;
    });

    await coordinator.submitTask(goal, plan, scope, ctx);
    expect((coordinator as any).scheduler.submitTask).not.toHaveBeenCalled();
    
    // Reject it
    const success = coordinator.rejectTask(receivedTaskId);
    expect(success).toBe(true);
    
    // Should STILL NOT have submitted to scheduler
    expect((coordinator as any).scheduler.submitTask).not.toHaveBeenCalled();
  });
});

