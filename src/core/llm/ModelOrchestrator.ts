import { ExecutionProfile, RoutingPolicy } from './types';
import { ModelRegistry } from './ModelRegistry';

export class ModelOrchestrator {
  private registry: ModelRegistry;
  private policy: RoutingPolicy;

  constructor(registry: ModelRegistry, policy: RoutingPolicy) {
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

    const adapter = this.policy.selectModel(profile, this.registry.getAdapters());

    if (!adapter) {
      throw new Error(`[ModelOrchestrator] No model available satisfying profile: ${JSON.stringify(profile)}`);
    }

    const cap = adapter.getCapability();
    console.log(`[ModelOrchestrator] Selected Model:`);
    console.log(`  └─ ${cap.provider} / ${cap.model}`);
    console.log(`  └─ Reason: Best Match based on RoutingPolicy`);

    try {
      // Future: Add Telemetry start, Retry logic, Fallback handling here
      const result = await adapter.generate(messages, tools, signal);
      // Future: Add Telemetry end here
      return result;
    } catch (error: any) {
      console.error(`[ModelOrchestrator] Model execution failed:`, error);
      // Future: Fallback to next best model here
      throw error;
    }
  }
}
