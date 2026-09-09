import { ModelOrchestrator } from '../../../core/llm/ModelOrchestrator';
import { ExecutionProfile } from '../../../core/llm/types';
import { ExecutionProfileBuilder } from '../ExecutionProfileBuilder';
import { ToolExecutionHandler } from '../ToolExecutionHandler';
import { QwenMessage } from '../../llm/QwenAdapter';
import { SeraTool, SeraToolCall } from '../../../core/cognitive/Tool';
import { EventTypes, GoalResultPayload, StandardEvent } from '../../../core/events/types';

export interface ReActExecutionParams {
  messages: QwenMessage[];
  rawTools: SeraTool[];
  stepBudget?: number;
  dynamicGoal?: string;
  turnStartTime: number;
  hasImages: boolean;
  event: StandardEvent<any>;
  userMessage: string;
  sessionId: string;
  capabilityCatalog: any;
  autonomyAgreementStore?: any;
  activeAbortSignal?: AbortSignal;
  emitEvent: (type: string, payload: Record<string, any>) => void;
  spawnGoalAndAwaitResult: (intent: string, parameters: Record<string, any>) => Promise<GoalResultPayload>;
  buildWorkingMemory: (uiCommandExecuted?: boolean, userMessage?: string) => Promise<QwenMessage[]>;
}

export interface ReActExecutionResult {
  finalAnswer: string;
  actionLinks: Array<{ label: string; url: string; type: string }>;
  cognitiveSteps: Array<{ title: string; detail?: string; status: 'completed' | 'active' }>;
  successfulToolResults: Array<{ name: string; output: any }>;
  durationSeconds: number;
  hadTools: boolean;
  proposalEncountered: boolean;
}

/**
 * Extracts only the executive intent / opening formulation from raw reasoning text (Option A).
 * Discards internal scratchpad calculations, prompt rule debates, and self-checks.
 */
export function extractExecutiveSummary(rawReasoning?: string): string {
  if (!rawReasoning || typeof rawReasoning !== 'string') return '';
  const trimmed = rawReasoning.trim();
  if (!trimmed) return '';

  // Clean meta headers like "Thinking Process:" or "Thought Process:"
  let cleaned = trimmed
    .replace(/^(?:thinking process|thought process|reasoning process|reasoning):\s*/i, '')
    .trim();

  // Split into distinct blocks separated by blank lines
  const blocks = cleaned.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  let candidate = blocks[0] || cleaned;

  // If the first block is a short header (< 30 chars), combine with the next block
  if (candidate.length < 30 && blocks.length > 1) {
    candidate = `${candidate} ${blocks[1]}`;
  }

  // If the executive block is overly verbose (> 320 chars), extract the first 1-2 complete sentences
  if (candidate.length > 320) {
    const sentenceMatch = candidate.match(/^((?:[^.!?\n]+[.!?\n]){1,2})/);
    if (sentenceMatch && sentenceMatch[1].trim().length >= 35) {
      candidate = sentenceMatch[1].trim();
    } else {
      const truncated = candidate.slice(0, 300);
      const lastSpace = truncated.lastIndexOf(' ');
      candidate = (lastSpace > 200 ? truncated.slice(0, lastSpace) : truncated).trim() + '...';
    }
  }

  return candidate.trim();
}

/**
 * ReActExecutor — Dedicated Autonomous Multi-Step Tool Execution Engine.
 * 
 * Handles iterative Tool Call cycles, self-healing retries with adaptive context pruning,
 * infinite-loop circuit breakers, pseudo-tool interceptors, and final report synthesis.
 * 
 * Architecture Principle: Single Responsibility, English Code Standard (Rule 7).
 */
export class ReActExecutor {
  constructor(
    private readonly orchestrator: ModelOrchestrator,
    private readonly toolExecutionHandler: ToolExecutionHandler
  ) {}

