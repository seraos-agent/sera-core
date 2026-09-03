import { EventEmitter } from 'events';
import { EventTypes, GoalResultPayload, StandardEvent } from '../../core/events/types';
import { ModelOrchestrator } from '../../core/llm/ModelOrchestrator';
import { QwenMessage } from '../llm/QwenAdapter';
import { SeraToolCall } from '../../core/cognitive/Tool';
import { MemoryProposal, MemoryOperation } from '../../core/memory/MemoryProposal';
import { MemorySource } from '../../core/memory/MemorySource';
import { EvidenceType } from '../../core/memory/MemoryEvidence';
import { ExecutionProfileBuilder } from './ExecutionProfileBuilder';
import { FeasibilityEvaluator } from './FeasibilityEvaluator';
import { ProposalResponseHandler } from './ProposalResponseHandler';
import { DialogueResultNarrator } from './DialogueResultNarrator';

export interface SingleToolExecutionParams {
  toolCall: SeraToolCall;
  toolCallId: string;
  event: StandardEvent<any>;
  userMessage: string;
  sessionId: string;
  capabilityCatalog: any;
  autonomyAgreementStore?: any;
  activeAbortControllerSignal?: AbortSignal;
  spawnGoalAndAwaitResult: (intent: string, parameters: Record<string, any>) => Promise<GoalResultPayload>;
  emitEvent: (type: string, payload: Record<string, any>) => void;
  buildWorkingMemory: (uiCommandExecuted?: boolean, userMessage?: string) => Promise<QwenMessage[]>;
}

export interface SingleToolExecutionResult {
  isProposal: boolean;
  output: any;
}

export interface ToolExecutionParams {
  event: StandardEvent<any>;
  userMessage: string;
  response: any;
  messages: QwenMessage[];
  capabilityCatalog: any;
  autonomyAgreementStore?: any;
  sessionId: string;
  activeAbortControllerSignal?: AbortSignal;
  buildWorkingMemory: (uiCommandExecuted?: boolean, userMessage?: string) => Promise<QwenMessage[]>;
  spawnGoalAndAwaitResult: (intent: string, parameters: Record<string, any>) => Promise<GoalResultPayload>;
  emitEvent?: (type: string, payload: Record<string, any>) => void;
}

/**
 * ToolExecutionHandler — Encapsulates LLM native tool calling, safety authorization checks, and execution/proposal routing.
 *
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 */
export class ToolExecutionHandler {
  constructor(
    private readonly eventBus: EventEmitter,
    private readonly orchestrator: ModelOrchestrator,
    private readonly feasibilityEvaluator: FeasibilityEvaluator,
    private readonly proposalResponseHandler: ProposalResponseHandler,
    private readonly dialogueResultNarrator: DialogueResultNarrator
  ) { }

  public static getCognitiveActivityLabel(toolIntent: string): string {
    const map: Record<string, string> = {
      'GDRIVE_CREATE_SPREADSHEET': 'Creating spreadsheet',
      'GDRIVE_READ': 'Verifying sheet data',
      'GDRIVE_APPEND': 'Updating document',
      'GDRIVE_LIST': 'Listing files in Vault',
      'GDRIVE_DELETE': 'Removing file from Vault',
      'HL_SPOT_MARKET_DATA': 'Fetching market data',
      'HL_SPOT_ORDER': 'Executing spot order',
      'HL_SPOT_CANCEL': 'Cancelling spot order',
      'HL_SPOT_PORTFOLIO': 'Checking portfolio',
      'HL_SPOT_OPEN_ORDERS': 'Checking open orders',
      'RESOLVE_BASE_TOKEN': 'Resolving token on-chain',
      'web_search': 'Searching web',
      'brave_web_search': 'Searching web',
      'media_generation': 'Generating media',
      'generate_image': 'Generating image',
      'THREADS_PUBLISH': 'Publishing to Threads',
      'TRANSFER_FUNDS': 'Preparing transfer',
      'SCHEDULE_GOAL': 'Configuring automation',
      'ACTIVATE_AUTONOMY_AGREEMENT': 'Configuring agreement',
      'REMEMBER_FACT': 'Saving to memory',
      'SET_THEME': 'Updating theme',
      'CLEAR_CHAT': 'Clearing chat'
    };

    if (map[toolIntent]) return map[toolIntent];
    return `${toolIntent.replace(/^GDRIVE_|^HL_|^THREADS_/, '').split('_').join(' ').toLowerCase().replace(/^./, (c: string) => c.toUpperCase())}`;
  }

