import { Worker, WorkerResult } from './types';
import { WorkItem } from '../core/work-items/types';
import { Event } from '../core/events/types';
import { ToolRuntime } from '../tools/ToolRuntime';
import { VerificationService } from '../tools/VerificationService';

export class ToolWorker implements Worker {
  id: string;
  private toolRuntime: ToolRuntime;
  private verificationService: VerificationService;

  constructor(id: string, toolRuntime: ToolRuntime, verificationService: VerificationService) {
    this.id = id;
    this.toolRuntime = toolRuntime;
    this.verificationService = verificationService;
  }

  async execute(workItem: WorkItem): Promise<WorkerResult> {
    console.log(`[Worker ${this.id}] Executing WorkItem: ${workItem.id}`);
    
    const toolId = workItem.payload?.toolId || 'mock-read-tool';
    
    const toolResult = await this.toolRuntime.execute({
      toolId: toolId,
      action: workItem.action,
      payload: workItem.payload,
    });

    const verificationResult = await this.verificationService.verify(toolResult);

    if (toolResult.status === 'SUCCESS' && verificationResult.verified) {
      console.log(`[Worker ${this.id}] Execution and Verification succeeded.`);
      const event: Event = {
        id: `evt-${Date.now()}`,
        type: `${workItem.action}_COMPLETED`,
        source: 'ToolWorker',
        payload: {
          output: toolResult.output,
          evidence: verificationResult.evidence
        },
        timestamp: Date.now()
      };
      return {
        status: 'SUCCESS',
        events: [event]
      };
    }

    console.log(`[Worker ${this.id}] Execution or Verification failed.`);
    return {
      status: 'FAILURE',
      events: []
    };
  }
}
