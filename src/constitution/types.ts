export interface ConstitutionContext {
  principalId: string;
  goalId?: string;
  workItemId?: string;
  action: string;
  metadata?: Record<string, any>;
}

export type ConstitutionStatus = 'ALLOWED' | 'REQUIRES_CONFIRMATION' | 'DENIED';

export interface ConstitutionFinding {
  status: ConstitutionStatus;
  reason: string;
  ruleId: string;
}

export interface ConstitutionDecision {
  status: ConstitutionStatus;
  reason: string;
  ruleId?: string; // The rule that caused the escalation (if any)
  findings: ConstitutionFinding[];
}

export interface ConstitutionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  evaluate(context: ConstitutionContext): ConstitutionFinding | null;
}
