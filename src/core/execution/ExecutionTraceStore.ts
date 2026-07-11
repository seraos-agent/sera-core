import { EventEmitter } from 'events';
import { ExecutionTrace, ExecutionEvent } from './types';

export interface ExecutionTraceQuery {
  goalId?: string;
  finalOutcome?: 'SUCCESS' | 'FAILED' | 'PENDING';
  workerId?: string;
  toolId?: string;
  hasFailures?: boolean;
}

export class ExecutionTraceStore {
  private traces: ExecutionTrace[] = [];

  constructor(private eventBus?: EventEmitter) {
    if (this.eventBus) {
      this.setupListeners();
    }
  }

  private setupListeners() {
    this.eventBus!.on('system.execution.started', (event: ExecutionEvent) => this.handleExecutionEvent(event, 'RUNNING'));
    this.eventBus!.on('system.execution.progress', (event: ExecutionEvent) => this.handleExecutionEvent(event, event.payload?.state || 'PROGRESS'));
    this.eventBus!.on('system.execution.paused', (event: ExecutionEvent) => this.handleExecutionEvent(event, 'PAUSED'));
    this.eventBus!.on('system.execution.completed', (event: ExecutionEvent) => this.handleExecutionCompleted(event));
    this.eventBus!.on('system.execution.failed', (event: ExecutionEvent) => this.handleExecutionFailed(event));
    this.eventBus!.on('system.execution.cancelled', (event: ExecutionEvent) => this.handleExecutionFailed(event));
  }

  private handleExecutionEvent(event: ExecutionEvent, state: string) {
    const trace = this.getByTaskId(event.taskId);
    if (trace) {
      trace.timeline.push({ state, timestamp: event.timestamp });
    }
  }

  private handleExecutionCompleted(event: ExecutionEvent) {
    const trace = this.getByTaskId(event.taskId);
    if (trace) {
      trace.finalOutcome = 'SUCCESS';
      trace.completedAt = event.timestamp;
      trace.timeline.push({ state: 'COMPLETED', timestamp: event.timestamp });
    }
  }

  private handleExecutionFailed(event: ExecutionEvent) {
    const trace = this.getByTaskId(event.taskId);
    if (trace) {
      trace.finalOutcome = 'FAILED';
      trace.completedAt = event.timestamp;
      trace.timeline.push({ state: 'FAILED', timestamp: event.timestamp });
      if (event.payload?.error) {
        trace.failures.push(event.payload.error);
      }
    }
  }

  store(trace: ExecutionTrace): void {
    // In a real database, this would be an insert or upsert
    this.traces.push(trace);
  }

  getById(id: string): ExecutionTrace | undefined {
    return this.traces.find(t => t.id === id);
  }

  getByTaskId(taskId: string): ExecutionTrace | undefined {
    return this.traces.find(t => t.taskId === taskId);
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
