import 'dotenv/config';
import { SeraTool, SeraToolCall } from '../../core/cognitive/Tool';
import { ILLMAdapter, ModelCapability } from '../../core/llm/types';

const DEFAULT_DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null;
  name?: string; // used for tool role
  tool_call_id?: string; // used for tool role
  tool_calls?: any[]; // used when assistant calls a tool
}

export interface QwenResponse {
  text: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  toolCalls?: SeraToolCall[];
  rawMessage?: any;
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

  constructor(model: string = 'qwen3.8-flash') {
    const key = process.env.QWEN_API;
    if (!key) throw new Error('[QwenAdapter] QWEN_API key is not set in environment.');
    this.apiKey = key;
    this.model = model;
    this.endpoint = process.env.QWEN_BASE_URL || DEFAULT_DASHSCOPE_URL;
    // Fast Latency Optimization: Pure sub-second response speed with qwen3.8-flash universal model
    this.enableThinking = false;
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
      max_tokens: parseInt(process.env.QWEN_MAX_TOKENS || '4096', 10),
    };

    // Only inject enable_thinking when explicitly requested for deep reasoning
    if (this.enableThinking === true) {
      body.enable_thinking = true;
    }

    const effectiveSignal = abortSignal
      ? (typeof (AbortSignal as any).any === 'function'
          ? (AbortSignal as any).any([abortSignal, AbortSignal.timeout(45000)])
          : abortSignal)
      : AbortSignal.timeout(45000);

    if (dashScopeTools && dashScopeTools.length > 0) {
      body.tools = dashScopeTools;
      body.tool_choice = (tools as any)?._toolChoice || 'auto';
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: effectiveSignal
    });

    if (!response.ok) {
      const err = await response.text();
      const errorMsg = `[QwenAdapter] API Error (${response.status}): ${err}`;
      
      // DashScope sometimes returns this error when the model generates empty output.
      // Retry once with enable_thinking toggled to nudge the model into producing output.
      if (err.includes('model output') && err.includes('empty')) {
        console.warn(`[QwenAdapter] Empty model output error detected. Retrying with adjusted parameters...`);
        const retryBody = { ...body };
        // Toggle thinking to nudge the model
        if (retryBody.enable_thinking === false) {
          delete retryBody.enable_thinking;
        } else {
          retryBody.enable_thinking = false;
        }
        
        const retryResponse = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(retryBody),
          signal: effectiveSignal
        });
        
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryChoice = retryData.choices[0].message;
          console.log('[QwenAdapter] Retry succeeded. raw response message:', JSON.stringify(retryChoice, null, 2));
          
          let retryToolCalls: SeraToolCall[] | undefined;
          if (retryChoice.tool_calls && retryChoice.tool_calls.length > 0) {
            retryToolCalls = retryChoice.tool_calls.map((tc: any) => {
              let args = {};
              try {
                args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
              } catch (e) {
                console.error('[QwenAdapter] Failed to parse retry tool arguments:', tc.function.arguments);
              }
              return { id: tc.id, name: tc.function.name, arguments: args, raw: tc };
            });
          }
          
          return {
            text: retryChoice.content || '',
            usage: {
              input_tokens: retryData.usage?.prompt_tokens || 0,
              output_tokens: retryData.usage?.completion_tokens || 0,
              total_tokens: retryData.usage?.total_tokens || 0,
            },
            toolCalls: retryToolCalls,
            rawMessage: retryChoice
          };
        }
        // If retry also fails, fall through to throw the original error
        console.error('[QwenAdapter] Retry also failed.');
      }
      
      throw new Error(errorMsg);
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
          id: tc.id,
          name: tc.function.name,
          arguments: args,
          raw: tc
        };
      });
    }

    return {
      text: choice.content || '',
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
      },
      toolCalls,
      rawMessage: choice
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
    return {
      provider: 'Qwen',
      model,
      tiers: ['Execution', 'Social', 'Vision', 'Reasoning', 'Coding'],
      supportsVision: true,
      supportsStreaming: true,
      supportsJSON: true,
      supportsFunctionCalling: true,
      supportsThinking: false,
      maxContext: 128_000,
      priceInput: 0.001,
      priceOutput: 0.002,
      latencyClass: 'UltraFast'
    };
  }
}
