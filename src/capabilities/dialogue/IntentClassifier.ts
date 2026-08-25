import { ModelOrchestrator } from '../../core/llm/ModelOrchestrator';
import { WorkClassificationPolicy, WorkRoute } from '../../core/work-classification/WorkClassificationPolicy';
import { ExecutionProfileBuilder } from './ExecutionProfileBuilder';
import { INTENT_EXTRACTION_PROMPT } from './SystemPrompts';

export interface ClassificationResult {
  intent: string;
  parameters: Record<string, any>;
  workRoute: WorkRoute;
}

/**
 * IntentClassifier — Classifies user intent using WorkClassificationPolicy and 1-shot LLM fallback.
 *
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 */
export class IntentClassifier {
  constructor(
    private readonly workClassificationPolicy: WorkClassificationPolicy,
    private readonly orchestrator: ModelOrchestrator
  ) { }

  public async classify(userMessage: string, _activeAbortControllerSignal?: AbortSignal): Promise<ClassificationResult> {
    const workRoute = this.workClassificationPolicy.classify(userMessage);

    // Fast-path Latency Optimization (Single-Turn Tool Calling):
    // All intent detection and function execution is handled natively in the primary
    // LLM call via Tool Calling, eliminating the redundant 1-shot LLM round-trip.
    const intent = 'NONE';
    const parameters: Record<string, any> = { _seraWorkClass: workRoute.workClass };

    return { intent, parameters, workRoute };
  }
}
