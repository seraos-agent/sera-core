import { Goal, GoalStatus } from './types';

export class GoalEngine {
  private goals: Map<string, Goal> = new Map();
  private goalHistory: Map<string, { success: number, failure: number, updates: number }> = new Map();

  registerGoal(goal: Goal): void {
    if (goal.priority === undefined) goal.priority = 1.0;
    if (goal.stabilityIndex === undefined) goal.stabilityIndex = 1.0;
    this.goals.set(goal.id, goal);
    this.goalHistory.set(goal.id, { success: 0, failure: 0, updates: 0 });
  }

  getGoal(id: string): Goal | undefined {
    return this.goals.get(id);
  }

  getAllGoals(): Goal[] {
    return Array.from(this.goals.values());
  }

  updateStatus(goalId: string, status: GoalStatus): void {
    const goal = this.goals.get(goalId);
    if (!goal) return;
    goal.status = status;
    console.log(`[GoalEngine] Goal ${goalId} status updated to ${status}`);
  }

  recordOutcome(goalId: string, outcome: 'SUCCESS' | 'FAILED'): void {
    const history = this.goalHistory.get(goalId);
    if (!history) return;
    if (outcome === 'SUCCESS') history.success++;
    else history.failure++;
    history.updates++;
    this.recalculateStability(goalId);
  }

  private recalculateStability(goalId: string): void {
    const goal = this.goals.get(goalId);
    const history = this.goalHistory.get(goalId);
    if (!goal || !history || history.updates === 0) return;

    const total = history.success + history.failure;
    const consistency = Math.max(history.success, history.failure) / total;
    const volatilityPenalty = history.updates > 5 ? 0.2 : 0.0;
    
    // Stability Index = consistency_over_time + success_variance - volatility_penalty
    // Simplified for now
    goal.stabilityIndex = Math.max(0.1, consistency - volatilityPenalty);
    console.log(`[GoalEngine] Goal ${goalId} stability recalculated: ${goal.stabilityIndex.toFixed(2)}`);
  }

  updatePriority(goalId: string, newPriority: number): void {
    const goal = this.goals.get(goalId);
    if (!goal) return;
    
    // Penalize large jumps if stability is low
    const jump = Math.abs(newPriority - goal.priority);
    const penalty = (1.0 - goal.stabilityIndex) * jump * 0.5;
    
    goal.priority = newPriority > goal.priority 
      ? newPriority - penalty 
      : newPriority + penalty;
      
    console.log(`[GoalEngine] Goal ${goalId} priority updated to ${goal.priority.toFixed(2)} (Penalty applied: ${penalty.toFixed(2)})`);
  }

  applyMetaSignal(signal: any): void {
    if (signal.type === 'increase_stability_weight') {
      console.log(`[GoalEngine] Applied MetaSignal: Increasing goal stability weight.`);
    }
  }
}
