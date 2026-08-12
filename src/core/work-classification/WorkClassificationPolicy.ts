export type WorkClass = 'INSTANT_UI' | 'CONVERSATION' | 'OPERATIONAL' | 'COMPLEX' | 'HIGH_RISK';

export interface WorkRoute {
  workClass: WorkClass;
  tokenBudget: number;
  allowTools: boolean;
  allowSwarm: boolean;
  requiresHumanApproval: boolean;
}

/** Universal, domain-agnostic escalation policy. Domain products may add rules, never weaken these boundaries. */
export class WorkClassificationPolicy {
  public classify(text: string): WorkRoute {
    const value = text.toLowerCase();

    // Bypass strict classification for system notifications
    if (value.includes('[system_notification]')) {
      return this.route('OPERATIONAL');
    }

    // Detect conditional or multi-step logic (e.g. "if balance > 10 then transfer")
    if (/\b(if|then|after|when)\b/.test(value) && /\b(transfer|check|send)\b/.test(value)) {
      return this.route('COMPLEX');
    }

    if (/\b(transfer|send|trade|buy|sell|deploy|production)\b/.test(value)) return this.route('HIGH_RISK');
    if (/\b(build|implement|refactor|audit|research|codebase|strategy)\b/.test(value)) return this.route('COMPLEX');
    if (/\b(check|search|status|balance|schedule|mode|theme|display|light|dark|clear|chat|history|delete|remove|reset|clean|switch|change|retry|monitor|report|track|every|interval|cron|minute|minutes|min|mins|sec|second|seconds|hour|hours|daily|weekly|btc|eth|sol|arb|hype|aero|brett|toshi|usdc|price|market|start|begin|proceed|yes|ok|okay|confirm)\b/i.test(value)) return this.route('OPERATIONAL');
    return this.route('CONVERSATION');
  }

  private route(workClass: WorkClass): WorkRoute {
    const routes: Record<WorkClass, WorkRoute> = {
      INSTANT_UI: { workClass, tokenBudget: 0, allowTools: false, allowSwarm: false, requiresHumanApproval: false },
      CONVERSATION: { workClass, tokenBudget: 1200, allowTools: true, allowSwarm: false, requiresHumanApproval: false },
      OPERATIONAL: { workClass, tokenBudget: 2400, allowTools: true, allowSwarm: false, requiresHumanApproval: false },
      COMPLEX: { workClass, tokenBudget: 7000, allowTools: false, allowSwarm: true, requiresHumanApproval: true },
      HIGH_RISK: { workClass, tokenBudget: 4000, allowTools: true, allowSwarm: false, requiresHumanApproval: true }
    };
    return routes[workClass];
  }
}
