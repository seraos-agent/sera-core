import { ExecutionExecutor } from './ExecutionExecutor';
import { ExecutionTask } from '../aios_types';
import { Logger } from '../../logging/Logger';

export enum WorkerState {
  IDLE = 'IDLE',
  RESERVED = 'RESERVED',
  RUNNING = 'RUNNING',
  FAILED = 'FAILED'
}

export class ExecutionWorker {
  private state: WorkerState = WorkerState.IDLE;
  private logger: Logger;

  constructor(
    public readonly id: string,
    private executor: ExecutionExecutor,
    public readonly affinity: string[] = [] // e.g. ['slack', 'discord']
  ) {
    this.logger = new Logger(`Worker-${id}`);
  }

  public getState(): WorkerState {
    return this.state;
  }

  public setState(state: WorkerState): void {
    this.state = state;
  }

  public async execute(task: ExecutionTask): Promise<void> {
    if (this.state !== WorkerState.RESERVED) {
      throw new Error(`Worker ${this.id} is not in RESERVED state (current: ${this.state})`);
    }

    this.state = WorkerState.RUNNING;
    this.logger.debug(`Executing task ${task.taskId}`);

    try {
      // The executor is fully asynchronous and emits its own completion events
      await this.executor.execute(task);
      this.state = WorkerState.IDLE;
    } catch (e) {
      this.logger.error(`Worker failed ungracefully on task ${task.taskId}`, e);
      this.state = WorkerState.FAILED;
      // Ideally emit a failed event here if the executor crashed completely
    }
  }

  public isHealthy(): boolean {
    return this.executor.isHealthy() && this.state !== WorkerState.FAILED;
  }
}
