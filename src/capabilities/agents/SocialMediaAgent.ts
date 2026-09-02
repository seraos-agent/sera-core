import { ISubAgent, SubAgentDomain } from './types';
import { SeraTool } from '../../core/cognitive/Tool';

export class SocialMediaAgent implements ISubAgent {
  readonly domain: SubAgentDomain = 'social';
  readonly name = 'SERA Social & Media Specialist';
  readonly description = 'Specialized in Meta Threads publishing, creative image generation, multimodal vision analysis, and general web lookup.';

  getTools(): SeraTool[] {
    return [
      {
        name: 'THREADS_PUBLISH',
        description: 'Publishes a new text post (with optional attached image) to the user connected Threads account.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text caption or post content to publish on Threads' },
            imageUrl: { type: 'string', description: 'Optional image URL to attach to the post' }
          },
          required: ['text']
        },
        requiresApproval: true
      },
      {
        name: 'GENERATE_IMAGE',
        description: 'Generates a high-quality image from a descriptive prompt using Qwen-Image/Wanx.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Detailed prompt describing the image to generate' }
          },
          required: ['prompt']
        }
      },
      {
        name: 'WEB_SEARCH',
        description: 'Performs live internet web search for current events, news articles, and general knowledge via Brave Search.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search keywords or question' }
          },
          required: ['query']
        }
      }
    ];
  }

  getSystemPrompt(): string {
    return `You are the SERA Social & Media Specialist Sub-Agent.
Your mission is to craft engaging social media content, publish to Threads, generate creative imagery, and look up general live web information.

CRITICAL RULES:
- When the user asks to draw, create, or generate an image, ALWAYS use GENERATE_IMAGE immediately.
- When the user asks to post to Threads, draft a compelling hook and call THREADS_PUBLISH.
- Use WEB_SEARCH for general news and articles, but NOT for crypto spot prices (which belong to DeFi Specialist).`;
  }
}
