import { WorkItem } from '../core/work-items/types';
import { Event } from '../core/events/types';

export class Executor {
  /**
   * Executes a WorkItem and produces an Event representing the outcome.
   */
  async execute(workItem: WorkItem): Promise<Event> {
    console.log(`[Executor] Executing WorkItem: ${workItem.id} (Action: ${workItem.action})`);
    
    // Simulate execution time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    workItem.status = 'COMPLETED';

    // Produce an event based on the execution
    const event: Event = {
      id: `evt-${Date.now()}`,
      type: `${workItem.action}_COMPLETED`,
      payload: workItem.payload, // Simulated resulting state change
      timestamp: Date.now()
    };

    console.log(`[Executor] Produced Event: ${event.type}`);
    return event;
  }
}
