import { ExecutionProfile } from '../../core/llm/types';

export class ExecutionProfileBuilder {
  private profile: ExecutionProfile;

  constructor(tier: ExecutionProfile['tier'] = 'Execution') {
    let defaultTemp = 0.1;
    let defaultTopP = 0.1;

    switch (tier) {
      case 'Execution':
      case 'Vision':
      case 'Coding':
        defaultTemp = 0.1;
        defaultTopP = 0.1;
        break;
      case 'Reasoning':
        defaultTemp = 0.15;
        defaultTopP = 0.2;
        break;
      case 'Social':
        defaultTemp = 0.6;
        defaultTopP = 0.8;
        break;
    }

    this.profile = {
      tier,
      constraints: {
        temperature: defaultTemp,
        top_p: defaultTopP
      }
    };
  }

  public static forTier(tier: ExecutionProfile['tier']): ExecutionProfileBuilder {
    return new ExecutionProfileBuilder(tier);
  }

  public withSampling(temperature?: number, top_p?: number): this {
    if (temperature !== undefined) this.profile.constraints.temperature = temperature;
    if (top_p !== undefined) this.profile.constraints.top_p = top_p;
    return this;
  }

  public withCost(maxCost: 'Lowest' | 'Medium' | 'High'): this {
    this.profile.constraints.maxCost = maxCost;
    return this;
  }

  public requiresJSON(): this {
    this.profile.constraints.requiresJSON = true;
    return this;
  }

  public requiresTools(): this {
    this.profile.constraints.requiresTools = true;
    return this;
  }

  public requiresThinking(): this {
    this.profile.constraints.requiresThinking = true;
    return this;
  }

  public requiresVision(): this {
    this.profile.constraints.requiresVision = true;
    return this;
  }

  public requiresLongContext(): this {
    this.profile.constraints.requiresLongContext = true;
    return this;
  }

  public withEstimatedInputTokens(tokens: number): this {
    this.profile.estimatedInputTokens = Math.max(0, Math.floor(tokens));
    return this;
  }

  public build(): ExecutionProfile {
    return this.profile;
  }
}

