import { ExecutionTrace, ProposalTrace } from '../execution/types';
import { SignalGenerator } from '../signals/SignalGenerator';
import { SignalArbitrator } from './SignalArbitrator';
import { MemoryPolicyEngine } from '../../memory/MemoryPolicyEngine';
import { GoalEngine } from '../goals/GoalEngine';
import { CoherenceMonitor } from '../cognition/CoherenceMonitor';
import { ProposalReflection } from './ProposalReflection';

import { OutcomeReflection } from './OutcomeReflection';

export class FeedbackPipeline {
  private signalGenerator = new SignalGenerator();
  private proposalReflection = new ProposalReflection();
  private outcomeReflection: OutcomeReflection;
  
  constructor(
    private arbitrator: SignalArbitrator,
    private memoryEngine: MemoryPolicyEngine,
    private goalEngine: GoalEngine,
    private coherenceMonitor: CoherenceMonitor
  ) {
    this.outcomeReflection = new OutcomeReflection((memoryEngine as any)['store']);
  }

  processTrace(trace: ExecutionTrace): void {
    console.log(`\n[FeedbackPipeline] Processing trace: ${trace.id} for goal: ${trace.goalId}`);
    
    // 0. Outcome Reflection
    this.outcomeReflection.ingest(trace);

    // 1. Generate Signals
    const rawSignals = this.signalGenerator.generate(trace);
    
    // 2. Arbitrate
    const validatedSignals = this.arbitrator.arbitrate(rawSignals);
    
    // 3. Map to Goal Engine and Memory Engine
    this.goalEngine.recordOutcome(trace.goalId, trace.finalOutcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED');

    for (const signal of validatedSignals) {
      if (signal.type === 'repeated_success_pattern') {
        // Boost coherence
        this.coherenceMonitor.updateCoherence(0.1);
        // Map to Memory
        const belief = this.memoryEngine.proposeHypothesis(signal.reasoning, 'PROCEDURAL', trace.id);
        this.memoryEngine.addEvidence(belief.id, trace.id, 0.4);
      }
      
      if (signal.type === 'verification_mismatch') {
        // Drop coherence
        this.coherenceMonitor.updateCoherence(-0.4);
        // Demote goal priority
        const goal = this.goalEngine.getGoal(trace.goalId);
        if (goal) {
          this.goalEngine.updatePriority(goal.id, goal.priority - 0.5);
        }
      }
      
      if (signal.type === 'failure_rate_spike') {
        // Drop coherence
        this.coherenceMonitor.updateCoherence(-0.2);
        const goal = this.goalEngine.getGoal(trace.goalId);
        if (goal) {
          this.goalEngine.updatePriority(goal.id, goal.priority - 0.3);
        }
      }
    }
  }

  processProposalTrace(trace: ProposalTrace): void {
    console.log(`\n[FeedbackPipeline] Processing ProposalTrace: ${trace.id}`);
    const belief = this.proposalReflection.ingest(trace);
    if (belief) {
      console.log(`[FeedbackPipeline] Saving IntentRealizationPattern Belief to Memory:`, belief);
      this.memoryEngine.proposeHypothesis(JSON.stringify(belief), 'PROCEDURAL', trace.id);
    }
  }
}

