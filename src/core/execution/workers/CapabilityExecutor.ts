import { ExecutionExecutor } from './ExecutionExecutor';
import { ExecutionTask, ExecutionEvent } from '../aios_types';
import { EventEmitter } from 'events';
import { WorkerManager } from '../../../workers/WorkerManager';
import { Logger } from '../../logging/Logger';
import { CheckpointStore } from '../CheckpointStore';

import { WorkItem, WorkItemStatus } from '../../../core/work-items/types';

export class CapabilityExecutor implements ExecutionExecutor {
  private logger = new Logger('CapabilityExecutor');

  constructor(
    private eventBus: EventEmitter,
    private workerManager: WorkerManager,
    private checkpointStore: CheckpointStore
  ) {}

  public isHealthy(): boolean {
    return true; 
  }

  public async execute(task: ExecutionTask): Promise<void> {
    this.logger.debug(`Executing task ${task.taskId} via CapabilityExecutor`);

    try {
      this.eventBus.emit('system.execution.progress', {
        type: 'system.execution.progress',
        taskId: task.taskId,
        timestamp: Date.now(),
        payload: { message: 'Capability execution started' }
      } as ExecutionEvent);

      if (!task.checkpointId) {
        throw new Error('Task does not have a checkpointId');
      }

      const checkpoint = await this.checkpointStore.load(task.checkpointId);
      if (!checkpoint || !checkpoint.plan) {
        throw new Error(`Checkpoint data missing or malformed for task ${task.taskId}`);
      }

      const plan = checkpoint.plan;
      let allSuccess = true;

      for (const step of plan.steps) {
        if (task.context.cancellationToken?.isCancelled()) {
          throw new Error('Execution Cancelled');
        }

        const workItem: WorkItem = {
          id: `wi-${Date.now()}`,
          goalId: task.context.goalId || 'unknown-goal',
          planId: task.context.planId || '',
          planStepId: step.id,
          action: step.action,
          payload: step.payload,
          status: 'PENDING' as WorkItemStatus,
          createdAt: Date.now()
        };

        const result = await this.workerManager.dispatch(workItem);
        if (result.status !== 'SUCCESS') {
          allSuccess = false;
          break;
        }
      }
      
      if (!allSuccess) {
        throw new Error('Step execution failed');
      }

      this.eventBus.emit('system.execution.completed', {
        type: 'system.execution.completed',
        taskId: task.taskId,
        timestamp: Date.now(),
        payload: { result: 'Success' }
      } as ExecutionEvent);

    } catch (err: any) {
      this.logger.error(`Task ${task.taskId} failed during execution`, err);
      this.eventBus.emit('system.execution.failed', {
        type: 'system.execution.failed',
        taskId: task.taskId,
        timestamp: Date.now(),
        payload: { error: err.message }
      } as ExecutionEvent);
    }
  }
}
