import { RoutingPolicy, ExecutionProfile, ILLMAdapter } from './types';

export class StaticRoutingPolicy implements RoutingPolicy {
  public selectModel(profile: ExecutionProfile, registry: ReadonlyArray<ILLMAdapter>): ILLMAdapter | null {
    // 1. Filter by Tier
    let candidates = registry.filter(adapter => adapter.getCapability().tiers.includes(profile.tier));
    
    if (candidates.length === 0) {
      console.warn(`[RoutingPolicy] No models found for tier: ${profile.tier}. Falling back to any available model.`);
      candidates = [...registry];
      if (candidates.length === 0) return null;
    }

    // 2. Filter by Constraints (Hard constraints)
    const constraints = profile.constraints;
    candidates = candidates.filter(adapter => {
      const cap = adapter.getCapability();
      if (constraints.requiresJSON && !cap.supportsJSON) return false;
      if (constraints.requiresVision && !cap.supportsVision) return false;
      if (constraints.requiresTools && !cap.supportsFunctionCalling) return false;
      if (constraints.requiresThinking && !cap.supportsThinking) return false;
      if (constraints.requiresStreaming && !cap.supportsStreaming) return false;
      return true;
    });

    if (candidates.length === 0) {
      console.warn(`[RoutingPolicy] No models satisfy constraints for tier ${profile.tier}.`);
      return null; // Orchestrator handles fallback
    }

    // 3. Sort by preferences (Soft constraints)
    candidates.sort((a, b) => {
      const capA = a.getCapability();
      const capB = b.getCapability();
      
      let scoreA = 0;
      let scoreB = 0;

      if (constraints.maxCost === 'Lowest') {
        if (capA.priceInput < capB.priceInput) scoreA++;
        else if (capB.priceInput < capA.priceInput) scoreB++;
      }
      
      // Simple fallback scoring based on latency class if tied
      const latencyScore = { UltraFast: 3, Fast: 2, Standard: 1 };
      scoreA += latencyScore[capA.latencyClass];
      scoreB += latencyScore[capB.latencyClass];

      return scoreB - scoreA; // Highest score first
    });

    return candidates[0];
  }
}
