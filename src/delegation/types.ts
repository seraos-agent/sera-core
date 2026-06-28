export type PermissionAction =
  | 'read_world_state'
  | 'write_memory'
  | 'create_work_item'
  | 'execute_work_item'
  | 'update_goal'
  | 'invoke_tool'
  | string;

export interface Permission {
  action: PermissionAction;
}

export interface DelegationScope {
  id: string;
  principalId: string;
  allowedPermissions: Permission[];
  requiresApprovalPermissions: Permission[];
  expiresAt?: number;
}

export interface AuthorityContext {
  principalId: string;
  goalId?: string;
  workItemId?: string;
  action: PermissionAction;
}

export type AuthorityDecisionStatus = 'ALLOWED' | 'DENIED' | 'REQUIRES_APPROVAL';

export interface AuthorityDecision {
  status: AuthorityDecisionStatus;
  reason: string;
}
