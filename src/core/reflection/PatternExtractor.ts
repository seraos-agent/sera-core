import { ExecutionTrace } from '../execution/types';
import { ReflectionPattern } from './types';

export class PatternExtractor {
  
  extractPatterns(traces: ExecutionTrace[]): ReflectionPattern[] {
    const patterns: ReflectionPattern[] = [];
    console.log(`[PatternExtractor] Analyzing ${traces.length} traces.`);
    
    // Pattern 1: Repeated Tool Failure
    const toolFailures: Record<string, string[]> = {};
    for (const trace of traces) {
      if (trace.finalOutcome === 'FAILED' || !trace.verificationResult) {
        for (const tool of trace.toolCalls) {
          if (!toolFailures[tool]) toolFailures[tool] = [];
          toolFailures[tool].push(trace.id);
        }
      }
    }

    for (const [tool, traceIds] of Object.entries(toolFailures)) {
      if (traceIds.length >= 3) {
        patterns.push({
          id: `pat-tool-fail-${Date.now()}-${tool}`,
          type: 'REPEATED_FAILURE',
          confidence: Math.min(0.5 + (traceIds.length * 0.1), 0.95),
          supportingTraceIds: traceIds,
          description: `Tool ${tool} has failed consistently (${traceIds.length} times) in recent execution history.`
        });
      }
    }

    // Pattern 2: Governance Conflict
    const govConflicts: Record<string, string[]> = {};
    for (const trace of traces) {
      if (trace.finalOutcome === 'FAILED' && trace.governanceContext) {
        if (trace.governanceContext.constitution?.decision === 'DENIED') {
          const rules = trace.governanceContext.constitution.triggeredRules.join(',');
          if (!govConflicts[rules]) govConflicts[rules] = [];
          govConflicts[rules].push(trace.id);
        }
      }
    }

    for (const [rules, traceIds] of Object.entries(govConflicts)) {
      if (traceIds.length >= 2) {
        patterns.push({
          id: `pat-gov-conflict-${Date.now()}`,
          type: 'GOVERNANCE_CONFLICT',
          confidence: Math.min(0.6 + (traceIds.length * 0.1), 0.95),
          supportingTraceIds: traceIds,
          description: `Repeated execution denials due to Constitution Rules: ${rules} (${traceIds.length} times).`
        });
      }
    }

    return patterns;
  }
}
