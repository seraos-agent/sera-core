import { EventTypes, StandardEvent } from '../../core/events/types';

export interface McpChatDependencies {
  getSubscriptionService: () => any;
}

/**
 * Handles conversational turns (sera_chat) and governance proposals
 * (list, approve, reject, schedule) via the Model Context Protocol.
 */
export class McpChatAndProposalHandler {
  constructor(private readonly deps: McpChatDependencies) {}

  public async handleChat(instance: any, userId: string, message: string): Promise<any> {
    if (!message || typeof message !== 'string' || !message.trim()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'A message is required.' }]
      };
    }

    const subscriptionService = this.deps.getSubscriptionService();
    const credits = subscriptionService.getAgentCredits(userId);
    if (credits <= 0) {
      return {
        content: [{
          type: 'text',
          text: '🔋 Agent Energy Core depleted. Please top up your tokens on the Sera dashboard to continue.'
        }]
      };
    }

    return new Promise<any>((resolve) => {
      const timeout = setTimeout(() => {
        instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
        instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);
        resolve({
          content: [{
            type: 'text',
            text: 'Sera is still processing your request. Please check the Sera dashboard for updates.'
          }]
        });
      }, 35_000);

      const onSpeak = (event: any) => {
        clearTimeout(timeout);
        instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
        instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);
        const payload = event.payload || event;
        resolve({
          content: [{ type: 'text', text: payload.text || 'Sera completed the response.' }]
        });
      };

      const onProposal = (event: any) => {
        clearTimeout(timeout);
        instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
        instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);
        const payload = event.payload || event;
        resolve({
          content: [{
            type: 'text',
            text: `📋 Sera has generated a governance proposal (ID: ${payload.proposalId}).\n\nIntent: ${payload.intent}\nParameters: ${JSON.stringify(payload.parameters, null, 2)}\n\n⚠️ Please review and approve on your Sera dashboard.`
          }]
        });
      };

      instance.eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, onSpeak);
      instance.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposal);

      const event: StandardEvent = {
        id: `evt-mcp-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'McpServer',
        payload: {
          message: message.trim(),
          _responseContext: {
            platform: 'mcp',
            channelId: `mcp:${userId}`
          }
        },
        timestamp: Date.now(),
      };
      instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);
    });
  }

  public async handleProposalApprove(instance: any, proposalId: string): Promise<any> {
    if (!proposalId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'proposalId is required to approve a proposal.' }]
      };
    }

    const proposal = instance.proposalManager?.getProposal?.(proposalId);
    if (!proposal && instance.proposalManager) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Proposal with ID "${proposalId}" was not found or has already been processed.`
        }]
      };
    }

    return new Promise<any>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        instance.eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);
        resolve({
          content: [{
            type: 'text',
            text: `✅ Proposal \`${proposalId}\` approved and queued for execution. Processing on-chain...`
          }]
        });
      }, 15_000);

      const onGoalResult = (event: any) => {
        const payload = event?.payload || event;
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        instance.eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);

        if (payload?.success === false) {
          resolve({
            isError: true,
            content: [{
              type: 'text',
              text: `❌ Execution failed for proposal \`${proposalId}\`: ${payload.errorMessage || 'Unknown error'}`
            }]
          });
          return;
        }

        const data = payload?.data || {};
        const txHash = data.txHash || data.transactionHash || data.hash;
        const details = [
          `✅ **Proposal \`${proposalId}\` Approved and Executed Successfully!**`,
          `• **Intent**: \`${proposal?.intent || payload?.intent || 'EXECUTED'}\``,
        ];

        if (txHash) {
          details.push(`• **Transaction Hash**: \`${txHash}\` (Base Scan: https://basescan.org/tx/${txHash})`);
        }
        if (data.recipient || data.to) {
          details.push(`• **Recipient**: \`${data.recipient || data.to}\``);
        }
        if (data.amount && data.asset) {
          details.push(`• **Amount**: **${data.amount} ${data.asset}**`);
        }
        if (data.status) {
          details.push(`• **Status**: \`${data.status}\``);
        }

        resolve({
          content: [{
            type: 'text',
            text: details.join('\n')
          }]
        });
      };

      instance.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);

      const approved = instance.proposalManager?.approveProposal
        ? instance.proposalManager.approveProposal(proposalId)
        : true;

      if (!instance.proposalManager?.approveProposal) {
        instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, {
          id: `evt-mcp-appr-${Date.now()}`,
          type: EventTypes.DIALOGUE_PROPOSAL_APPROVED,
          source: 'McpServer',
          timestamp: Date.now(),
          payload: { proposalId }
        });
      }

      if (!approved) {
        clearTimeout(timeout);
        instance.eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);
        resolve({
          isError: true,
          content: [{
            type: 'text',
            text: `Failed to approve proposal "${proposalId}". It may have already been processed or cancelled.`
          }]
        });
      }
    });
  }

  public handleProposalReject(instance: any, proposalId: string, reason?: string): any {
    if (!proposalId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'proposalId is required to reject a proposal.' }]
      };
    }

    const proposal = instance.proposalManager?.getProposal?.(proposalId);
    if (!proposal && instance.proposalManager) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Proposal with ID "${proposalId}" was not found or has already been processed.`
        }]
      };
    }

    const rejected = instance.proposalManager?.rejectProposal
      ? instance.proposalManager.rejectProposal(proposalId)
      : true;

    if (!instance.proposalManager?.rejectProposal) {
      instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, {
        id: `evt-mcp-rej-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_REJECTED,
        source: 'McpServer',
        timestamp: Date.now(),
        payload: { proposalId, reason }
      });
    }

    return {
      content: [{
        type: 'text',
        text: `🛑 **Proposal Cancelled**\n\nProposal \`${proposalId}\` was rejected and will not be executed.${reason ? ` Reason: ${reason}` : ''}`
      }]
    };
  }

  public handleProposalList(instance: any): any {
    const list = instance.proposalManager?.listPendingProposals?.() || [];
    if (list.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No active proposals are currently waiting for approval.'
        }]
      };
    }

    const lines = [`**Pending Governance Proposals (${list.length})**`];
    for (const p of list) {
      lines.push(`• **ID**: \`${p.proposalId}\` | **Intent**: \`${p.intent}\` | Parameters: ${JSON.stringify(p.parameters)}`);
    }
    lines.push('\nTo execute any proposal, ask user confirmation and call `sera_proposal_approve` with the proposal ID.');

    return {
      content: [{
        type: 'text',
        text: lines.join('\n')
      }]
    };
  }

  public handleScheduleCreate(instance: any, args: Record<string, any>): any {
    const { cronExpression, actionIntent, taskPrompt } = args;
    const proposalEvent: StandardEvent = {
      id: `evt-mcp-schedule-${Date.now()}`,
      type: EventTypes.SYSTEM_PROPOSE_GOAL,
      source: 'McpServer',
      timestamp: Date.now(),
      payload: {
        intent: 'SCHEDULE_GOAL',
        parameters: {
          scheduleType: 'cron',
          cronExpression: cronExpression || '0 */2 * * *',
          humanIntent: `Scheduled ${actionIntent}`,
          actionIntent: actionIntent || 'DYNAMIC_SCHEDULED_ACTION',
          actionParameters: { taskPrompt: taskPrompt || 'Execute automated background task.' }
        },
        userMessage: `Create schedule ${cronExpression}: ${taskPrompt}`
      }
    };
    instance.eventBus.emit(EventTypes.SYSTEM_PROPOSE_GOAL, proposalEvent);

    return {
      content: [{
        type: 'text',
        text: `✅ Background schedule proposal registered on Sera.\n\n• Cron: \`${cronExpression}\`\n• Action: \`${actionIntent}\`\n• Task: "${taskPrompt}"\n\n⚠️ Proposal is pending on your Sera dashboard.`
      }]
    };
  }
}
