import { SeraTool } from '../../core/cognitive/Tool';

export class ImageGenerationCapability {
  getTools(): SeraTool[] {
    return [
      {
        name: 'GENERATE_IMAGE',
        description: 'Generates a high-quality image based on a text prompt. Use this when the user asks for a picture, drawing, or visual representation.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'A highly detailed text prompt describing the image to be generated. Include lighting, style, and subject details.' },
          },
          required: ['prompt'],
        },
        requiresApproval: false,
        irreversible: false,
        unsafe: false,
      }
    ];
  }

  async executeTool(name: string, args: any): Promise<any> {
    if (name === 'GENERATE_IMAGE') {
      const apiKey = process.env.QWEN_API || process.env.DASHSCOPE_API_KEY;
      if (!apiKey) {
        throw new Error('Missing API Key for Qwen Image generation (QWEN_API or DASHSCOPE_API_KEY)');
      }

      const url = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
      const payload = {
        model: "qwen-image-3.0",
        input: {
          messages: [
            {
              role: "user",
              content: [{ text: args.prompt }]
            }
          ]
        },
        parameters: {
          prompt_extend: true
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate image: ${errorText}`);
      }

      const data = await response.json();
      
      try {
        const imageUrl = data.output.choices[0].message.content[0].image;
        if (!imageUrl) throw new Error('Image URL not found in API response');
        
        return { 
          success: true, 
          imageUrl,
          message: `Successfully generated image. To show this to the user in chat, reply with markdown: ![Generated Image](<INSERT_IMAGE_URL_HERE>). If you are replying on Threads, you MUST include this image URL when you reply using the THREADS_REPLY or THREADS_PUBLISH tools.` 
        };
      } catch (err: any) {
        throw new Error(`Unexpected API response structure: ${JSON.stringify(data)}`);
      }
    }
    
    throw new Error(`Unknown tool: ${name}`);
  }
}
