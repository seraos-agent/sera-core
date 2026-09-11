import { EventEmitter } from 'events';
import { EventTypes, ProposeGoalPayload } from '../events/types';

export class ProposalManager {
  private eventBus: EventEmitter;
  private pendingProposals = new Map<string, { intent: string, parameters: Record<string, any>, userMessage?: string }>();
  private proposalTimers = new Map<string, NodeJS.Timeout>();
  public static readonly PROPOSAL_TTL_MS = 60 * 1000; // 60 seconds

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

  public createProposal(payload: ProposeGoalPayload): string {
    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Store in memory
    this.pendingProposals.set(proposalId, {
      intent: payload.intent,
      parameters: payload.parameters,
      userMessage: payload.userMessage
    });

    // Setup 60-second auto-expiration TTL
    const timer = setTimeout(() => {
      this.expireProposal(proposalId);
    }, ProposalManager.PROPOSAL_TTL_MS);
    this.proposalTimers.set(proposalId, timer);

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
    
    console.log(`[ProposalManager] Generated proposal ${proposalId} for ${payload.intent} (TTL: 60s)`);
    return proposalId;
  }

  private handleProposeGoal(payload: ProposeGoalPayload): void {
    this.createProposal(payload);
  }

  public getProposal(proposalId: string): { intent: string, parameters: Record<string, any>, userMessage?: string } | undefined {
    return this.pendingProposals.get(proposalId);
  }

  public listPendingProposals(): Array<{ proposalId: string, intent: string, parameters: Record<string, any>, userMessage?: string }> {
    const list: Array<{ proposalId: string, intent: string, parameters: Record<string, any>, userMessage?: string }> = [];
    for (const [proposalId, data] of this.pendingProposals.entries()) {
      list.push({ proposalId, ...data });
    }
    return list;
  }

  public approveProposal(proposalId: string): boolean {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      console.warn(`[ProposalManager] Unknown or already processed proposal approved: ${proposalId}`);
      return false;
    }

    // Clear TTL timer
    const timer = this.proposalTimers.get(proposalId);
    if (timer) {
      clearTimeout(timer);
      this.proposalTimers.delete(proposalId);
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
        parameters: { ...proposal.parameters, _userMessage: proposal.userMessage }
      }
    });

    // Clean up
    this.pendingProposals.delete(proposalId);
    console.log(`[ProposalManager] Proposal ${proposalId} approved and spawned as ${requestId}`);
    return true;
  }

  public rejectProposal(proposalId: string): boolean {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      return false;
    }

    // Clear TTL timer
    const timer = this.proposalTimers.get(proposalId);
    if (timer) {
      clearTimeout(timer);
      this.proposalTimers.delete(proposalId);
    }

    this.pendingProposals.delete(proposalId);

    const responseContext = proposal.parameters?._responseContext;
    
    this.eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: EventTypes.DIALOGUE_AGENT_SPEAK,
      source: 'ProposalManager',
      timestamp: Date.now(),
      payload: {
        text: '❌ Tindakan dibatalkan sesuai permintaan.',
        ...(responseContext ? { responseContext: { ...responseContext, isVoiceMessage: false } } : {})
      }
    });
    
    console.log(`[ProposalManager] Proposal ${proposalId} rejected`);
    return true;
  }

  public expireProposal(proposalId: string): boolean {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      return false;
    }

    const timer = this.proposalTimers.get(proposalId);
    if (timer) {
      clearTimeout(timer);
      this.proposalTimers.delete(proposalId);
    }

    this.pendingProposals.delete(proposalId);

    const responseContext = proposal.parameters?._responseContext;

    this.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_EXPIRED, {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: EventTypes.DIALOGUE_PROPOSAL_EXPIRED,
      source: 'ProposalManager',
      timestamp: Date.now(),
      payload: {
        proposalId,
        intent: proposal.intent,
        parameters: proposal.parameters
      }
    });

    this.eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: EventTypes.DIALOGUE_AGENT_SPEAK,
      source: 'ProposalManager',
      timestamp: Date.now(),
      payload: {
        text: '⏱️ Waktu konfirmasi (60 detik) telah habis. Tindakan dibatalkan secara aman.',
        ...(responseContext ? { responseContext: { ...responseContext, isVoiceMessage: false } } : {})
      }
    });

    console.log(`[ProposalManager] Proposal ${proposalId} expired after 60s TTL`);
    return true;
  }

  private handleProposalApproved(proposalId: string): void {
    this.approveProposal(proposalId);
  }

  private handleProposalRejected(proposalId: string): void {
    this.rejectProposal(proposalId);
  }
}
