import { EventEmitter } from 'events';
import { EventTypes, ProposeGoalPayload } from '../events/types';
import { randomUUID } from 'crypto';

export class ProposalManager {
  private eventBus: EventEmitter;
  private pendingProposals = new Map<string, { intent: string, parameters: Record<string, any>, userMessage?: string }>();

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.setupListeners();
  }

  private setupListeners(): void {
    // 1. Listen for requests to propose a goal
    this.eventBus.on(EventTypes.SYSTEM_PROPOSE_GOAL, (event: any) => {
      const payload = event.payload as ProposeGoalPayload;
      this.handleProposeGoal(payload);
    });

    // 2. Listen for UI approvals
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_APPROVED, (event: any) => {
      const proposalId = event.payload.proposalId;
      this.handleProposalApproved(proposalId);
    });

    // 3. Listen for UI rejections
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_REJECTED, (event: any) => {
      const proposalId = event.payload.proposalId;
      this.handleProposalRejected(proposalId);
    });
  }

  private handleProposeGoal(payload: ProposeGoalPayload): void {
    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Store in memory
    this.pendingProposals.set(proposalId, {
      intent: payload.intent,
      parameters: payload.parameters,
      userMessage: payload.userMessage
    });

    // Notify UI
    this.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_GENERATED, {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: EventTypes.DIALOGUE_PROPOSAL_GENERATED,
      source: 'ProposalManager',
      timestamp: Date.now(),
      payload: {
        proposalId,
        intent: payload.intent,
        parameters: payload.parameters
      }
    });
    
    console.log(`[ProposalManager] Generated proposal ${proposalId} for ${payload.intent}`);
  }

  private handleProposalApproved(proposalId: string): void {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      console.warn(`[ProposalManager] Unknown or already processed proposal approved: ${proposalId}`);
      return;
    }

    // Spawn the goal for execution
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.eventBus.emit(EventTypes.DOMAIN_GOAL_SPAWNED, {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: EventTypes.DOMAIN_GOAL_SPAWNED,
      source: 'ProposalManager',
      timestamp: Date.now(),
      payload: {
        requestId,
        intent: proposal.intent,
        parameters: proposal.parameters
      }
    });

    // Clean up
    this.pendingProposals.delete(proposalId);
    
    console.log(`[ProposalManager] Proposal ${proposalId} approved and spawned as ${requestId}`);
  }

  private handleProposalRejected(proposalId: string): void {
    if (this.pendingProposals.has(proposalId)) {
      this.pendingProposals.delete(proposalId);
      
      // Optionally notify the original source or dialogue engine
      this.eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: EventTypes.DIALOGUE_AGENT_SPEAK,
        source: 'ProposalManager',
        timestamp: Date.now(),
        payload: {
          message: "Proposal has been cancelled. Let me know if you'd like to do something else."
        }
      });
      
      console.log(`[ProposalManager] Proposal ${proposalId} rejected`);
    }
  }
}
