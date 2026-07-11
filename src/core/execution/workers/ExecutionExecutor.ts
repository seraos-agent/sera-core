import { ExecutionTask } from '../aios_types';

export interface ExecutionExecutor {
  /**
   * Executes the task asynchronously.
   * Does NOT return a result directly to the scheduler.
   * Instead, implementations should emit an ExecutionEvent to the EventBus.
   */
  execute(task: ExecutionTask): Promise<void>;
  
  /**
   * Indicates whether this executor is currently healthy/available.
   */
  isHealthy(): boolean;
}
