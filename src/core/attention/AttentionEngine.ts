import { GoalEngine } from '../goals/GoalEngine';
import { StrategyStore } from '../strategy/StrategyStore';
import { AttentionAllocation } from './types';
import { Goal } from '../goals/types';
import { TemporalContext } from '../temporal/types';

export class AttentionEngine {
  constructor(
    private goalEngine: GoalEngine,
    private strategyStore: StrategyStore
  ) {}

  allocate(tc?: TemporalContext): AttentionAllocation {
    const activeProfile = this.strategyStore.getActiveProfile();
    const allGoals = this.goalEngine.getAllGoals();
    
    const now = tc ? tc.physicalTime : Date.now();

    const allocation: AttentionAllocation = {
      id: `alloc-${now}`,
      epochId: activeProfile.id,
      focusedGoalId: null,
      deferredGoalIds: [],
      dormantGoalIds: [],
      timestamp: now
    };

    // 1. Filter out terminal states
    const activeGoals = allGoals.filter(
      g => g.status !== 'COMPLETED' && g.status !== 'FAILED' && g.status !== 'ABANDONED' && g.status !== 'CANCELLED' && g.status !== 'INVALIDATED'
    );

    // 2. Separate Dormant goals
    const dormantGoals = activeGoals.filter(g => g.status === 'DORMANT');
    allocation.dormantGoalIds = dormantGoals.map(g => g.id);

    // 3. Evaluate viable goals (PENDING, IN_PROGRESS, BLOCKED)
    // Even if BLOCKED, it might have become unblocked, so we can re-evaluate. 
    // Wait, if it's BLOCKED, maybe we shouldn't execute it unless a trigger happens. 
    // For simplicity, let's say the Attention Engine evaluates PENDING or IN_PROGRESS or BLOCKED.
    const viableGoals = activeGoals.filter(g => g.status !== 'DORMANT');

    // 4. Sort by priority (descending)
    viableGoals.sort((a, b) => b.priority - a.priority);

    // 5. Apply Strategy Constraints
    let focusedGoal: Goal | null = null;
    for (const goal of viableGoals) {
      // Example constraint: under RESOURCE_CONSERVATION, ignore low priority goals
      if (activeProfile.name === 'RESOURCE_CONSERVATION' && goal.priority < 0.5) {
        allocation.deferredGoalIds.push(goal.id);
        continue;
      }
      
      // Found the highest priority viable goal
      if (!focusedGoal) {
        focusedGoal = goal;
      } else {
        allocation.deferredGoalIds.push(goal.id);
      }
    }

    if (focusedGoal) {
      allocation.focusedGoalId = focusedGoal.id;
      console.log(`[AttentionEngine] Allocated Focus to Goal: ${focusedGoal.id} (Priority: ${focusedGoal.priority.toFixed(2)})`);
    } else {
      console.log(`[AttentionEngine] No viable goals found. System is DORMANT.`);
    }

    if (allocation.deferredGoalIds.length > 0) {
      console.log(`[AttentionEngine] Deferred ${allocation.deferredGoalIds.length} goals due to strategy/priority.`);
    }

    return allocation;
  }
}
