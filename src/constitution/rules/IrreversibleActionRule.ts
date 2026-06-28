import { ConstitutionContext, ConstitutionFinding, ConstitutionRule } from '../types';

export class IrreversibleActionRule implements ConstitutionRule {
  id = 'rule-irreversible-action';
  name = 'Irreversible Action Rule';
  description = 'Flags actions marked as irreversible in metadata.';
  enabled = true;

  evaluate(context: ConstitutionContext): ConstitutionFinding | null {
    if (!this.enabled) return null;

    if (context.metadata?.irreversible === true) {
      return {
        status: 'REQUIRES_CONFIRMATION',
        reason: 'Action is explicitly marked as irreversible.',
        ruleId: this.id
      };
    }
    
    return null;
  }
}
