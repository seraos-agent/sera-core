import { ExecutionWorker, WorkerState } from './ExecutionWorker';
import { ExecutionTask } from '../aios_types';
import { Logger } from '../../logging/Logger';

export class WorkerPool {
  private workers: Map<string, ExecutionWorker> = new Map();
  private logger = new Logger('WorkerPool');

  public registerWorker(worker: ExecutionWorker): void {
    if (this.workers.has(worker.id)) {
      throw new Error(`Worker ${worker.id} is already registered`);
    }
    this.workers.set(worker.id, worker);
    this.logger.debug(`Registered worker ${worker.id} with affinity: ${worker.affinity.join(',')}`);
  }

  public reserveWorker(task: ExecutionTask): ExecutionWorker | undefined {
    // 1. Try to find an IDLE worker that matches affinity (e.g. origin)
    for (const worker of this.workers.values()) {
      if (worker.getState() === WorkerState.IDLE && worker.isHealthy()) {
        if (worker.affinity.length === 0 || worker.affinity.includes(task.context.origin)) {
          worker.setState(WorkerState.RESERVED);
          this.logger.debug(`Reserved worker ${worker.id} for task ${task.taskId}`);
          return worker;
        }
      }
    }
    return undefined;
  }

  public getWorker(id: string): ExecutionWorker | undefined {
    return this.workers.get(id);
  }

  public getHealthStatus(): { total: number; idle: number; running: number; failed: number } {
    let idle = 0, running = 0, failed = 0;
    for (const w of this.workers.values()) {
      switch(w.getState()) {
        case WorkerState.IDLE: idle++; break;
        case WorkerState.RUNNING:
        case WorkerState.RESERVED: running++; break;
        case WorkerState.FAILED: failed++; break;
      }
    }
    return { total: this.workers.size, idle, running, failed };
  }
}
