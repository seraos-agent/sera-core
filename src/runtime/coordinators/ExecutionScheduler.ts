import { EventEmitter } from 'events';
import { ExecutionTask, ExecutionState, ExecutionStateMachine, ExecutionInstance, ExecutionEvent } from '../../core/execution/aios_types';
import { PriorityQueue } from './PriorityQueue';
import { Logger } from '../../core/logging/Logger';
import { WorkerPool } from '../../core/execution/workers/WorkerPool';

export class ExecutionScheduler {
  private logger = new Logger('ExecutionScheduler');
  private activeInstances = new Map<string, ExecutionInstance>();
  private queue = new PriorityQueue<string>();
  private isProcessing = false;

  constructor(
    private workerPool: WorkerPool,
    private eventBus: EventEmitter
  ) {
    this.setupListeners();
  }

  private setupListeners() {
    this.eventBus.on('system.execution.timeout_detected', (event: ExecutionEvent) => {
      this.handleSupervisorCancel(event.taskId, 'TIMEOUT');
    });

    this.eventBus.on('system.execution.completed', (event: ExecutionEvent) => {
      this.handleWorkerResult(event.taskId, ExecutionState.COMPLETED);
    });

    this.eventBus.on('system.execution.failed', (event: ExecutionEvent) => {
      this.handleWorkerResult(event.taskId, ExecutionState.FAILED);
    });
  }

  public getActiveInstances(): Map<string, ExecutionInstance> {
    return this.activeInstances;
  }

  public submitTask(task: ExecutionTask): void {
    const instance: ExecutionInstance = {
      task,
      state: ExecutionState.QUEUED,
      retryCount: 0
    };

    if (!ExecutionStateMachine.canTransition(ExecutionState.QUEUED, ExecutionState.QUEUED)) {
      // Just a conceptual check, though QUEUED is the starting state
    }

    this.activeInstances.set(task.taskId, instance);
    this.queue.enqueue(task.taskId, task.context.priority);
    this.logger.info(`Task ${task.taskId} submitted. Priority: ${task.context.priority}`);
    
    this.eventBus.emit('system.execution.started', {
      type: 'system.execution.started',
      taskId: task.taskId,
      timestamp: Date.now()
    } as ExecutionEvent);

    this.wakeScheduler();
  }

  public wakeScheduler(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    setTimeout(() => this.processNext(), 0);
  }

  private async processNext(): Promise<void> {
    if (this.queue.isEmpty()) {
      this.isProcessing = false;
      this.logger.debug('Queue empty. Scheduler sleeping.');
      return;
    }

    // Peek first. If no worker is available, we shouldn't dequeue.
    const taskId = this.queue.peek();
    if (!taskId) {
      this.isProcessing = false;
      return;
    }

    const instance = this.activeInstances.get(taskId);
    if (!instance) {
      this.queue.dequeue(); // Stale entry
      return this.processNext();
    }

    if (instance.task.context.cancellationToken?.isCancelled()) {
      this.queue.dequeue();
      this.transitionState(instance, ExecutionState.CANCELLED);
      return this.processNext();
    }

    // Reserve a worker
    const worker = this.workerPool.reserveWorker(instance.task);
    if (!worker) {
      this.logger.debug(`No available worker for task ${taskId}. Scheduler sleeping until worker frees up.`);
      this.isProcessing = false;
      return; // Stop processing, we will wake up when a worker finishes
    }

    // Worker secured. Now dequeue and dispatch.
    this.queue.dequeue();
    
    if (this.transitionState(instance, ExecutionState.RUNNING)) {
      instance.startedAt = Date.now();
      instance.workerId = worker.id;
      
      // Fire and forget, the worker will emit an event when done
      worker.execute(instance.task).catch(err => {
        this.logger.error(`Worker threw unhandled exception on dispatch for task ${taskId}`, err);
        this.transitionState(instance, ExecutionState.FAILED);
      });
    }

    // Continue processing the queue for other tasks
    this.processNext();
  }

  private handleWorkerResult(taskId: string, finalState: ExecutionState) {
    const instance = this.activeInstances.get(taskId);
    if (!instance) return;

    if (this.transitionState(instance, finalState)) {
      instance.completedAt = Date.now();
      // Worker is now idle, wake scheduler to assign more work
      this.wakeScheduler();
    }
  }

  private handleSupervisorCancel(taskId: string, reason: string) {
    const instance = this.activeInstances.get(taskId);
    if (!instance) return;
    
    this.logger.warn(`Supervisor requested cancellation for ${taskId}: ${reason}`);
    this.transitionState(instance, ExecutionState.CANCELLED);
  }

  public transitionState(instance: ExecutionInstance, newState: ExecutionState): boolean {
    if (!ExecutionStateMachine.canTransition(instance.state, newState)) {
      this.logger.warn(`Illegal state transition for ${instance.task.taskId}: ${instance.state} -> ${newState}`);
      return false;
    }
    
    instance.state = newState;
    
    const eventTypeMap: Record<ExecutionState, string> = {
      [ExecutionState.QUEUED]: 'system.execution.progress',
      [ExecutionState.RUNNING]: 'system.execution.progress',
      [ExecutionState.PAUSED]: 'system.execution.paused',
      [ExecutionState.WAITING_CONDITION]: 'system.execution.paused',
      [ExecutionState.WAITING_APPROVAL]: 'system.execution.paused',
      [ExecutionState.RETRYING]: 'system.execution.progress',
      [ExecutionState.COMPLETED]: 'system.execution.completed',
      [ExecutionState.FAILED]: 'system.execution.failed',
      [ExecutionState.CANCELLED]: 'system.execution.cancelled',
      [ExecutionState.ARCHIVED]: 'system.execution.progress',
    };

    const type = eventTypeMap[newState];
    if (type) {
      const payload: any = { state: newState };
      
      // Calculate total latency if completed
      if (newState === ExecutionState.COMPLETED && instance.task.context.createdAt) {
        payload.latencyMs = Date.now() - instance.task.context.createdAt;
      }
      
      this.eventBus.emit(type, {
        type,
        taskId: instance.task.taskId,
        timestamp: Date.now(),
        payload
      } as ExecutionEvent);
    }
    
    return true;
  }
}
