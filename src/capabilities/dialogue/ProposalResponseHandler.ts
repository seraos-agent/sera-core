import { EventEmitter } from 'events';
import { EventTypes } from '../../core/events/types';

/**
 * ProposalResponseHandler — Handles approval/rejection checks and operating agreement proposals.
 *
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 */
export class ProposalResponseHandler {
  constructor(private readonly eventBus: EventEmitter) {}

  public isApproval(message: string): boolean {
    return /^(?:yes|y|iya|ya|approve|approved|proceed|confirm|ok|okay|oke|kerjakan|jalankan|mulai|gas|lanjut|lakukan|setuju|acc|proses|gaskan|eksekusi)(?:\s+(?:kerjakan|jalankan|mulai|lakukan|proses|gaskan|sekali|dong|ya|aja|saja))?[.!\s]*$/i.test(message.trim());
  }

  public isRejection(message: string): boolean {
    return /^(?:no|n|tidak|batal|cancel|reject|deny|stop|jangan|gak|ga|tiada)[.!\s]*$/i.test(message.trim());
  }

  public preparePaperTradingFullAccessProposal(userMessage: string): boolean {
    const asksForPaperTrading = /\b(?:paper\s*(?:trading|trade))\b/i.test(userMessage);
    const asksForFullAccess = /\b(?:full\s*access)\b/i.test(userMessage);
    if (!asksForPaperTrading || !asksForFullAccess) return false;

    const coin = userMessage.match(/\b(BTC|ETH|SOL|HYPE)\b/i)?.[1]?.toUpperCase();
    const assetLabel = coin ? ` ${coin}` : '';
    this.emitEvent(EventTypes.SYSTEM_PROPOSE_GOAL, {
      intent: 'ACTIVATE_AUTONOMY_AGREEMENT',
      parameters: {
        title: `Paper trading${assetLabel}`,
        intent: `Manage${assetLabel} paper-trading activity`,
        mode: 'FULL_ACCESS',
        permissions: ['PAPER_TRADE'],
        nextActionSummary: `Paper-trading activity for${assetLabel || ' the selected asset'} is ready for explicit simulation requests.`
      },
      userMessage
    });

    this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
      text: `I prepared an agreement to manage paper trading${assetLabel}. Review the details in this card, then choose Approve if the scope and boundaries are right for you.`
    });

    return true;
  }

  private emitEvent(type: string, payload: Record<string, any>): void {
    this.eventBus.emit(type, {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      payload,
      timestamp: Date.now(),
      source: 'DialogueEngine'
    });
  }

  public generateInstantProposalSummary(toolIntent: string, toolParams: Record<string, any>): string {
    if (toolIntent === 'SCHEDULE_GOAL') {
      const humanIntent = toolParams.humanIntent || (toolParams.cronExpression ? `recurring schedule (${toolParams.cronExpression})` : 'schedule');
      const rawAction = toolParams.actionIntent ? toolParams.actionIntent.split('_').join(' ').toLowerCase() : 'action';
      const coin = toolParams.actionParameters?.coin ? ` (${toolParams.actionParameters.coin})` : '';
      return `Proposal for ${rawAction}${coin} ${humanIntent} has been prepared. Please click Approve on your screen to activate this automation.`;
    }

    if (toolIntent === 'TRANSFER_FUNDS') {
      const amount = toolParams.amount || '';
      const asset = (toolParams.asset || 'USDC').toUpperCase();
      return `Proposal to transfer ${amount} ${asset} has been prepared. Please click Approve on your screen to authorize this transaction.`;
    }

    const actionName = toolIntent.split('_').join(' ').toLowerCase();
    return `Proposal for ${actionName} has been prepared. Please click Approve on your screen to proceed.`;
  }
}
