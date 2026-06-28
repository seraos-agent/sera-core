import { Goal } from '../core/goals/types';
import { WorkItem } from '../core/work-items/types';
import { WorldStateService } from '../core/world-state/WorldStateService';
import { MemoryStore } from '../memory/MemoryStore';
import { Executor } from './Executor';

export class Runtime {
  private worldStateService: WorldStateService;
  private memoryStore: MemoryStore;
  private executor: Executor;
  
  constructor() {
    this.worldStateService = new WorldStateService();
    this.memoryStore = new MemoryStore();
    this.executor = new Executor();
  }
  
  getWorldState() {
    return this.worldStateService.getState();
  }
  
  getMemory() {
    return this.memoryStore.getHistory();
  }

  async processGoal(goal: Goal): Promise<void> {
    console.log(`\n[Runtime] Processing Goal: ${goal.id} - ${goal.description}`);
    
    // 1. Generate Work Item (Simulated planner logic for Phase 1)
    const workItem: WorkItem = {
      id: `wi-${Date.now()}`,
      goalId: goal.id,
      action: 'ACHIEVE_TARGET_STATE',
      payload: goal.targetState,
      status: 'PENDING',
      createdAt: Date.now()
    };
    
    console.log(`[Runtime] Generated WorkItem: ${workItem.id}`);
    
    // 2. Execute Work Item
    const event = await this.executor.execute(workItem);
    
    // 3. Update World State
    this.worldStateService.applyEvent(event);
    console.log(`[Runtime] Updated WorldState:`, this.worldStateService.getState().data);
    
    // 4. Store Memory
    this.memoryStore.store(event);
    console.log(`[Runtime] Stored Event in Memory.`);
    
    // 5. Check Goal Status
    goal.status = 'COMPLETED';
    console.log(`[Runtime] Goal ${goal.id} status is now ${goal.status}`);
  }
}
