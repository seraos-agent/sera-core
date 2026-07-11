import { EventEmitter } from 'events';
import { Logger } from '../logging/Logger';
import { WorkerPool } from './workers/WorkerPool';
import { ExecutionInstance, ExecutionEvent } from './aios_types';

export class ExecutionSupervisor {
  private logger = new Logger('ExecutionSupervisor');
  private intervalId?: NodeJS.Timeout;

  constructor(
    private eventBus: EventEmitter,
    private workerPool: WorkerPool,
    private activeInstances: Map<string, ExecutionInstance>
  ) {}

  public start(intervalMs: number = 5000): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.monitor(), intervalMs);
    this.logger.debug('ExecutionSupervisor started');
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private monitor(): void {
    const now = Date.now();
    
    // 1. Check for Timeouts
    for (const [taskId, instance] of this.activeInstances.entries()) {
      if (instance.state === 'RUNNING' && instance.startedAt) {
        const elapsed = now - instance.startedAt;
        const timeoutMs = instance.task.policySnapshot.timeout.timeoutMs;
        
        if (timeoutMs > 0 && elapsed > timeoutMs) {
          this.logger.warn(`Task ${taskId} timed out after ${elapsed}ms`);
          this.eventBus.emit('system.execution.timeout_detected', {
            type: 'system.execution.timeout_detected',
            taskId,
            timestamp: now,
            payload: { elapsed, timeoutMs }
          } as ExecutionEvent);
        }
      }
    }

    // 2. Worker Pool Health
    const health = this.workerPool.getHealthStatus();
    if (health.failed > 0) {
      this.logger.error(`CRITICAL: ${health.failed} workers are in FAILED state! Recovery needed.`);
      // Emit worker failure events here if we tracked worker IDs more deeply in the supervisor
    }
  }
}
