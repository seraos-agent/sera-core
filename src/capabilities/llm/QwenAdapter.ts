import 'dotenv/config';
import { SeraTool, SeraToolCall } from '../../core/cognitive/Tool';
import { ILLMAdapter, ModelCapability } from '../../core/llm/types';

const DEFAULT_DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // used for tool role
  tool_calls?: any[]; // used when assistant calls a tool
}

export interface QwenResponse {
  text: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  toolCalls?: SeraToolCall[];
}

/**
 * QwenAdapter — A pure Capability Connector.
 * This class ONLY knows how to talk to the Qwen/DashScope API.
 * It has zero knowledge of Sera's cognitive architecture.
 */
export class QwenAdapter implements ILLMAdapter {
  private apiKey: string;
  private model: string;
  private capability: ModelCapability;
  private readonly endpoint: string;
  private readonly enableThinking: boolean | undefined;

  constructor(model: string = 'qwen-plus') {
    const key = process.env.QWEN_API;
    if (!key) throw new Error('[QwenAdapter] QWEN_API key is not set in environment.');
    this.apiKey = key;
    this.model = model;
    this.endpoint = process.env.QWEN_BASE_URL || DEFAULT_DASHSCOPE_URL;
    this.enableThinking = model === 'qwen3.5-flash' ? false : model === 'qwen3.7-max' ? true : undefined;
    this.capability = this.capabilityFor(model);
  }

  getCapability(): ModelCapability {
    return this.capability;
  }

  async generate(messages: QwenMessage[], tools?: SeraTool[], abortSignal?: AbortSignal): Promise<QwenResponse> {
    const dashScopeTools = tools?.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const body: any = {
      model: this.model,
      messages: messages,
    };

    // Qwen 3.5/3.7 are hybrid-thinking models. Keep the light lane cheap and
    // deterministic; reserve reasoning tokens for the explicitly strong lane.
    if (this.enableThinking !== undefined) body.enable_thinking = this.enableThinking;

    if (dashScopeTools && dashScopeTools.length > 0) {
      body.tools = dashScopeTools;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: abortSignal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`[QwenAdapter] API Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const choice = data.choices[0].message;
    console.log('[QwenAdapter] raw response message:', JSON.stringify(choice, null, 2));

    let toolCalls: SeraToolCall[] | undefined;
    if (choice.tool_calls && choice.tool_calls.length > 0) {
      toolCalls = choice.tool_calls.map((tc: any) => {
        let args = {};
        try {
          args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch (e) {
          console.error('[QwenAdapter] Failed to parse tool arguments:', tc.function.arguments);
        }
        return {
          name: tc.function.name,
          arguments: args
        };
      });
    }

    return {
      text: choice.content || '',
      usage: data.usage,
      toolCalls,
    };
  }

  async embed(text: string): Promise<number[]> {
    const EMBED_URL = this.endpoint.replace(/\/chat\/completions$/, '/embeddings');
    const body = {
      model: 'text-embedding-v3',
      input: text
    };
    const response = await fetch(EMBED_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`[QwenAdapter] Embed API Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error(`[QwenAdapter] Unexpected embedding response format`);
    }

    return data.data[0].embedding;
  }

  private capabilityFor(model: string): ModelCapability {
    if (model === 'qwen3.5-flash') {
      return {
        provider: 'Qwen', model,
        tiers: ['Execution', 'Social'],
        supportsVision: false, supportsStreaming: true, supportsJSON: true, supportsFunctionCalling: true, supportsThinking: false,
        maxContext: 128_000, priceInput: 0.001, priceOutput: 0.002, latencyClass: 'UltraFast'
      };
    }
    if (model === 'qwen3.7-max') {
      return {
        provider: 'Qwen', model,
        tiers: ['Reasoning', 'Coding'],
        supportsVision: false, supportsStreaming: true, supportsJSON: true, supportsFunctionCalling: true, supportsThinking: true,
        maxContext: 1_000_000, priceInput: 0.012, priceOutput: 0.036, latencyClass: 'Standard'
      };
    }
    return {
      provider: 'Qwen', model,
      tiers: ['Reasoning', 'Coding'],
      supportsVision: false, supportsStreaming: true, supportsJSON: true, supportsFunctionCalling: true, supportsThinking: true,
      maxContext: 32_000, priceInput: 0.004, priceOutput: 0.012, latencyClass: 'Fast'
    };
  }
}
