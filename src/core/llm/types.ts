export type ExecutionTier = 'Execution' | 'Reasoning' | 'Social' | 'Coding' | 'Vision';

export interface ExecutionProfileConstraints {
  maxLatency?: number;
  maxCost?: 'Lowest' | 'Medium' | 'High';
  requiresVision?: boolean;
  requiresTools?: boolean;
  requiresJSON?: boolean;
  requiresStreaming?: boolean;
  requiresThinking?: boolean;
  requiresLongContext?: boolean;
}

export interface ExecutionProfile {
  tier: ExecutionTier;
  constraints: ExecutionProfileConstraints;
  estimatedInputTokens?: number;
}

export interface ModelCapability {
  provider: string; 
  model: string;    
  tiers: ExecutionTier[];
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsJSON: boolean;
  supportsFunctionCalling: boolean;
  supportsThinking: boolean;
  maxContext: number;
  priceInput: number;
  priceOutput: number;
  latencyClass: 'UltraFast' | 'Fast' | 'Standard';
}

export interface ILLMAdapter {
  generate(messages: any[], tools?: any[], signal?: AbortSignal): Promise<{ 
    text: string; 
    toolCalls?: any[];
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  }>;
  getCapability(): ModelCapability;
}

export interface RoutingPolicy {
  rankModels(profile: ExecutionProfile, registry: ReadonlyArray<ILLMAdapter>): ILLMAdapter[];
  selectModel(profile: ExecutionProfile, registry: ReadonlyArray<ILLMAdapter>): ILLMAdapter | null;
}

export interface ModelExecutionTelemetry {
  provider: string;
  model: string;
  tier: ExecutionTier;
  attempt: number;
  latencyMs: number;
  fallbackUsed: boolean;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost: number;
  errorMessage?: string;
}
