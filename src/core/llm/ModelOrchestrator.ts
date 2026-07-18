import { EventEmitter } from 'events';
import { EventTypes, LlmModelExecutionPayload, StandardEvent } from '../events/types';
import { ExecutionProfile, ILLMAdapter, ModelExecutionTelemetry, RoutingPolicy } from './types';
import { ModelRegistry } from './ModelRegistry';

export class ModelOrchestrator {
  private registry: ModelRegistry;
  private policy: RoutingPolicy;

  constructor(registry: ModelRegistry, policy: RoutingPolicy, private eventBus?: EventEmitter) {
    this.registry = registry;
    this.policy = policy;
  }

  public async generate(
    profile: ExecutionProfile,
    messages: any[],
    tools?: any[],
    signal?: AbortSignal
  ): Promise<{ text: string; toolCalls?: any[]; usage?: any }> {
    console.log(`[ModelOrchestrator] Execution Profile Requested:`);
    console.log(`  └─ Tier: ${profile.tier}`);
    console.log(`  └─ Constraints: ${JSON.stringify(profile.constraints)}`);

    const candidates = this.policy.rankModels(profile, this.registry.getAdapters());
    if (candidates.length === 0) {
      throw new Error(`[ModelOrchestrator] No model available satisfying profile: ${JSON.stringify(profile)}`);
    }

    const failures: Error[] = [];
    for (const [index, adapter] of candidates.entries()) {
      if (signal?.aborted) throw new DOMException('The model request was aborted.', 'AbortError');

      const capability = adapter.getCapability();
      const startedAt = Date.now();
      console.log(`[ModelOrchestrator] Attempt ${index + 1}/${candidates.length}: ${capability.provider} / ${capability.model}`);
      try {
        const result = await adapter.generate(messages, tools, signal);
        this.emitTelemetry({
          ...this.createTelemetry(profile, capability, index + 1, startedAt, index > 0, result.usage),
        }, EventTypes.LLM_MODEL_COMPLETED);
        return result;
      } catch (error: any) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;

        const normalizedError = error instanceof Error ? error : new Error(String(error));
        failures.push(normalizedError);
        this.emitTelemetry({
          ...this.createTelemetry(profile, capability, index + 1, startedAt, index > 0),
          errorMessage: normalizedError.message
        }, EventTypes.LLM_MODEL_FAILED);
        console.warn(`[ModelOrchestrator] ${capability.provider} / ${capability.model} failed; trying the next eligible model.`, normalizedError.message);
      }
    }

    throw new AggregateError(failures, `[ModelOrchestrator] All eligible models failed for profile: ${JSON.stringify(profile)}`);
  }

  private createTelemetry(
    profile: ExecutionProfile,
    capability: ReturnType<ILLMAdapter['getCapability']>,
    attempt: number,
    startedAt: number,
    fallbackUsed: boolean,
    usage?: { input_tokens?: number; output_tokens?: number }
  ): ModelExecutionTelemetry {
    const inputTokens = usage?.input_tokens;
    const outputTokens = usage?.output_tokens;
    return {
      provider: capability.provider,
      model: capability.model,
      tier: profile.tier,
      attempt,
      latencyMs: Date.now() - startedAt,
      fallbackUsed,
      inputTokens,
      outputTokens,
      estimatedCost: ((inputTokens || 0) / 1_000 * capability.priceInput) + ((outputTokens || 0) / 1_000 * capability.priceOutput)
    };
  }

  private emitTelemetry(telemetry: ModelExecutionTelemetry, type: typeof EventTypes.LLM_MODEL_COMPLETED | typeof EventTypes.LLM_MODEL_FAILED): void {
    if (!this.eventBus) return;
    const event: StandardEvent<LlmModelExecutionPayload> = {
      id: `evt-llm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      source: 'ModelOrchestrator',
      timestamp: Date.now(),
      payload: telemetry
    };
    this.eventBus.emit(type, event);
  }
}
