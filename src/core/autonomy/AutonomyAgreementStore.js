export class AutonomyAgreementStore {
    agreements = new Map();
    activate(input) {
        if (!input.principalId.trim() || !input.title.trim() || !input.intent.trim())
            throw new Error('Operating Agreement requires principal, title, and intent.');
        if (input.permissions.length === 0)
            throw new Error('Operating Agreement requires at least one permission.');
        if (input.mode === 'FULL_ACCESS' && input.permissions.includes('*')) {
            if (!input.allowedToolChains || input.allowedToolChains.length === 0) {
                throw new Error('Operating Agreement rejected: FULL_ACCESS with wildcard permission "*" requires explicitly defined allowedToolChains.');
            }
        }
        const id = input.id || `agreement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        if (this.agreements.has(id))
            throw new Error(`Operating Agreement ${id} already exists.`);
        const now = Date.now();
        const agreement = {
            id, principalId: input.principalId, title: input.title, intent: input.intent, mode: input.mode,
            permissions: [...new Set(input.permissions)], status: 'ACTIVE', createdAt: now, updatedAt: now,
            expiresAt: input.expiresAt, nextActionSummary: input.nextActionSummary,
            allowedToolChains: input.allowedToolChains
        };
        this.agreements.set(id, agreement);
        return { ...agreement, permissions: [...agreement.permissions] };
    }
    get(id) {
        this.expireIfNeeded(id);
        const agreement = this.agreements.get(id);
        return agreement && { ...agreement, permissions: [...agreement.permissions] };
    }
    getAll() {
        for (const id of this.agreements.keys())
            this.expireIfNeeded(id);
        return [...this.agreements.values()].map(agreement => ({ ...agreement, permissions: [...agreement.permissions] }));
    }
    revoke(id, reason = 'Revoked by user') {
        const agreement = this.agreements.get(id);
        if (!agreement)
            throw new Error(`Operating Agreement ${id} does not exist.`);
        if (agreement.status !== 'ACTIVE')
            return { ...agreement, permissions: [...agreement.permissions] };
        agreement.status = 'REVOKED';
        agreement.revocationReason = reason;
        agreement.updatedAt = Date.now();
        return { ...agreement, permissions: [...agreement.permissions] };
    }
    recordActivity(id, lastActionSummary, nextActionSummary) {
        const agreement = this.requireActive(id);
        agreement.lastActionSummary = lastActionSummary;
        agreement.nextActionSummary = nextActionSummary;
        agreement.updatedAt = Date.now();
    }
    toDelegationScope(id) {
        const agreement = this.requireActive(id);
        return {
            id: `scope-${agreement.id}`,
            principalId: agreement.principalId,
            allowedPermissions: agreement.permissions.map(action => ({ action })),
            requiresApprovalPermissions: agreement.mode === 'ASSISTANT' ? agreement.permissions.map(action => ({ action })) : [],
            expiresAt: agreement.expiresAt,
            autonomyMode: agreement.mode,
            agreementId: agreement.id,
            allowedToolChains: agreement.allowedToolChains
        };
    }
    hasFullAccessFor(action, principalId) {
        return this.getAll().some(agreement => agreement.status === 'ACTIVE' &&
            (!principalId || agreement.principalId === principalId) &&
            agreement.mode === 'FULL_ACCESS' &&
            agreement.permissions.some(permission => permission === action || permission === '*'));
    }
    requireActive(id) {
        this.expireIfNeeded(id);
        const agreement = this.agreements.get(id);
        if (!agreement || agreement.status !== 'ACTIVE')
            throw new Error(`Operating Agreement ${id} is not active.`);
        return agreement;
    }
    expireIfNeeded(id) {
        const agreement = this.agreements.get(id);
        if (agreement?.status === 'ACTIVE' && agreement.expiresAt && Date.now() > agreement.expiresAt) {
            agreement.status = 'EXPIRED';
            agreement.updatedAt = Date.now();
        }
    }
}
