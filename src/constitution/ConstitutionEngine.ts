import { ConstitutionContext, ConstitutionDecision, ConstitutionRule } from './types';

export class ConstitutionEngine {
  private rules: Map<string, ConstitutionRule> = new Map();

  register(rule: ConstitutionRule): void {
    this.rules.set(rule.id, rule);
    console.log(`[ConstitutionEngine] Registered Rule: ${rule.id}`);
  }

  evaluate(context: ConstitutionContext): ConstitutionDecision {
    const findings = [];
    let finalStatus: 'ALLOWED' | 'REQUIRES_CONFIRMATION' | 'DENIED' = 'ALLOWED';
    let finalReason = 'All rules passed.';
    let escalatingRuleId: string | undefined = undefined;

    for (const rule of this.rules.values()) {
      const finding = rule.evaluate(context);
      if (finding) {
        findings.push(finding);
        
        // Priority: DENIED > REQUIRES_CONFIRMATION > ALLOWED
        if (finding.status === 'DENIED' && finalStatus !== 'DENIED') {
          finalStatus = 'DENIED';
          finalReason = finding.reason;
          escalatingRuleId = finding.ruleId;
        } else if (finding.status === 'REQUIRES_CONFIRMATION' && finalStatus === 'ALLOWED') {
          finalStatus = 'REQUIRES_CONFIRMATION';
          finalReason = finding.reason;
          escalatingRuleId = finding.ruleId;
        }
      }
    }

    return {
      status: finalStatus,
      reason: finalReason,
      ruleId: escalatingRuleId,
      findings
    };
  }
}
