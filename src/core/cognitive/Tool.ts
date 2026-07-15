/**
 * SeraTool & SeraToolCall Definition
 * 
 * This file defines the universal tool schema for the Sera Cognitive OS.
 * It is completely provider-agnostic. LLM Adapters (e.g. QwenAdapter, OpenAIAdapter)
 * are responsible for translating this internal schema into their specific API formats.
 */

export interface SeraTool {
  /**
   * The unique name of the tool (e.g. 'transfer_funds', 'get_current_time').
   * Must only contain alphanumeric characters and underscores.
   */
  name: string;
  
  /**
   * A clear, semantic description of what the tool does.
   * This is what the LLM reads to decide whether to select this tool.
   */
  description: string;
  
  /**
   * The JSON Schema defining the expected parameters.
   */
  parameters: Record<string, any>;

  /**
   * Whether this tool requires user approval before execution (e.g. risky actions).
   * If true, the system will intercept the tool call and generate a UI Proposal.
   */
  requiresApproval?: boolean;

  /**
   * Indicates if the action is permanent or cannot be undone (e.g. transferring funds on-chain).
   */
  irreversible?: boolean;

  /**
   * Indicates if the action poses a severe risk to the user's setup or financial safety.
   */
  unsafe?: boolean;
}

export interface SeraToolCall {
  /**
   * The name of the tool that the LLM has selected to call.
   */
  name: string;
  
  /**
   * The parsed arguments provided by the LLM, matching the tool's parameters schema.
   */
  arguments: Record<string, any>;
}
