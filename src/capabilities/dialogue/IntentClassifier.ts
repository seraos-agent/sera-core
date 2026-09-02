export interface WorkRoute {
  workClass: string;
  lane: string;
}

export interface ClassificationResult {
  intent: string;
  parameters: Record<string, any>;
  workRoute: WorkRoute;
}

/**
 * IntentClassifier — Native ReAct intent extraction.
 * Fast-path: All intent detection and function execution is handled natively
 * in the primary Qwen 3.8 call via Tool Calling.
 */
export class IntentClassifier {
  constructor() { }

  public async classify(userMessage: string, _activeAbortControllerSignal?: AbortSignal): Promise<ClassificationResult> {
    const workRoute: WorkRoute = {
      workClass: 'CONVERSATION',
      lane: 'EXECUTION'
    };

    return { 
      intent: 'NONE', 
      parameters: { _seraWorkClass: workRoute.workClass }, 
      workRoute 
    };
  }
}

