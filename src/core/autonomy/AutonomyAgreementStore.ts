import { AutonomyMode, DelegationScope, PermissionAction } from '../../delegation/types';

export type AutonomyAgreementStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

/**
 * The user-facing agreement that turns Full Access into explicit, auditable
 * authority. It is intentionally product-agnostic: a trading product is only
 * one possible consumer of the agreement.
 */
export interface AutonomyAgreement {
  id: string;
  principalId: string;
  title: string;
  intent: string;
  mode: AutonomyMode;
  permissions: readonly PermissionAction[];
  status: AutonomyAgreementStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  lastActionSummary?: string;
  nextActionSummary?: string;
  revocationReason?: string;
}

export interface CreateAutonomyAgreement {
  id?: string;
  principalId: string;
  title: string;
  intent: string;
  mode: AutonomyMode;
  permissions: readonly PermissionAction[];
  expiresAt?: number;
  nextActionSummary?: string;
}

export class AutonomyAgreementStore {
  private readonly agreements = new Map<string, AutonomyAgreement>();

  public activate(input: CreateAutonomyAgreement): AutonomyAgreement {
    if (!input.principalId.trim() || !input.title.trim() || !input.intent.trim()) throw new Error('Operating Agreement requires principal, title, and intent.');
    if (input.permissions.length === 0) throw new Error('Operating Agreement requires at least one permission.');
    const id = input.id || `agreement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (this.agreements.has(id)) throw new Error(`Operating Agreement ${id} already exists.`);
    const now = Date.now();
    const agreement: AutonomyAgreement = {
      id, principalId: input.principalId, title: input.title, intent: input.intent, mode: input.mode,
      permissions: [...new Set(input.permissions)], status: 'ACTIVE', createdAt: now, updatedAt: now,
      expiresAt: input.expiresAt, nextActionSummary: input.nextActionSummary
    };
    this.agreements.set(id, agreement);
    return { ...agreement, permissions: [...agreement.permissions] };
  }

  public get(id: string): AutonomyAgreement | undefined {
    this.expireIfNeeded(id);
    const agreement = this.agreements.get(id);
    return agreement && { ...agreement, permissions: [...agreement.permissions] };
  }

  public getAll(): AutonomyAgreement[] {
    for (const id of this.agreements.keys()) this.expireIfNeeded(id);
    return [...this.agreements.values()].map(agreement => ({ ...agreement, permissions: [...agreement.permissions] }));
  }

  public revoke(id: string, reason = 'Revoked by user'): AutonomyAgreement {
    const agreement = this.agreements.get(id);
    if (!agreement) throw new Error(`Operating Agreement ${id} does not exist.`);
    if (agreement.status !== 'ACTIVE') return { ...agreement, permissions: [...agreement.permissions] };
    agreement.status = 'REVOKED';
    agreement.revocationReason = reason;
    agreement.updatedAt = Date.now();
    return { ...agreement, permissions: [...agreement.permissions] };
  }

  public recordActivity(id: string, lastActionSummary: string, nextActionSummary?: string): void {
    const agreement = this.requireActive(id);
    agreement.lastActionSummary = lastActionSummary;
    agreement.nextActionSummary = nextActionSummary;
    agreement.updatedAt = Date.now();
  }

  public toDelegationScope(id: string): DelegationScope {
    const agreement = this.requireActive(id);
    return {
      id: `scope-${agreement.id}`,
      principalId: agreement.principalId,
      allowedPermissions: agreement.permissions.map(action => ({ action })),
      requiresApprovalPermissions: agreement.mode === 'ASSISTANT' ? agreement.permissions.map(action => ({ action })) : [],
      expiresAt: agreement.expiresAt,
      autonomyMode: agreement.mode,
      agreementId: agreement.id
    };
  }

  public hasFullAccessFor(action: PermissionAction): boolean {
    return this.getAll().some(agreement =>
      agreement.status === 'ACTIVE' &&
      agreement.mode === 'FULL_ACCESS' &&
      agreement.permissions.some(permission => permission === action || permission === '*')
    );
  }

  private requireActive(id: string): AutonomyAgreement {
    this.expireIfNeeded(id);
    const agreement = this.agreements.get(id);
    if (!agreement || agreement.status !== 'ACTIVE') throw new Error(`Operating Agreement ${id} is not active.`);
    return agreement;
  }

  private expireIfNeeded(id: string): void {
    const agreement = this.agreements.get(id);
    if (agreement?.status === 'ACTIVE' && agreement.expiresAt && Date.now() > agreement.expiresAt) {
      agreement.status = 'EXPIRED';
      agreement.updatedAt = Date.now();
    }
  }
}
