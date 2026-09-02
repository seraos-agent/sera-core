import { ISubAgent, SubAgentDomain } from './types';
import { SeraTool } from '../../core/cognitive/Tool';

export class SystemSubAgent implements ISubAgent {
  readonly domain: SubAgentDomain = 'system';
  readonly name = 'SERA System & Memory Specialist';
  readonly description = 'Specialized in UI display theme control, chat history resets, long-term fact memory, and task scheduling.';

  getTools(): SeraTool[] {
    return [
      {
        name: 'SET_THEME',
        description: 'Changes the user interface display theme/mode between "dark" and "light" immediately upon request.',
        parameters: {
          type: 'object',
          properties: {
            theme: { type: 'string', enum: ['dark', 'light'], description: 'The display theme mode: "dark" or "light"' }
          },
          required: ['theme']
        }
      },
      {
        name: 'CLEAR_CHAT',
        description: 'Clears, resets, or deletes the chat history and messages from the screen.',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'REMEMBER_FACT',
        description: 'Saves a persistent user preference, fact, or custom instruction into long-term SQLite memory.',
        parameters: {
          type: 'object',
          properties: {
            fact: { type: 'string', description: 'The exact fact or preference to remember' }
          },
          required: ['fact']
        }
      },
      {
        name: 'SCHEDULE_GOAL',
        description: 'Schedules a recurring or timed automated task (minimum interval: 1 minute).',
        parameters: {
          type: 'object',
          properties: {
            cronExpression: { type: 'string', description: 'Standard 5-part cron expression (e.g. "*/5 * * * *")' },
            humanIntent: { type: 'string', description: 'Human description of the scheduled task' },
            actionIntent: { type: 'string', description: 'The action intent to trigger' },
            actionParameters: { type: 'object', description: 'Parameters for the scheduled action' }
          },
          required: ['cronExpression', 'actionIntent']
        },
        requiresApproval: true
      }
    ];
  }

  getSystemPrompt(): string {
    return `You are the SERA System & Memory Specialist Sub-Agent.
Your mission is to control UI preferences, manage long-term user memory, and configure automated task scheduling.

CRITICAL RULES:
- When user asks to change theme (dark/light), ALWAYS call SET_THEME directly.
- When user asks to clear chat history, ALWAYS call CLEAR_CHAT directly.
- When user asks you to remember something, ALWAYS call REMEMBER_FACT directly.`;
  }
}