  /**
   * Executes a single tool call within a ReAct loop.
   * Returns structured output to feed back into the model context or indicates if proposal approval is required.
   */
  public async executeSingleTool(params: SingleToolExecutionParams): Promise<SingleToolExecutionResult> {
    const {
      toolCall,
      toolCallId,
      event,
      userMessage,
      sessionId,
      capabilityCatalog,
      autonomyAgreementStore,
      activeAbortControllerSignal,
      spawnGoalAndAwaitResult,
      emitEvent,
      buildWorkingMemory
    } = params;

    const startTime = Date.now();
    const toolIntent = toolCall.name;
    let toolParams: Record<string, any> = {};
    try {
      toolParams = typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : (toolCall.arguments || {});
    } catch (e) {
      console.error('[ToolExecutionHandler] Failed to parse tool arguments:', e);
    }

    // 1. UI Commands
    if (toolIntent === 'SET_THEME') {
      const themeValue = String(toolParams.theme || 'dark').toLowerCase();
      this.eventBus.emit(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: themeValue });
      return {
        isProposal: false,
        output: { success: true, theme: themeValue, message: `UI display theme switched to ${themeValue} mode successfully.` }
      };
    }

    if (toolIntent === 'CLEAR_CHAT') {
      this.eventBus.emit(EventTypes.UI_COMMAND, { command: 'CLEAR_CHAT_COUNTDOWN' });
      return {
        isProposal: false,
        output: { success: true, message: 'Chat history cleared from screen successfully.' }
      };
    }

    if (toolIntent === 'REMEMBER_FACT') {
      const fact = toolParams.fact || 'Unknown fact';
      const proposal: MemoryProposal = {
        operation: MemoryOperation.CREATE,
        key: `workspace.fact.${Date.now()}`,
        value: fact,
        source: MemorySource.USER_DIRECT_INSTRUCTION,
        evidence: { type: EvidenceType.USER_MESSAGE, referenceId: event.id, timestamp: event.timestamp },
        confidence: 1.0,
        category: 'SEMANTIC'
      };
      this.eventBus.emit(EventTypes.MEMORY_PROPOSAL_REQUESTED, proposal);
      return {
        isProposal: false,
        output: { success: true, fact, message: `Fact "${fact}" saved to long-term memory.` }
      };
    }

    // 2. Safety and Proposal Check for Financial/Mutative actions
    let isSafe = false;
    const PROPOSAL_REQUIRED_TOOLS = ['SCHEDULE_GOAL', 'TRANSFER_FUNDS'];

    if (PROPOSAL_REQUIRED_TOOLS.includes(toolIntent)) {
      const isAuthorizedByAgreement = autonomyAgreementStore?.hasFullAccessFor(toolIntent, sessionId) === true;
      isSafe = isAuthorizedByAgreement;
    } else if (capabilityCatalog) {
      let toolMeta: any = null;
      if (typeof capabilityCatalog.getTool === 'function') {
        toolMeta = capabilityCatalog.getTool(toolIntent);
      } else if (Array.isArray(capabilityCatalog)) {
        toolMeta = capabilityCatalog.find((t: any) => t.name === toolIntent);
      }
      if (toolMeta) {
        const isAuthorizedByAgreement = autonomyAgreementStore?.hasFullAccessFor(toolIntent, sessionId) === true;
        isSafe = !toolMeta.requiresApproval || isAuthorizedByAgreement;
      } else {
        isSafe = true;
      }
    } else {
      isSafe = true;
    }

