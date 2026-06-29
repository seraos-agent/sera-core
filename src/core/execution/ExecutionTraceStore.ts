import { ExecutionTrace } from './types';

export interface ExecutionTraceQuery {
  goalId?: string;
  finalOutcome?: 'SUCCESS' | 'FAILED' | 'PENDING';
  workerId?: string;
  toolId?: string;
  hasFailures?: boolean;
}

export class ExecutionTraceStore {
  private traces: ExecutionTrace[] = [];

  store(trace: ExecutionTrace): void {
    // In a real database, this would be an insert or upsert
    this.traces.push(trace);
  }

  getById(id: string): ExecutionTrace | undefined {
    return this.traces.find(t => t.id === id);
  }

  query(q: ExecutionTraceQuery): ExecutionTrace[] {
    return this.traces.filter(trace => {
      if (q.goalId && trace.goalId !== q.goalId) return false;
      if (q.finalOutcome && trace.finalOutcome !== q.finalOutcome) return false;
      if (q.workerId && !trace.workerAssignments.includes(q.workerId)) return false;
      if (q.toolId && !trace.toolCalls.includes(q.toolId)) return false;
      if (q.hasFailures !== undefined) {
        const hasFails = trace.failures.length > 0 || !trace.verificationResult || trace.finalOutcome === 'FAILED';
        if (q.hasFailures !== hasFails) return false;
      }
      return true;
    });
  }

  getAll(): ExecutionTrace[] {
    return [...this.traces];
  }
}
