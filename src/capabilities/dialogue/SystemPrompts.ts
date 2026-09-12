/**
 * SystemPrompts.ts — Canonical System Prompts for SERA DialogueEngine.
 * 
 * Architecture Role: Capability Layer (src/capabilities/dialogue/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 * 
 * Modular Composite: Assembles domain modules from ./prompts/ while maintaining
 * 100% backward compatibility for all cognitive consumers.
 */

import { CORE_SYSTEM_PROMPT } from './prompts/coreSystemPrompt';
import { CHANNEL_GUIDELINES } from './prompts/channelGuidelines';
import { FEW_SHOT_EXEMPLARS } from './prompts/fewShotExemplars';
import { INTENT_EXTRACTION_PROMPT } from './prompts/intentPrompts';

/**
 * Unified full system prompt string composed of core persona, channel formatting,
 * and canonical few-shot tool execution exemplars.
 */
export const SYSTEM_PROMPT = `${CORE_SYSTEM_PROMPT}\n\n${CHANNEL_GUIDELINES}\n\n${FEW_SHOT_EXEMPLARS}`;

export {
  CORE_SYSTEM_PROMPT,
  CHANNEL_GUIDELINES,
  FEW_SHOT_EXEMPLARS,
  INTENT_EXTRACTION_PROMPT
};
