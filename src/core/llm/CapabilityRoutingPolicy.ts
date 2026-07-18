import { ExecutionProfile, ILLMAdapter, RoutingPolicy } from './types';

/**
 * Ranks models deterministically from declared capability. It never relaxes a
 * hard requirement (tools, JSON, vision, thinking, streaming, or known context size).
 */
export class CapabilityRoutingPolicy implements RoutingPolicy {
  public rankModels(profile: ExecutionProfile, registry: ReadonlyArray<ILLMAdapter>): ILLMAdapter[] {
    const capabilityMatches = registry.filter(adapter => this.satisfiesHardConstraints(adapter, profile));
    if (capabilityMatches.length === 0) return [];

    return [...capabilityMatches].sort((left, right) => this.score(right, profile) - this.score(left, profile));
  }

  public selectModel(profile: ExecutionProfile, registry: ReadonlyArray<ILLMAdapter>): ILLMAdapter | null {
    return this.rankModels(profile, registry)[0] || null;
  }

  private satisfiesHardConstraints(adapter: ILLMAdapter, profile: ExecutionProfile): boolean {
    const capability = adapter.getCapability();
    const constraints = profile.constraints;
    if (constraints.requiresJSON && !capability.supportsJSON) return false;
    if (constraints.requiresVision && !capability.supportsVision) return false;
    if (constraints.requiresTools && !capability.supportsFunctionCalling) return false;
    if (constraints.requiresThinking && !capability.supportsThinking) return false;
    if (constraints.requiresStreaming && !capability.supportsStreaming) return false;
    if (profile.estimatedInputTokens && capability.maxContext < profile.estimatedInputTokens) return false;
    if (constraints.maxLatency && this.estimatedLatencyMs(capability.latencyClass) > constraints.maxLatency) return false;
    return true;
  }

  private score(adapter: ILLMAdapter, profile: ExecutionProfile): number {
    const capability = adapter.getCapability();
    const constraints = profile.constraints;
    let score = capability.tiers.includes(profile.tier) ? 100 : 20;

    if (constraints.requiresLongContext) score += capability.maxContext / 100;
    if (constraints.maxCost === 'Lowest') score -= capability.priceInput * 1_000;
    if (constraints.maxCost === 'Medium') score -= capability.priceInput * 250;
    score += this.latencyScore(capability.latencyClass);
    return score;
  }

  private latencyScore(latencyClass: 'UltraFast' | 'Fast' | 'Standard'): number {
    return { UltraFast: 12, Fast: 7, Standard: 2 }[latencyClass];
  }

  private estimatedLatencyMs(latencyClass: 'UltraFast' | 'Fast' | 'Standard'): number {
    return { UltraFast: 500, Fast: 1_500, Standard: 4_000 }[latencyClass];
  }
}
