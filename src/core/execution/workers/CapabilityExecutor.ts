import { ExecutionExecutor } from './ExecutionExecutor';
import { ExecutionTask, ExecutionEvent } from '../aios_types';
import { EventEmitter } from 'events';
import { Logger } from '../../logging/Logger';
import { CheckpointStore } from '../CheckpointStore';
import { EventTypes, GoalResultPayload, StandardEvent } from '../../../core/events/types';

export class CapabilityExecutor implements ExecutionExecutor {
  private logger = new Logger('CapabilityExecutor');

  constructor(
    private eventBus: EventEmitter,
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

        const stepRequestId = `req-${task.taskId}-${step.id}`;

        const result: GoalResultPayload = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, handler);
            reject(new Error(`Timeout waiting for capability execution of step ${step.id}`));
          }, 60000); // 60s timeout for safety, should be driven by ExecutionPolicy

          const handler = (event: StandardEvent<GoalResultPayload>) => {
            if (event.correlationId === stepRequestId) {
              clearTimeout(timeout);
              this.eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, handler);
              resolve(event.payload as GoalResultPayload);
            }
          };

          this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, handler);

          // Transition to paused state while waiting for the async action to complete
          this.eventBus.emit('system.execution.paused', {
            type: 'system.execution.paused',
            taskId: task.taskId,
            timestamp: Date.now(),
            payload: { waitCondition: { correlationId: stepRequestId } }
          } as ExecutionEvent);

          this.eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
            id: `evt-${Date.now()}`,
            type: EventTypes.DOMAIN_ACTION_DISPATCHED,
            source: 'CapabilityExecutor',
            payload: {
              actionType: step.action,
              actionPayload: step.payload,
              context: { triggerId: stepRequestId }
            },
            timestamp: Date.now()
          });
        });

        if (!result.success) {
          allSuccess = false;
          throw new Error(result.errorMessage || 'Step execution failed without explicit error');
        }
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
