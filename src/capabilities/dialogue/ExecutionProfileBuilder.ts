import { ExecutionProfile } from '../../core/llm/types';

export class ExecutionProfileBuilder {
  private profile: ExecutionProfile;

  constructor(tier: ExecutionProfile['tier'] = 'Execution') {
    this.profile = {
      tier,
      constraints: {}
    };
  }

  public static forTier(tier: ExecutionProfile['tier']): ExecutionProfileBuilder {
    return new ExecutionProfileBuilder(tier);
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

  public build(): ExecutionProfile {
    return this.profile;
  }
}

