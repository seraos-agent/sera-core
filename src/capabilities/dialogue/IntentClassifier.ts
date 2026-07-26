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

  public async classify(userMessage: string, activeAbortControllerSignal?: AbortSignal): Promise<ClassificationResult> {
    const workRoute = this.workClassificationPolicy.classify(userMessage);

    let intent = 'NONE';
    let parameters: Record<string, any> = {};

    if (workRoute.workClass !== 'CONVERSATION') {
      // Fast-path Latency Optimization:
      // If workClass is CONVERSATION, bypass 1-shot LLM intent extraction
      try {
        const messages = [
          { role: 'system', content: INTENT_EXTRACTION_PROMPT },
          { role: 'user', content: userMessage }
        ];
        const profile = ExecutionProfileBuilder.forTier('Execution')
          .withEstimatedInputTokens(Math.ceil(JSON.stringify(messages).length / 4))
          .requiresJSON()
          .build();

        const response = await this.orchestrator.generate(profile, messages, undefined, activeAbortControllerSignal);
        const parsed = JSON.parse(response.text.trim());
        intent = parsed.intent || 'NONE';
        parameters = parsed.parameters || {};
      } catch {
        intent = 'NONE';
        parameters = {};
      }
    }

    parameters = { ...parameters, _seraWorkClass: workRoute.workClass };
    return { intent, parameters, workRoute };
  }
}
