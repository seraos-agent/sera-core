import { GoalProposal, GoalCandidate } from './types';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { IntentRealizationPattern, OutcomeRealizationPattern } from '../execution/types';

export class ProposalEvaluator {
  constructor(private memoryStore: IWorkingMemory) {}

  evaluate(proposal: GoalProposal): GoalProposal {
    // 1. Fetch relevant IntentRealizationPattern from memory (Acceptance)
    const intentPatternBelief = this.findRelevantPattern(proposal.parentIntentId, 'INTENT_REALIZATION');
    const intentPattern: IntentRealizationPattern | null = intentPatternBelief ? JSON.parse(intentPatternBelief.content) : null;

    // 2. Fetch relevant OutcomeRealizationPattern from memory (Effectiveness)
    const outcomePatternBelief = this.findRelevantPattern(proposal.parentIntentId, 'OUTCOME_REALIZATION');
    const outcomePattern: OutcomeRealizationPattern | null = outcomePatternBelief ? JSON.parse(outcomePatternBelief.content) : null;

    // 3. Compute MultiDimensionalVector for each candidate
    proposal.candidates = proposal.candidates.map(candidate => {
      const intentStats = intentPattern?.categoryStats[candidate.category];
      const outcomeStats = outcomePattern?.categoryStats[candidate.category];
      
      const intentAlignment = this.computeIntentAlignment(candidate);
      const outcomeQuality = this.computeOutcomeQuality(candidate);
      const acceptanceProbability = intentStats ? intentStats.approvalRate : 0.5; // default neutral
      const historicalOutcomeEffectiveness = outcomeStats ? outcomeStats.goalSuccessRate : 0.5; // default neutral
      const diversityContribution = this.computeDiversityContribution(candidate.category);
      
      candidate.evaluationVector = {
        intentAlignment,
        outcomeQuality,
        acceptanceProbability,
        historicalOutcomeEffectiveness,
        diversityContribution
      };

      return candidate;
    });

    return proposal;
  }

  private findRelevantPattern(intentId: string, category: any): any {
    const history = this.memoryStore.getBeliefsByCategory(category);
    return history.find(b => {
      try {
        return JSON.parse(b.content).intentType === intentId;
      } catch {
        return false;
      }
    });
  }

  private computeIntentAlignment(candidate: GoalCandidate): number {
    // Mock logic based on category
    if (candidate.category === 'ALIGNED') return 0.9;
    if (candidate.category === 'OBJECTIVE') return 0.8;
    return 0.5;
  }

  private computeOutcomeQuality(candidate: GoalCandidate): number {
    // Mock logic: OBJECTIVE is mathematically optimal
    if (candidate.category === 'OBJECTIVE') return 0.95;
    if (candidate.category === 'ALIGNED') return 0.7;
    return 0.6;
  }

  private computeDiversityContribution(category: string): number {
    if (category === 'EXPLORATORY') return 1.0;
    if (category === 'OBJECTIVE') return 0.6;
    return 0.2;
  }
}
