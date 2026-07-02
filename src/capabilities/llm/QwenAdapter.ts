import 'dotenv/config';

const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QwenResponse {
  text: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
}

/**
 * QwenAdapter — A pure Capability Connector.
 * This class ONLY knows how to talk to the Qwen/DashScope API.
 * It has zero knowledge of SERA's cognitive architecture.
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

  async generate(messages: QwenMessage[]): Promise<QwenResponse> {
    const response = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: { messages },
        parameters: { result_format: 'message' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`[QwenAdapter] API Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const choice = data.output.choices[0].message;

    return {
      text: choice.content,
      usage: data.usage,
    };
  }
}
