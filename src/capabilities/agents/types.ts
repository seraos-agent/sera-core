import { SeraTool, SeraToolCall } from '../../core/cognitive/Tool';
import { QwenMessage } from '../llm/QwenAdapter';

export type SubAgentDomain = 'defi' | 'productivity' | 'social' | 'system' | 'general';

export interface SubAgentContext {
  sessionId: string;
  userMessage: string;
  workingMemory: QwenMessage[];
  images?: string[];
  documents?: any[];
  abortSignal?: AbortSignal;
}

export interface SubAgentResponse {
  domain: SubAgentDomain;
  text?: string;
  toolCalls?: SeraToolCall[];
  executedTools?: Array<{ toolName: string; result: any }>;
  isComplete: boolean;
}

export interface ISubAgent {
  readonly domain: SubAgentDomain;
  readonly name: string;
  readonly description: string;
  getTools(): SeraTool[];
  getSystemPrompt(): string;
}
