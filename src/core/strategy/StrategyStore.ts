import { StrategyProfile, StrategyTransition } from './types';

export class StrategyStore {
  private activeProfile: StrategyProfile;
  private history: StrategyProfile[] = [];
  private transitions: StrategyTransition[] = [];

  constructor(initialProfile?: StrategyProfile) {
    if (initialProfile) {
      this.activeProfile = initialProfile;
    } else {
      // Default to BALANCED
      this.activeProfile = {
        id: `strat-${Date.now()}-balanced`,
        name: 'BALANCED',
        epochStart: Date.now(),
        planningConstraints: {
          maxStepsPerPlan: 5,
          allowUntestedTools: true
        },
        behavioralParameters: {
          riskTolerance: 0.5,
          costSensitivity: 0.5,
          budgetPacing: 100
        }
      };
    }
  }

  getActiveProfile(): StrategyProfile {
    return this.activeProfile;
  }

  getHistory(): StrategyProfile[] {
    return [...this.history, this.activeProfile];
  }
  
  getTransitions(): StrategyTransition[] {
    return [...this.transitions];
  }

  recordTransition(newProfile: StrategyProfile, reason: string, metaSnapshot: any) {
    this.activeProfile.epochEnd = Date.now();
    this.history.push(this.activeProfile);
    
    const transition: StrategyTransition = {
      id: `trans-${Date.now()}`,
      previousProfileId: this.activeProfile.id,
      newProfileId: newProfile.id,
      triggerReason: reason,
      timestamp: Date.now(),
      metaEvaluationSnapshot: metaSnapshot
    };
    this.transitions.push(transition);
    
    this.activeProfile = newProfile;
    console.log(`\n[StrategyStore] Strategy transitioned to ${newProfile.name}`);
    console.log(`[StrategyStore] Reason: ${reason}`);
  }
}
