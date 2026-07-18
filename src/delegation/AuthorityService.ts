import { AuthorityContext, AuthorityDecision, DelegationScope } from './types';

export class AuthorityService {
  evaluate(context: AuthorityContext, scope: DelegationScope): AuthorityDecision {
    if (scope.principalId !== context.principalId) {
      return {
        status: 'DENIED',
        reason: 'Principal mismatch',
      };
    }

    if (scope.expiresAt && Date.now() > scope.expiresAt) {
      return {
        status: 'DENIED',
        reason: 'Delegation scope expired',
      };
    }

    const isAllowed = scope.allowedPermissions.some(
      (p) => p.action === context.action || p.action === '*'
    );

    if (!isAllowed) return {
      status: 'DENIED',
      reason: `Action ${context.action} is not explicitly permitted`,
    };

    const isRequiresApproval = scope.requiresApprovalPermissions.some(
      (p) => p.action === context.action || p.action === '*'
    );
    // Full Access is a prior approval represented by a live agreement. It
    // satisfies per-action approval only after the action is explicitly allowed.
    if (isRequiresApproval && scope.autonomyMode !== 'FULL_ACCESS') return {
      status: 'REQUIRES_APPROVAL',
      reason: `Action ${context.action} requires explicit approval`,
    };

    return {
      status: 'ALLOWED',
      reason: scope.autonomyMode === 'FULL_ACCESS'
        ? `Action ${context.action} is authorized by Operating Agreement ${scope.agreementId || scope.id}`
        : `Action ${context.action} is allowed`,
    };
  }
}
