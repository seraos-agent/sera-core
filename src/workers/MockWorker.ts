import { Worker, WorkerResult } from './types';
import { WorkItem } from '../core/work-items/types';
import { Event } from '../core/events/types';

export class MockWorker implements Worker {
  id: string;

  constructor(id: string = `mock-worker-${Date.now()}`) {
    this.id = id;
  }

  async execute(workItem: WorkItem): Promise<WorkerResult> {
    console.log(`[Worker ${this.id}] Executing WorkItem: ${workItem.id} (Action: ${workItem.action})`);
    
    // Simulate execution
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const event: Event = {
      id: `evt-${Date.now()}`,
      type: `${workItem.action}_COMPLETED`,
      payload: workItem.payload,
      timestamp: Date.now()
    };

    console.log(`[Worker ${this.id}] Produced Event: ${event.type}`);

    return {
      status: 'SUCCESS',
      events: [event]
    };
  }
}
