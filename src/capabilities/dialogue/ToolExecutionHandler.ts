import { EventEmitter } from 'events';
import { EventTypes, GoalResultPayload, StandardEvent } from '../../core/events/types';
import { ModelOrchestrator } from '../../core/llm/ModelOrchestrator';
import { QwenMessage } from '../llm/QwenAdapter';
import { MemoryProposal, MemoryOperation } from '../../core/memory/MemoryProposal';
import { MemorySource } from '../../core/memory/MemorySource';
import { EvidenceType } from '../../core/memory/MemoryEvidence';
import { ExecutionProfileBuilder } from './ExecutionProfileBuilder';
import { FeasibilityEvaluator } from './FeasibilityEvaluator';
import { ProposalResponseHandler } from './ProposalResponseHandler';
import { DialogueResultNarrator } from './DialogueResultNarrator';

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

  public async handleToolCall(params: ToolExecutionParams): Promise<boolean> {
    const {
      event,
      userMessage,
      response,
      messages,
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
    console.log(`[DialogueEngine] LLM Native Tool Call selected: ${toolCall.name}`);

    const startTime = Date.now();
    let toolIntent = toolCall.name;

    let toolParams: Record<string, any> = {};
    try {
      toolParams = typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments;
    } catch (e) {
      console.error('[DialogueEngine] Failed to parse tool arguments:', e);
    }

    if (toolIntent === 'SET_THEME') {
      const themeValue = String(toolParams.theme || 'dark').toLowerCase();
      this.eventBus.emit(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: themeValue });

      messages.push({ role: 'assistant', content: `[TOOL_CALL: SET_THEME] ${JSON.stringify(toolParams)}` });
      messages.push({
        role: 'user',
        content: `[SYSTEM NOTIFICATION] You have successfully executed the SET_THEME tool call and updated the UI display theme to ${themeValue.toUpperCase()} MODE. Confirm this naturally and warmly in 1 short sentence in the user's language.`
      });

      const profile = ExecutionProfileBuilder.forTier('Execution')
        .withEstimatedInputTokens(Math.ceil(JSON.stringify(messages).length / 4))
        .build();

      const summaryResponse = await this.orchestrator.generate(profile, messages, [], activeAbortControllerSignal);
      const emit = params.emitEvent || ((type, payload) => this.eventBus.emit(type, payload));
      emit(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryResponse.text.trim() });
      return true;
    }

    if (toolIntent === 'CLEAR_CHAT') {
      this.eventBus.emit(EventTypes.UI_COMMAND, { command: 'CLEAR_CHAT_COUNTDOWN' });

      messages.push({ role: 'assistant', content: `[TOOL_CALL: CLEAR_CHAT] ${JSON.stringify(toolParams)}` });
      messages.push({
        role: 'user',
        content: `[SYSTEM NOTIFICATION] You have successfully executed the CLEAR_CHAT tool call. Confirm this naturally and warmly in 1 short sentence in the user's language.`
      });

      const profile = ExecutionProfileBuilder.forTier('Execution')
        .withEstimatedInputTokens(Math.ceil(JSON.stringify(messages).length / 4))
        .build();

      const summaryResponse = await this.orchestrator.generate(profile, messages, [], activeAbortControllerSignal);
      const emit = params.emitEvent || ((type, payload) => this.eventBus.emit(type, payload));
      emit(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryResponse.text.trim() });
      return true;
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

      messages.push({ role: 'assistant', content: `[TOOL_CALL: REMEMBER_FACT] ${JSON.stringify(toolParams)}` });
      messages.push({ role: 'user', content: `[SYSTEM NOTIFICATION] You have successfully saved the fact "${fact}" to long-term memory. Acknowledge this briefly in the user's language.` });

      const profile = ExecutionProfileBuilder.forTier('Execution')
        .withEstimatedInputTokens(Math.ceil(JSON.stringify(messages).length / 4))
        .build();

      const summaryResponse = await this.orchestrator.generate(profile, messages, [], activeAbortControllerSignal);
      this.eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryResponse.text.trim() });
      return true;
    }

    let isSafe = false;
    const PROPOSAL_REQUIRED_TOOLS = ['SCHEDULE_GOAL', 'TRANSFER_FUNDS'];
    const emitEvent = params.emitEvent || ((type: string, payload: Record<string, any>) => this.eventBus.emit(type, payload));

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
      this.eventBus.emit(EventTypes.DIALOGUE_ACTIVITY, {
        content: `${toolIntent.split('_').join(' ').toLowerCase().replace(/^./, (c: string) => c.toUpperCase())}...`
      });

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

      await this.dialogueResultNarrator.narrate(userMessage, result, buildWorkingMemory, activeAbortControllerSignal);
    } else {
      const feasibility = this.feasibilityEvaluator.evaluate(toolIntent, toolParams);
      if (!feasibility.feasible) {
        const workingMessages = await buildWorkingMemory();
        workingMessages.push({
          role: 'user',
          content: `[SYSTEM NOTIFICATION] CRITICAL OVERRIDE: The user requested an action (${toolIntent}) which is currently NOT FEASIBLE. Reason: ${feasibility.reason}. \nAct as a highly intelligent, logical AI assistant. Explain to the user exactly why the request cannot be processed based on the current data. Use a natural, helpful, and professional tone (similar to Claude), but DO NOT apologize. If applicable, provide a logical next step (e.g., "Please top up your balance first"). DO NOT pretend to schedule or execute the action. DO NOT ask the user to approve anything.`
        });

        const profile = ExecutionProfileBuilder.forTier('Execution')
          .withEstimatedInputTokens(Math.ceil(JSON.stringify(workingMessages).length / 4))
          .build();

        const failResponse = await this.orchestrator.generate(profile, workingMessages, undefined, activeAbortControllerSignal);
        emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: failResponse.text.trim() });
        return true;
      }

      console.log(`[DialogueEngine] Tool Call ${toolIntent} requires user approval (Proposal).`);
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
    }

    return true;
  }
}
