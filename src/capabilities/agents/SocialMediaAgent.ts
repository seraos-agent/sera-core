import { ISubAgent, SubAgentDomain } from './types';
import { SeraTool } from '../../core/cognitive/Tool';

export class SocialMediaAgent implements ISubAgent {
  readonly domain: SubAgentDomain = 'social';
  readonly name = 'SERA Social & Media Specialist';
  readonly description = 'Specialized in Meta Threads publishing, carousels, chained threads, performance insights, creative image generation, and live web research.';

  getTools(): SeraTool[] {
    return [
      {
        name: 'THREADS_PUBLISH',
        description: 'Publishes a post, multi-image carousel, or sequential chained thread (utas) to the connected Threads account. Supports images, videos, Google Drive assets, and chaining.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text caption or post content to publish on Threads' },
            imageUrl: { type: 'string', description: 'Optional direct image URL to attach to the post' },
            videoUrl: { type: 'string', description: 'Optional direct video URL to attach to the post' },
            driveFileName: { type: 'string', description: 'Optional filename of an image or video in Google Drive (Media & Creative folder) to bridge and publish' },
            replyToId: { type: 'string', description: 'Optional ID of an existing Threads post to reply to, creating a chained thread (utas)' },
            imageUrls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of 2 to 20 image URLs to publish as a multi-image Carousel slide post'
            },
            driveFileNames: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of filenames in Google Drive (Media & Creative folder) to publish as a Carousel slide post'
            },
            threadChain: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of follow-up post texts to publish sequentially as an atomic chained thread (utas: 1/N, 2/N, etc.)'
            }
          },
          required: ['text']
        },
        requiresApproval: true
      },
      {
        name: 'THREADS_GET_POSTS',
        description: 'Retrieves the latest published posts from the connected Threads account (up to 20 posts) with timestamps and permalinks.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum number of recent posts to fetch (default: 5, max: 20)' }
          }
        },
        requiresApproval: false
      },
      {
        name: 'THREADS_GET_INSIGHTS',
        description: 'Fetches live performance metrics (views, likes, replies, reposts, quotes) for a specific post or for the entire user account.',
        parameters: {
          type: 'object',
          properties: {
            postId: { type: 'string', description: 'Optional specific Threads post ID to fetch metrics for. If omitted, returns account-level insights.' }
          }
        },
        requiresApproval: false
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
Your mission is to craft engaging social media content, publish single posts, multi-slide carousels, and chained threads (utas) to Threads, analyze performance insights, generate creative imagery, and look up general live web information.

CRITICAL RULES:
- When the user asks to draw, create, or generate an image, ALWAYS use GENERATE_IMAGE immediately.
- When the user asks to post to Threads:
  * SINGLE POST: Draft a compelling hook and call THREADS_PUBLISH with 'text'. If an image or video is requested, pass 'imageUrl', 'videoUrl', or 'driveFileName'.
  * CAROUSEL POST (Multi-Image): When the user wants to post multiple pictures or slides (2-20 items), pass 'imageUrls: [...]' or 'driveFileNames: [...]'.
  * CHAINED THREAD (Utas): When the user wants a multi-part thread (e.g. 1/3, 2/3, 3/3), pass 'threadChain: ["part 2 text", "part 3 text"]'. The engine will publish the root post and automatically chain subsequent parts sequentially.
  * POSTING FROM GOOGLE DRIVE: If the user mentions a photo or video saved in Google Drive (e.g. "post photo/video from Google Drive"), pass 'driveFileName: "filename"' (or 'driveFileNames' for carousel). SERA will automatically bridge it and stream to Meta Threads.
- When the user asks to inspect or audit their recent Threads posts (e.g. "what did I post recently?", "show my recent threads"):
  * Call THREADS_GET_POSTS with limit.
- When the user asks about performance, analytics, or post engagement (e.g. "how did my posts perform?", "show my views and likes"):
  * Call THREADS_GET_INSIGHTS (optionally passing 'postId' if inquiring about a specific post).
- NO EM DASH IN THREADS POSTS: NEVER use long em dashes ("—") when drafting or publishing Threads posts. Standard hyphens ("-") or en dashes ("–" for ranges) are allowed, but never the long em dash.
- Use WEB_SEARCH for general news and articles, but NOT for crypto spot prices (which belong to DeFi Specialist).`;
  }
}
