import { ConstitutionContext, ConstitutionFinding, ConstitutionRule } from '../types';

export class DestructiveActionRule implements ConstitutionRule {
  id = 'rule-destructive-action';
  name = 'Destructive Action Rule';
  description = 'Flags actions containing delete, destroy, or remove as requiring confirmation.';
  enabled = true;

  evaluate(context: ConstitutionContext): ConstitutionFinding | null {
    if (!this.enabled) return null;

    const actionLower = context.action.toLowerCase();
    if (actionLower.includes('delete') || actionLower.includes('destroy') || actionLower.includes('remove')) {
      return {
        status: 'REQUIRES_CONFIRMATION',
        reason: 'Action is potentially destructive.',
        ruleId: this.id
      };
    }
    
    return null; // Does not apply
  }
}
