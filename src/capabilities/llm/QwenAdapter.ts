import 'dotenv/config';
import { SeraTool, SeraToolCall } from '../../core/cognitive/Tool';

const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

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
export class QwenAdapter {
  private apiKey: string;
  private model: string;

  constructor(model: string = 'qwen-plus') {
    const key = process.env.QWEN_API;
    if (!key) throw new Error('[QwenAdapter] QWEN_API key is not set in environment.');
    this.apiKey = key;
    this.model = model;
  }

  async generate(messages: QwenMessage[], tools?: SeraTool[]): Promise<QwenResponse> {
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

    if (dashScopeTools && dashScopeTools.length > 0) {
      body.tools = dashScopeTools;
    }

    const response = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
}
