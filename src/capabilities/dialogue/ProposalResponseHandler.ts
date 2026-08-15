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
