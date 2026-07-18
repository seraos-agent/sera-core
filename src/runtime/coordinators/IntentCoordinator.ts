import { TemporalContext } from '../../core/temporal/types';
import { IntentEngine } from '../../core/intents/IntentEngine';
import { IntentStore } from '../../core/intents/IntentStore';
import { ProposalStore } from '../../core/intents/ProposalStore';
import { GoalSynthesizer } from '../../core/intents/GoalSynthesizer';
import { ProposalGovernance } from '../../core/intents/ProposalGovernance';
import { EventEmitter } from 'events';
import { StandardEvent, EventTypes } from '../../core/events/types';
import { Logger } from '../../core/logging/Logger';
import { SwarmCoordinator } from '../../core/swarm/SwarmCoordinator';

import { IWorkingMemory } from '../../core/memory/IWorkingMemory';

export class IntentCoordinator {
  private logger = new Logger('IntentCoordinator');

  constructor(
    private intentEngine: IntentEngine | undefined,
    private intentStore: IntentStore | undefined,
    private proposalStore: ProposalStore | undefined,
    private goalSynthesizer: GoalSynthesizer | undefined,
    private proposalGovernance: ProposalGovernance | undefined,
    private proposalEvaluator: any | undefined,
    private eventBus: EventEmitter | undefined,
    private feedbackPipeline: any | undefined,
    private memoryStore?: IWorkingMemory,
    private swarmCoordinator?: SwarmCoordinator
  ) {}

  public async runCycle(temporalContext: TemporalContext, worldState: any): Promise<void> {
    this.logger.debug(`Running intent coordination cycle ${temporalContext.cognitiveCycleId}`);
    this.governProposals(temporalContext, worldState);
    await this.runProposalPipeline(temporalContext, worldState);
  }

  private governProposals(temporalContext: TemporalContext, worldState: any): void {
    if (!this.proposalStore) return;
    const staleProposals = this.proposalStore.getStaleProposals(temporalContext.physicalTime);
    
    for (const proposal of staleProposals) {
      this.logger.info(`Proposal ${proposal.id} for Intent ${proposal.parentIntentId} has EXPIRED due to age.`);
      this.proposalStore.updateStatus(proposal.id, 'EXPIRED');
      
      if (this.feedbackPipeline) {
        this.feedbackPipeline.processProposalTrace({
          id: `ptrace-${Date.now()}`,
          proposalSnapshot: proposal,
          worldStateSnapshot: worldState,
          outcome: 'EXPIRED',
          timestamp: temporalContext.physicalTime
        });
      }
    }
  }

  private async runProposalPipeline(temporalContext: TemporalContext, worldState: any): Promise<void> {
    if (process.env.ENABLE_COMPLEX_AUTONOMY !== 'true') {
      this.logger.debug('Complex autonomy disabled by feature flag. Skipping ProposalPipeline.');
      return;
    }

    const auditReport = this.intentEngine ? this.intentEngine.auditRepresentations(temporalContext) : null;
      
    if (auditReport && this.intentStore && this.proposalStore && this.goalSynthesizer) {
      for (const gap of auditReport.gaps) {
        const intent = this.intentStore.getIntent(gap.intentId);
        if (!intent) continue;

        if (intent.proposalCooldownUntil && intent.proposalCooldownUntil > temporalContext.physicalTime) {
          this.logger.debug(`Intent ${intent.id} gap ignored (Cooldown active).`);
          continue;
        }

        const pending = this.proposalStore.getActiveProposalForIntent(intent.id);
        if (pending) {
          this.logger.debug(`Intent ${intent.id} already has a PENDING_REVIEW proposal.`);
          continue;
        }

        let proposal = this.goalSynthesizer.generateProposal(intent, gap, worldState);

        // Swarm review is opt-in and strictly proposal-only. It never receives
        // capabilities or an execution path, and never bypasses proposal governance.
        if (process.env.ENABLE_SWARM_PLANNING === 'true' && this.swarmCoordinator) {
          for (const candidate of proposal.candidates) {
            const review = await this.swarmCoordinator.run(candidate.strategy);
            candidate.swarmReview = {
              runId: review.runId,
              status: review.status,
              taskStatuses: review.tasks.map(task => ({
                taskId: task.taskId,
                role: task.role,
                status: task.status,
                ...(task.errorMessage ? { errorMessage: task.errorMessage } : {})
              })),
              completedAt: Date.now(),
              requiresHumanApproval: true
            };
          }
        }
        
        if (this.proposalEvaluator) {
          proposal = this.proposalEvaluator.evaluate(proposal);
        }

        if (this.proposalGovernance) {
          const govResult = this.proposalGovernance.evaluate(proposal);
          if (!govResult.valid) {
            this.logger.info(`Proposal rejected by Governance:`, { reasons: govResult.reasons });
            continue; 
          }
        }

        this.proposalStore.register(proposal);
        
        if (this.eventBus) {
          this.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_GENERATED, {
            id: `evt-${Date.now()}`,
            type: EventTypes.DIALOGUE_PROPOSAL_GENERATED,
            source: 'IntentCoordinator',
            timestamp: Date.now(),
            payload: {
              proposalId: proposal.id,
              intent: 'COMPLEX_GOAL_PROPOSAL',
              parameters: {},
              candidates: proposal.candidates
            }
          } as StandardEvent);
        }

        intent.lastProposalAt = temporalContext.physicalTime;
        intent.proposalCooldownUntil = temporalContext.physicalTime + 5000;

        this.logger.info(`*** NEW PROPOSAL GENERATED ***`, { intentId: intent.id, proposalId: proposal.id });
      }
    }
  }
}
