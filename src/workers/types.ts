import { Event } from '../core/events/types';
import { WorkItem } from '../core/work-items/types';

export interface WorkerResult {
  status: 'SUCCESS' | 'FAILURE';
  events: Event[];
  metadata?: Record<string, any>;
}

export interface Worker {
  id: string;
  execute(workItem: WorkItem): Promise<WorkerResult>;
}
