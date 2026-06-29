import { IntentStore } from './IntentStore';
import { GoalEngine } from '../goals/GoalEngine';
import { RepresentationAuditReport, RepresentationGap, IntentCoverage } from './types';
import { TemporalContext } from '../temporal/types';

export class IntentEngine {
  constructor(
    private intentStore: IntentStore,
    private goalEngine: GoalEngine
  ) {}

  auditRepresentations(temporalContext: TemporalContext): RepresentationAuditReport {
    const activeIntents = this.intentStore.getAllActiveIntents();
    const coverage: IntentCoverage[] = [];
    const gaps: RepresentationGap[] = [];

    for (const intent of activeIntents) {
      const representingGoals = this.goalEngine.getRepresentingGoals(intent.id);
      let activeGoals = 0;
      let blockedGoals = 0;
      let dormantGoals = 0;

      for (const goal of representingGoals) {
        if (goal.status === 'PENDING' || goal.status === 'IN_PROGRESS') activeGoals++;
        else if (goal.status === 'BLOCKED') blockedGoals++;
        else if (goal.status === 'DORMANT') dormantGoals++;
      }

      const represented = activeGoals > 0 || blockedGoals > 0 || dormantGoals > 0;

      coverage.push({
        intentId: intent.id,
        activeGoals,
        blockedGoals,
        dormantGoals,
        represented
      });

      if (!represented) {
        gaps.push({
          intentId: intent.id,
          reason: 'NO_ACTIVE_REPRESENTATION',
          detectedAt: temporalContext.physicalTime
        });
      }
    }

    const report: RepresentationAuditReport = {
      timestamp: temporalContext.physicalTime,
      coverage,
      gaps
    };

    this.logAuditReport(report);
    return report;
  }

  private logAuditReport(report: RepresentationAuditReport): void {
    if (report.gaps.length > 0) {
      console.log(`\n[IntentEngine] Representation Audit completed. Found ${report.gaps.length} gap(s).`);
      for (const gap of report.gaps) {
        console.log(`  -> Intent ${gap.intentId} remains alive but currently has no active representation.`);
      }
    } else {
      console.log(`\n[IntentEngine] Representation Audit completed. All Intents are represented.`);
    }
  }
}
