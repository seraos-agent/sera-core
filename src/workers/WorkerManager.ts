import { Worker, WorkerResult } from './types';
import { WorkItem } from '../core/work-items/types';

export class WorkerManager {
  private workers: Map<string, Worker> = new Map();

  register(worker: Worker): void {
    this.workers.set(worker.id, worker);
    console.log(`[WorkerManager] Registered Worker: ${worker.id}`);
  }

  private selectWorker(workItem: WorkItem): Worker {
    // For Phase 2.2, we just pick the first available worker.
    // In the future, SERA evaluates metadata or capabilities here.
    const availableWorkers = Array.from(this.workers.values());
    
    if (availableWorkers.length === 0) {
      throw new Error('[WorkerManager] No workers available to handle WorkItem');
    }

    return availableWorkers[0];
  }

  async dispatch(workItem: WorkItem): Promise<WorkerResult> {
    console.log(`[WorkerManager] Dispatching WorkItem: ${workItem.id}`);
    
    const worker = this.selectWorker(workItem);
    console.log(`[WorkerManager] Selected Worker: ${worker.id}`);

    try {
      const result = await worker.execute(workItem);
      return result;
    } catch (error: any) {
      console.log(`[WorkerManager] Worker execution failed:`, error.message);
      return {
        status: 'FAILURE',
        events: []
      };
    }
  }
}
