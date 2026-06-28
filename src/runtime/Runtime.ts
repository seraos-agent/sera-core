import { Goal } from '../core/goals/types';
import { WorkItem } from '../core/work-items/types';
import { WorldStateService } from '../core/world-state/WorldStateService';
import { MemoryStore } from '../memory/MemoryStore';
import { AuthorityService } from '../delegation/AuthorityService';
import { AuthorityContext, DelegationScope } from '../delegation/types';
import { Event } from '../core/events/types';
import { WorkerManager } from '../workers/WorkerManager';

export class Runtime {
  private worldStateService: WorldStateService;
  private memoryStore: MemoryStore;
  private authorityService: AuthorityService;
  private workerManager: WorkerManager;
  
  constructor(workerManager: WorkerManager) {
    this.worldStateService = new WorldStateService();
    this.memoryStore = new MemoryStore();
    this.authorityService = new AuthorityService();
    this.workerManager = workerManager;
  }
  
  getWorldState() {
    return this.worldStateService.getState();
  }
  
  getMemory() {
    return this.memoryStore.getHistory();
  }

  async processGoal(goal: Goal, scope: DelegationScope): Promise<void> {
    console.log(`\n[Runtime] Processing Goal: ${goal.id} - ${goal.description}`);
    
    // 1. Generate Work Item (Simulated planner logic for Phase 1/2)
    const workItem: WorkItem = {
      id: `wi-${Date.now()}`,
      goalId: goal.id,
      action: 'execute_work_item',
      payload: goal.targetState,
      status: 'PENDING',
      createdAt: Date.now()
    };
    
    console.log(`[Runtime] Generated WorkItem: ${workItem.id}`);

    // 2. Authority Check
    const authorityContext: AuthorityContext = {
      principalId: scope.principalId,
      goalId: goal.id,
      workItemId: workItem.id,
      action: workItem.action,
    };

    const decision = this.authorityService.evaluate(authorityContext, scope);
    console.log(`[Runtime] Authority Decision for ${workItem.action}: ${decision.status} (${decision.reason})`);

    if (decision.status === 'DENIED') {
      console.log(`[Runtime] Execution aborted due to DENIED authority.`);
      workItem.status = 'FAILED';
      const event: Event = {
        id: `evt-${Date.now()}`,
        type: 'WORK_ITEM_DENIED',
        payload: { workItemId: workItem.id, reason: decision.reason },
        timestamp: Date.now(),
      };
      this.memoryStore.store(event);
      return;
    }

    if (decision.status === 'REQUIRES_APPROVAL') {
      console.log(`[Runtime] Execution paused due to REQUIRES_APPROVAL authority.`);
      workItem.status = 'PENDING';
      const event: Event = {
        id: `evt-${Date.now()}`,
        type: 'WORK_ITEM_REQUIRES_APPROVAL',
        payload: { workItemId: workItem.id, reason: decision.reason },
        timestamp: Date.now(),
      };
      this.memoryStore.store(event);
      return;
    }
    
    // 3. Pass WorkItem to WorkerManager
    const result = await this.workerManager.dispatch(workItem);
    
    // 4. Process WorkerResult
    if (result.status === 'SUCCESS') {
      workItem.status = 'COMPLETED';
      // Apply generated Events to World State and Memory
      result.events.forEach(event => {
        this.worldStateService.applyEvent(event);
        this.memoryStore.store(event);
      });
      console.log(`[Runtime] Updated WorldState:`, this.worldStateService.getState().data);
      console.log(`[Runtime] Stored Events in Memory.`);
    } else {
      workItem.status = 'FAILED';
      console.log(`[Runtime] Worker execution failed for WorkItem: ${workItem.id}`);
    }
    
    // 5. Check Goal Status
    goal.status = workItem.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
    console.log(`[Runtime] Goal ${goal.id} status is now ${goal.status}`);
  }
}
