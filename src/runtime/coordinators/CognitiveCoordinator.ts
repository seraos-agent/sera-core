import { TemporalContext } from '../../core/temporal/types';
import { AttentionEngine } from '../../core/attention/AttentionEngine';
import { GoalEngine } from '../../core/goals/GoalEngine';
import { Planner } from '../../core/planner/Planner';
import { StrategyStore } from '../../core/strategy/StrategyStore';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { Plan } from '../../core/planner/types';
import { Goal } from '../../core/goals/types';
import { Logger } from '../../core/logging/Logger';
import { CoherenceMonitor } from '../../core/cognition/CoherenceMonitor';

export interface CognitiveCycleResult {
  goal: Goal | null;
  plan: Plan | null;
}

export class CognitiveCoordinator {
  private logger = new Logger('CognitiveCoordinator');

  constructor(
    private attentionEngine: AttentionEngine | undefined,
    private goalEngine: GoalEngine | undefined,
    private planner: Planner | undefined,
    private strategyStore: StrategyStore | undefined,
    private memoryStore: IWorkingMemory, // Single reference enforced by Runtime
    private coherenceMonitor: CoherenceMonitor | undefined
  ) {}

  public async runCycle(temporalContext: TemporalContext, worldState: any, targetGoalId?: string): Promise<CognitiveCycleResult> {
    this.logger.debug(`Running cognitive cycle ${temporalContext.cognitiveCycleId}`);
    
    if (!this.attentionEngine || !this.goalEngine) {
      this.logger.error("AttentionEngine and GoalEngine are required for cognitive cycle.");
      return { goal: null, plan: null };
    }

    if (this.coherenceMonitor) {
      const state = this.coherenceMonitor.getState();
      if (state.autonomyLevel === 'RESTRICTED') {
        this.logger.warn(`System is RESTRICTED due to low coherence. Applying strict policies.`);
      }
    }

    const allocation = this.attentionEngine.allocate(temporalContext);
    let focusedId = targetGoalId || allocation.focusedGoalId;
    
    if (!focusedId) {
      this.logger.debug(`No focused goal. System sleeping...`);
      return { goal: null, plan: null };
    }
    
    const goalToProcess = this.goalEngine.getGoal(focusedId);
    if (!goalToProcess) {
      this.logger.error(`Focused goal ${focusedId} not found in GoalEngine!`);
      return { goal: null, plan: null };
    }

    this.logger.info(`Cognitive cycle targeting Goal: ${goalToProcess.id}`);
    this.goalEngine.updateStatus(goalToProcess.id, 'IN_PROGRESS');
    
    if (!this.planner || !this.strategyStore) {
      this.logger.error(`Planner or StrategyStore is not injected.`);
      return { goal: goalToProcess, plan: null };
    }

    const activeProfile = this.strategyStore.getActiveProfile();
    const plan = await this.planner.generatePlan(goalToProcess, worldState, this.memoryStore, activeProfile, temporalContext);
    
    return { goal: goalToProcess, plan };
  }
}