    if (isSafe) {
      let result: any;
      const connector = capabilityCatalog?.getConnectorForTool?.(toolIntent);
      if (connector && typeof connector.executeTool === 'function') {
        try {
          const data = await connector.executeTool(toolIntent, toolParams, { sessionId });
          result = { success: true, data };
        } catch (e: any) {
          result = { success: false, errorMessage: e.message };
        }
      } else {
        result = await spawnGoalAndAwaitResult(toolIntent, toolParams);
      }
      const duration = Date.now() - startTime;

      this.eventBus.emit('SYSTEM_TELEMETRY' as any, {
        metric: 'tool_execution',
        toolName: toolIntent,
        success: result.success,
        durationMs: duration
      });

      let outputData = result.success
        ? (result.data !== undefined ? result.data : result)
        : { success: false, error: result.errorMessage || result.data?.error || 'Operation failed' };

      // Lean Output Compression: Prevent tool outputs from blowing up the context window
      if (toolIntent === 'GDRIVE_CREATE_SPREADSHEET' && outputData?.success) {
        outputData = {
          success: true,
          title: outputData.title,
          webViewLink: outputData.webViewLink,
          fileId: outputData.fileId,
          totalRows: outputData.totalRows,
          summary: outputData.summary || 'Spreadsheet created successfully in Google Drive.'
        };
      } else if (toolIntent === 'GDRIVE_LIST' && Array.isArray(outputData)) {
        outputData = outputData.slice(0, 10).map((f: any) => ({ name: f.name, id: f.id, mimeType: f.mimeType }));
      }

      return {
        isProposal: false,
        output: outputData
      };
    } else {
      // Proposal required
      const feasibility = this.feasibilityEvaluator.evaluate(toolIntent, toolParams);
      if (!feasibility.feasible) {
        const workingMessages = await buildWorkingMemory();
        workingMessages.push({
          role: 'user',
          content: `[SYSTEM NOTIFICATION] CRITICAL OVERRIDE: The user requested an action (${toolIntent}) which is currently NOT FEASIBLE. Reason: ${feasibility.reason}. \nAct as a highly intelligent, logical AI assistant. Explain to the user exactly why the request cannot be processed based on the current data. Use a natural, helpful, and professional tone, but DO NOT apologize. If applicable, provide a logical next step. DO NOT pretend to schedule or execute the action. DO NOT ask the user to approve anything.`
        });

        const profile = ExecutionProfileBuilder.forTier('Execution')
          .withEstimatedInputTokens(Math.ceil(JSON.stringify(workingMessages).length / 4))
          .build();

        const failResponse = await this.orchestrator.generate(profile, workingMessages, undefined, activeAbortControllerSignal);
        emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: failResponse.text.trim() });
        return { isProposal: true, output: { rejected: true, reason: feasibility.reason } };
      }

      console.log(`[ToolExecutionHandler] Tool Call ${toolIntent} requires user approval (Proposal).`);
      emitEvent(EventTypes.SYSTEM_PROPOSE_GOAL, {
        intent: toolIntent,
        parameters: toolParams,
        userMessage
      });

      const systemProposalMsg = `You have just prepared an action proposal via Tool Calling.
Intent: ${toolIntent}
Parameters: ${JSON.stringify(toolParams)}

CRITICAL INSTRUCTION:
Write ONE short, natural sentence in the exact language the user is speaking. Acknowledge that the proposal card has been prepared and ask them to review and click Approve on their screen. Do NOT say that the action has been executed yet. Keep it under 15 words.`;

      const proposalMessages = await buildWorkingMemory();
      proposalMessages.push({ role: 'user', content: `[SYSTEM NOTIFICATION] ${systemProposalMsg}` });

      let summaryText = '';
      try {
        const profile = ExecutionProfileBuilder.forTier('Execution')
          .withEstimatedInputTokens(Math.ceil(JSON.stringify(proposalMessages).length / 4))
          .build();

        const proposalResponse = await this.orchestrator.generate(profile, proposalMessages, undefined, activeAbortControllerSignal);
        summaryText = proposalResponse.text.trim();
      } catch (err) {
        summaryText = this.proposalResponseHandler.generateInstantProposalSummary(toolIntent, toolParams);
      }

      this.eventBus.emit('SYSTEM_TELEMETRY' as any, {
        metric: 'tool_proposal',
        toolName: toolIntent,
        success: true,
        durationMs: Date.now() - startTime
      });

      emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryText });
      return { isProposal: true, output: { proposed: true, intent: toolIntent, parameters: toolParams } };
    }
  }

  /**
   * Backward-compatible handler for single-shot execution.
   */
  public async handleToolCall(params: ToolExecutionParams): Promise<boolean> {
    const {
      event,
      userMessage,
      response,
      capabilityCatalog,
      autonomyAgreementStore,
      sessionId,
      activeAbortControllerSignal,
      buildWorkingMemory,
      spawnGoalAndAwaitResult
    } = params;

    if (!response.toolCalls || response.toolCalls.length === 0) {
      return false;
    }

    const toolCall = response.toolCalls[0];
    const emit = params.emitEvent || ((type, payload) => this.eventBus.emit(type, payload));

    const result = await this.executeSingleTool({
      toolCall,
      toolCallId: toolCall.id || 'call_default',
      event,
      userMessage,
      sessionId,
      capabilityCatalog,
      autonomyAgreementStore,
      activeAbortControllerSignal,
      spawnGoalAndAwaitResult,
      emitEvent: emit,
      buildWorkingMemory
    });

    if (result.isProposal) {
      return true;
    }

    if (toolCall.name === 'SET_THEME' || toolCall.name === 'CLEAR_CHAT' || toolCall.name === 'REMEMBER_FACT') {
      const messages = await buildWorkingMemory();
      messages.push({ role: 'assistant', content: `[TOOL_CALL: ${toolCall.name}] ${JSON.stringify(toolCall.arguments)}` });
      messages.push({
        role: 'user',
        content: `[SYSTEM NOTIFICATION] You have successfully executed ${toolCall.name}. Output: ${JSON.stringify(result.output)}. Confirm this naturally and warmly in 1 short sentence in the user's language.`
      });

      const profile = ExecutionProfileBuilder.forTier('Execution')
        .withEstimatedInputTokens(Math.ceil(JSON.stringify(messages).length / 4))
        .build();

      const summaryResponse = await this.orchestrator.generate(profile, messages, [], activeAbortControllerSignal);
      emit(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryResponse.text.trim() });
      return true;
    }

    await this.dialogueResultNarrator.narrate(userMessage, { success: true, data: result.output } as any, buildWorkingMemory, activeAbortControllerSignal, emit);
    return true;
  }
}