  public async execute(params: ReActExecutionParams): Promise<ReActExecutionResult> {
    const {
      rawTools,
      stepBudget,
      dynamicGoal,
      turnStartTime,
      hasImages,
      event,
      userMessage,
      sessionId,
      capabilityCatalog,
      autonomyAgreementStore,
      activeAbortSignal,
      emitEvent,
      spawnGoalAndAwaitResult,
      buildWorkingMemory
    } = params;

    let messages = params.messages;
    let stepCount = 0;
    let finalAnswer = '';
    const executedSignatures: string[] = [];
    const cognitiveSteps: Array<{ title: string; detail?: string; status: 'completed' | 'active' }> = [];
    const successfulToolResults: Array<{ name: string; output: any }> = [];
    const actionLinks: Array<{ label: string; url: string; type: string }> = [];
    let proposalEncountered = false;

    const maxSafetySteps = params.stepBudget || 20;

    while (stepCount < maxSafetySteps) {
      stepCount++;
      if (activeAbortSignal?.aborted) break;

      emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
        content: 'Thinking',
        phase: 'THINKING',
        subText: stepCount > 1 ? 'Reasoning through next step...' : 'Reasoning through request...',
        cognitiveSteps: [...cognitiveSteps],
        startTime: turnStartTime
      });

      const toolTier = hasImages ? 'Vision' : 'Execution';
      let response: any = null;
      let llmAttempts = 0;
      const maxLlmAttempts = 3;
      let lastLlmError: any = null;

