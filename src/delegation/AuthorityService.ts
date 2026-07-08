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

    const isRequiresApproval = scope.requiresApprovalPermissions.some(
      (p) => p.action === context.action
    );

    if (isRequiresApproval) {
      return {
        status: 'REQUIRES_APPROVAL',
        reason: `Action ${context.action} requires explicit approval`,
      };
    }

    const isAllowed = scope.allowedPermissions.some(
      (p) => p.action === context.action || p.action === '*'
    );

    if (isAllowed) {
      return {
        status: 'ALLOWED',
        reason: `Action ${context.action} is allowed`,
      };
    }

    return {
      status: 'DENIED',
      reason: `Action ${context.action} is not explicitly permitted`,
    };
  }
}
