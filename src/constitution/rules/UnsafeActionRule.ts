import { ConstitutionContext, ConstitutionFinding, ConstitutionRule } from '../types';

export class UnsafeActionRule implements ConstitutionRule {
  id = 'rule-unsafe-action';
  name = 'Unsafe Action Rule';
  description = 'Denies actions explicitly marked as unsafe in metadata.';
  enabled = true;

  evaluate(context: ConstitutionContext): ConstitutionFinding | null {
    if (!this.enabled) return null;

    if (context.metadata?.unsafe === true) {
      return {
        status: 'DENIED',
        reason: 'Action is explicitly marked as unsafe.',
        ruleId: this.id
      };
    }
    
    return null;
  }
}