      while (llmAttempts < maxLlmAttempts) {
        llmAttempts++;
        try {
          response = await this.orchestrator.generate(
            this.buildProfile(toolTier, messages, { requiresVision: hasImages, requiresTools: rawTools.length > 0, requiresThinking: false }),
            messages,
            rawTools,
            activeAbortSignal
          );
          break;
        } catch (err: any) {
          lastLlmError = err;
          if (activeAbortSignal?.aborted) break;

          let allErrorsText = (err.message || '').toLowerCase();
          if (Array.isArray(err.errors)) {
            allErrorsText += ' ' + err.errors.map((e: any) => (e?.message || '').toLowerCase()).join(' ');
          }
          const isRateLimit = allErrorsText.includes('429') || allErrorsText.includes('quota') || allErrorsText.includes('rate limit');
          const isTransientNetwork = allErrorsText.includes('timeout') || allErrorsText.includes('econnreset') || allErrorsText.includes('502') || allErrorsText.includes('503') || allErrorsText.includes('504') || allErrorsText.includes('failed to fetch');

          if (llmAttempts < maxLlmAttempts && (isRateLimit || isTransientNetwork || !err.message)) {
            console.warn(`[ReActExecutor] Cognitive latency hurdle (attempt ${llmAttempts}/${maxLlmAttempts}). Engaging self-healing...`);

            if (messages.length > 3) {
              emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
                content: 'Thinking',
                phase: 'THINKING',
                subText: 'Condensing working context and retrying...',
                cognitiveSteps: [...cognitiveSteps],
                startTime: turnStartTime
              });
              messages = this.pruneBloatedContext(messages);
            } else {
              emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
                content: 'Thinking',
                phase: 'THINKING',
                subText: `Reconnecting to cognitive service (attempt ${llmAttempts + 1}/${maxLlmAttempts})...`,
                cognitiveSteps: [...cognitiveSteps],
                startTime: turnStartTime
              });
            }

            await new Promise(resolve => setTimeout(resolve, llmAttempts * 1000));
          } else {
            break;
          }
        }
      }

      if (!response) {
        console.warn('[ReActExecutor] Self-healing attempts exhausted. Responding constructively without crashing.');
        const durationSeconds = Math.max(1, Math.round((Date.now() - turnStartTime) / 1000));
        return {
          finalAnswer: `Cognitive service encountered an upstream latency/timeout during this turn due to context volume. Automated pruning was attempted, but upstream capacity is limited. Shall I retry this operation directly?`,
          actionLinks: [],
          cognitiveSteps,
          successfulToolResults,
          durationSeconds,
          hadTools: successfulToolResults.length > 0,
          proposalEncountered: false
        };
      }

      if (activeAbortSignal?.aborted) break;

      // Capture genuine reasoning content (Chain-of-Thought)
      const rawReasoning = response.reasoningText || (response as any).rawMessage?.reasoning_content;
      const curatedSummary = rawReasoning ? extractExecutiveSummary(rawReasoning) : null;

      if (curatedSummary) {
        const thoughtIdx = cognitiveSteps.findIndex(s => s.title === 'Thought' || s.title === 'Reasoning' || s.title === 'Analyzing');
        if (thoughtIdx !== -1) {
          cognitiveSteps[thoughtIdx] = {
            title: 'Thought',
            detail: curatedSummary,
            status: 'completed'
          };
        } else {
          cognitiveSteps.unshift({
            title: 'Thought',
            detail: curatedSummary,
            status: 'completed'
          });
        }

        // IMMEDIATELY publish the agent's genuine thought to the UI so it renders without waiting for tool execution
        emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
          content: 'Thinking',
          phase: 'THINKING',
          subText: 'Thought captured',
          cognitiveSteps: [...cognitiveSteps],
          startTime: turnStartTime
        });
      }

      // Self-Healing Text Tool Interceptor (Anti-Leak Guard)
      if ((!response.toolCalls || response.toolCalls.length === 0) && response.text) {
        const intercepted = this.interceptPseudoToolCall(response.text);
        if (intercepted) {
          console.log(`[ReActExecutor] Intercepted pseudo-tool call: ${intercepted.toolCall.name}`);
          response.toolCalls = [intercepted.toolCall];
          response.text = intercepted.cleanedText;
        }
      }

      // If model requested tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        const assistantMsg: QwenMessage = {
          role: 'assistant',
          content: response.text || null,
          tool_calls: (response as any).rawMessage?.tool_calls || response.toolCalls.map((tc: any, idx: number) => ({
            id: tc.id || `call_${Date.now()}_${idx}`,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
            }
          }))
        };
        messages.push(assistantMsg);

        // Proactive Interim Progress Notification on External Chat Channels (e.g. WhatsApp / Telegram)
        const responseContext = event?.payload?._responseContext || event?.payload?.responseContext;
        const isExternalChat = responseContext?.platform === 'whatsapp' || responseContext?.platform === 'telegram';
        const HEAVY_OPERATIONAL_TOOLS = ['GDRIVE_CREATE_SPREADSHEET', 'GDRIVE_SAVE_MEDIA', 'GDRIVE_CREATE_FOLDER', 'generate_image', 'media_generation', 'THREADS_PUBLISH'];
        const hasHeavyTool = response.toolCalls.some((tc: any) => HEAVY_OPERATIONAL_TOOLS.includes(tc.name));

        if (stepCount === 1 && isExternalChat && hasHeavyTool) {
          try {
            const targetLanguage = ReActExecutor.inferConversationalLanguage(userMessage, messages);

            // Check if model already provided usable text in the target language
            let candidateText = (response.text || '').trim();
            const isEnglishCandidate = /^[A-Za-z0-9\s.,!?'"#-]+$/.test(candidateText);
            const isCandidateUsable = candidateText.length >= 10 &&
              !candidateText.includes('```') &&
              (targetLanguage === 'English' || !isEnglishCandidate);

            if (isCandidateUsable) {
              emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: candidateText, isInterim: true });
            } else {
              const interimProfile = ExecutionProfileBuilder.forTier('Execution')
                .withEstimatedInputTokens(80)
                .build();

              const languageGuideline = targetLanguage === 'Indonesian'
                ? 'Example in Indonesian: "Siap, lagi aku siapkan di background ya, tunggu sebentar..." or "Noted, langsung aku proses sekarang ya, sebentar lagi beres!"'
                : targetLanguage === 'Spanish'
                ? 'Example in Spanish: "¡Listo! Lo preparo ahora en segundo plano y te aviso en un momento."'
                : 'Example in English: "Got it, preparing this in the background now and will update you shortly!"';

              const interimPromptMessages: QwenMessage[] = [
                {
                  role: 'system',
                  content: `You are an intelligent, empathetic personal AI assistant on mobile messaging.\n` +
                    `The user is conversing with you in ${targetLanguage}.\n` +
                    `Generate ONE single, warm, natural, and concise sentence in ${targetLanguage} acknowledging their request and letting them know you are preparing it now in the background and will update them shortly.\n\n` +
                    `CRITICAL RULES:\n` +
                    `- The sentence MUST be written completely in natural ${targetLanguage}.\n` +
                    `- Even if the user mentions English words or other languages (e.g. "english", "publish", "sheet", "post"), your reply MUST remain strictly in ${targetLanguage}.\n` +
                    `- Do NOT use English unless ${targetLanguage} is English.\n` +
                    `- ${languageGuideline}\n` +
                    `- Vary your phrasing naturally. Do NOT use quotes, markdown headers, or bullet points. Keep it under 15 words.`
                },
                {
                  role: 'user',
                  content: userMessage
                }
              ];
              const interimResp = await this.orchestrator.generate(interimProfile, interimPromptMessages, undefined, activeAbortSignal);
              const interimText = (interimResp.text || '').trim();
              if (interimText && !interimText.startsWith('{')) {
                emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: interimText, isInterim: true });
              }
            }
          } catch (interimErr: any) {
            console.warn('[ReActExecutor] Non-fatal: interim progress notification skipped:', interimErr.message);
          }
        }

        for (let i = 0; i < response.toolCalls.length; i++) {
          const toolCall = response.toolCalls[i];
          const toolCallId = toolCall.id || assistantMsg.tool_calls?.[i]?.id || `call_${Date.now()}_${i}`;
          const signature = `${toolCall.name}:${JSON.stringify(toolCall.arguments || {})}`;

          // Circuit Breaker: prevent duplicate tool loop
          const duplicateCount = executedSignatures.filter((sig, idx) => idx >= executedSignatures.length - 2 && sig === signature).length;
          if (duplicateCount >= 2) {
            console.warn(`[ReActExecutor][CircuitBreaker] Duplicate obstacle detected for ${toolCall.name}.`);
            messages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              name: toolCall.name,
              content: JSON.stringify({
                warning: `[OBSTACLE DETECTED] Operation failed or repeated with identical parameters for ${toolCall.name}. Cease further tool calls now. Formulate a final response explaining what was accomplished, what blocker occurred, and what the user can do next.`
              })
            });
            continue;
          }

          executedSignatures.push(signature);

          const toolLabel = ToolExecutionHandler.getCognitiveActivityLabel(toolCall.name);
          const rawDetail = toolCall.arguments?.title || toolCall.arguments?.filename || (typeof toolCall.arguments === 'object' && toolCall.arguments ? Object.values(toolCall.arguments)[0] : undefined);
          const activeDetail = typeof rawDetail === 'string' ? rawDetail : undefined;

          emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
            content: 'Working',
            phase: 'WORKING',
            subText: activeDetail ? `${toolLabel}: ${activeDetail}` : toolLabel,
            cognitiveSteps: [
              ...cognitiveSteps,
              { title: toolLabel, detail: activeDetail, status: 'active' }
            ],
            startTime: turnStartTime
          });

          console.log(`[ReActExecutor][Step ${stepCount}/${stepBudget}] Invoking tool: ${toolCall.name} (id: ${toolCallId})`);

          let execResult: any;
          try {
            execResult = await this.toolExecutionHandler.executeSingleTool({
              toolCall,
              toolCallId,
              event,
              userMessage,
              sessionId,
              capabilityCatalog,
              autonomyAgreementStore,
              activeAbortControllerSignal: activeAbortSignal,
              spawnGoalAndAwaitResult,
              emitEvent,
              buildWorkingMemory
            });
          } catch (toolErr: any) {
            console.warn(`[ReActExecutor] Tool execution error for ${toolCall.name}:`, toolErr.message);
            execResult = {
              isProposal: false,
              output: {
                success: false,
                error: toolErr.message || 'Tool execution encountered an unexpected error',
                instruction: 'Analyze the error. If resolvable with different parameters, adjust and retry; otherwise, gracefully conclude and report the blocker to the user.'
              }
            };
          }

          if (execResult.isProposal) {
            proposalEncountered = true;
            break;
          }

          if (execResult.output && execResult.output.success !== false) {
            successfulToolResults.push({
              name: toolCall.name,
              output: execResult.output
            });

            if (execResult.output.webViewLink) {
              actionLinks.push({
                label: execResult.output.title || 'Google Sheet Document',
                url: execResult.output.webViewLink,
                type: 'gdrive'
              });
            }

            const toolDisplay = ToolExecutionHandler.getCognitiveActivityLabel(toolCall.name);
            const rawDetail = toolCall.arguments?.title || toolCall.arguments?.filename || (typeof execResult.output === 'object' && execResult.output?.message ? execResult.output.message : undefined);
            const cleanDetail = typeof rawDetail === 'string' ? rawDetail : undefined;

            // Deduplicate consecutive identical tool steps
            const lastStep = cognitiveSteps[cognitiveSteps.length - 1];
            const isDuplicate = lastStep && lastStep.title === toolDisplay && lastStep.detail === cleanDetail;

            if (!isDuplicate) {
              cognitiveSteps.push({
                title: toolDisplay,
                detail: cleanDetail,
                status: 'completed'
              });
            }

            emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
              content: 'Working',
              phase: 'WORKING',
              subText: `Completed: ${toolDisplay}`,
              cognitiveSteps: [...cognitiveSteps],
              startTime: turnStartTime
            });
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            name: toolCall.name,
            content: typeof execResult.output === 'string' ? execResult.output : JSON.stringify(execResult.output)
          });
        }

        if (proposalEncountered) break;
        continue;
      }

      // No tool calls in this turn: final answer generated!
      finalAnswer = (response.text || '').trim();
      break;
    }

    // Guaranteed Final Synthesis Turn if multi-step tools executed without final response text
    if (!finalAnswer.trim() && !activeAbortSignal?.aborted && !proposalEncountered) {
      console.log(`[ReActExecutor] Multi-step tools finished (${stepCount}/${stepBudget} steps). Triggering final report synthesis...`);
      emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
        content: 'Thinking',
        phase: 'THINKING',
        subText: 'Synthesizing final report...',
        cognitiveSteps: [...cognitiveSteps],
        startTime: turnStartTime
      });

      const synthesisTools: any = [...rawTools];
      synthesisTools._toolChoice = 'none';

      messages.push({
        role: 'user',
        content: '[SYSTEM INSTRUCTION] All operational actions and tools have completed execution. Provide a complete, professional, clear, and well-structured final report to the user now. Present all key data, metrics, comparisons, and insights thoroughly without abrupt truncation.'
      });

      try {
        const synthesisResponse = await this.orchestrator.generate(
          this.buildProfile('Execution', messages, { requiresVision: false, requiresTools: true, requiresThinking: false }),
          messages,
          synthesisTools,
          activeAbortSignal
        );
        finalAnswer = (synthesisResponse.text || '').trim();
      } catch (e: any) {
        console.error('[ReActExecutor] Error generating final synthesis response:', e);
      }
    }

    // Strip legacy UI command syntax if any was hallucinated
    let cleanText = finalAnswer
      .replace(/<UI_COMMAND:\s*SET_THEME_DARK\s*>/gi, '')
      .replace(/<UI_COMMAND:\s*SET_THEME_LIGHT\s*>/gi, '')
      .trim();

    // Fallback if LLM completed tools but yielded completely empty string
    if (!cleanText && successfulToolResults.length > 0) {
      const lastTool = executedSignatures[executedSignatures.length - 1];
      const toolName = lastTool ? lastTool.split(':')[0] : 'Operation';
      cleanText = `✅ **${toolName} completed.** All requested actions have been executed successfully.`;
    }

    if (cognitiveSteps.length === 0) {
      cognitiveSteps.push({
        title: 'Analyzed',
        detail: dynamicGoal,
        status: 'completed'
      });
    }

    const durationSeconds = Math.max(1, Math.round((Date.now() - turnStartTime) / 1000));

    return {
      finalAnswer: cleanText,
      actionLinks,
      cognitiveSteps,
      successfulToolResults,
      durationSeconds,
      hadTools: successfulToolResults.length > 0,
      proposalEncountered
    };
  }

  private buildProfile(
    tier: ExecutionProfile['tier'],
    messages: Array<{ content?: unknown }>,
    requirements: { requiresJSON?: boolean; requiresTools?: boolean; requiresThinking?: boolean; requiresVision?: boolean } = {}
  ): ExecutionProfile {
    const estimatedInputTokens = Math.ceil(messages.reduce((total, message) => {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content || '');
      return total + content.length;
    }, 0) / 4);

    const builder = ExecutionProfileBuilder.forTier(tier).withEstimatedInputTokens(estimatedInputTokens);
    if (estimatedInputTokens >= 6_000) builder.requiresLongContext();
    if (requirements.requiresJSON) builder.requiresJSON();
    if (requirements.requiresTools) builder.requiresTools();
    if (requirements.requiresThinking) builder.requiresThinking();
    if (requirements.requiresVision) builder.requiresVision();
    return builder.build();
  }

  private pruneBloatedContext(messages: QwenMessage[]): QwenMessage[] {
    if (messages.length <= 3) return messages;

    const pruned: QwenMessage[] = [];
    if (messages[0]) pruned.push(messages[0]);
    if (messages[1]) pruned.push(messages[1]);

    const middle = messages.slice(2, -1);
    const recentMiddle = middle.slice(-2);

    for (const msg of recentMiddle) {
      if (typeof msg.content === 'string') {
        const text = msg.content;
        if (text.length > 500 && (text.includes('|---') || text.includes('\n|'))) {
          pruned.push({
            ...msg,
            content: text.slice(0, 350) + '\n[...data table condensed for cognitive efficiency...]'
          });
        } else {
          pruned.push(msg);
        }
      } else {
        pruned.push(msg);
      }
    }

    const last = messages[messages.length - 1];
    if (last) pruned.push(last);

    return pruned;
  }

  private interceptPseudoToolCall(text: string): { toolCall: { id: string; name: string; arguments: any }; cleanedText: string } | null {
    const toolCallTagMatch = text.match(/<tool_call>\s*([A-Za-z0-9_:]+)\s*(\{[\s\S]*?\})\s*<\/tool_call>/i);
    if (toolCallTagMatch) {
      try {
        const rawToolName = toolCallTagMatch[1].trim();
        const jsonStr = toolCallTagMatch[2].trim();
        const parsed = JSON.parse(jsonStr);
        const cleanedText = text.replace(/<tool_call>\s*[A-Za-z0-9_:]+\s*\{[\s\S]*?\}\s*<\/tool_call>/i, '').trim();

        let toolName = rawToolName;
        if (rawToolName === 'fetch_thread_metrics' || rawToolName === 'get_thread_insights') {
          toolName = 'THREADS_GET_INSIGHTS';
        } else if (rawToolName === 'fetch_threads' || rawToolName === 'get_threads') {
          toolName = 'THREADS_GET_POSTS';
        } else if (rawToolName === 'create_spreadsheet') {
          toolName = 'GDRIVE_CREATE_SPREADSHEET';
        }

        return {
          toolCall: {
            id: `call_intercepted_tag_${Date.now()}`,
            name: toolName,
            arguments: parsed
          },
          cleanedText
        };
      } catch (e) {
        console.warn('[ReActExecutor] Failed to parse intercepted <tool_call> JSON:', e);
      }
    }

    const sheetMatch = text.match(/\[sheet\]\s*(\{[\s\S]*\})/i);
    if (sheetMatch) {
      try {
        const jsonStr = sheetMatch[1].trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed && (parsed.headers || parsed.title || parsed.rows)) {
          const cleanedText = text.replace(/\[sheet\]\s*\{[\s\S]*\}/i, '').trim();
          return {
            toolCall: {
              id: `call_intercepted_sheet_${Date.now()}`,
              name: 'GDRIVE_CREATE_SPREADSHEET',
              arguments: parsed
            },
            cleanedText
          };
        }
      } catch (e) {
        console.warn('[ReActExecutor] Failed to parse intercepted [sheet] JSON:', e);
      }
    }

    const actionMatch = text.match(/Action:\s*(?:Call tool\s*)?["']?([A-Za-z0-9_:]+)["']?\s*(?:with:)?\s*(\{[\s\S]*\})/i);
    if (actionMatch) {
      try {
        const toolName = actionMatch[1].trim();
        const jsonStr = actionMatch[2].trim();
        const parsed = JSON.parse(jsonStr);
        const cleanedText = text.replace(/Action:\s*(?:Call tool\s*)?["']?[A-Za-z0-9_:]+["']?\s*(?:with:)?\s*\{[\s\S]*\}/i, '').trim();
        return {
          toolCall: {
            id: `call_intercepted_action_${Date.now()}`,
            name: (toolName === 'SPREADSHEET' || toolName === 'CREATE_SPREADSHEET')
              ? 'GDRIVE_CREATE_SPREADSHEET'
              : (toolName === 'UPDATE_CELL' ? 'GDRIVE_UPDATE_CELL' : toolName),
            arguments: parsed
          },
          cleanedText
        };
      } catch (e) {
        console.warn('[ReActExecutor] Failed to parse intercepted Action JSON:', e);
      }
    }

    return null;
  }

  /**
   * Infers the user's conversational language from their current message and recent chat turns.
   * Ensures interim progress updates match the user's spoken language (e.g. Indonesian, English, Spanish).
   */
  public static inferConversationalLanguage(userMessage: string, history?: QwenMessage[]): string {
    const textToScan = [
      userMessage,
      ...(history ? history.slice(-4).map(m => typeof m.content === 'string' ? m.content : '') : [])
    ].join(' ');

    const INDONESIAN_REGEX = /\b(aku|kamu|saya|dia|kita|kami|mereka|mau|ingin|bisa|tolong|mohon|buatkan|bikin|ubah|ganti|tambah|hapus|tetap|karena|untuk|dengan|dari|ke|di|pada|oleh|bagi|lagi|udah|sudah|belum|akan|sedang|pernah|sempat|yang|ini|itu|sini|situ|sana|mana|siapa|apa|kenapa|bagaimana|ya|yah|nih|dong|kok|deh|kan|loh|lah|tuh|siap|mantap|oke|okee|yoi|sip|noted|nggak|ngga|gak|ga|tidak|bukan|jangan|banget|aja|saja|juga|masih|hanya|cuma|akun|bahasa|posting|postingan|tayang|kelar|beres|jadwal|kirim)\b/i;
    if (INDONESIAN_REGEX.test(textToScan)) {
      return 'Indonesian';
    }

    const SPANISH_REGEX = /\b(hola|por favor|gracias|bueno|hacer|crear|actualizar|cuenta|para|con|este|esta)\b/i;
    if (SPANISH_REGEX.test(textToScan)) {
      return 'Spanish';
    }

    const JAPANESE_CHINESE_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
    if (JAPANESE_CHINESE_REGEX.test(textToScan)) {
      return 'Japanese';
    }

    const ARABIC_REGEX = /[\u0600-\u06FF]/;
    if (ARABIC_REGEX.test(textToScan)) {
      return 'Arabic';
    }

    return 'English';
  }
}

