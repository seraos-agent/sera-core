import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { EventTypes, GoalResultPayload, StandardEvent } from '../../core/events/types';
import { WorldStateService } from '../../core/world-state/WorldStateService';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { MemoryQueryService } from '../../core/memory/MemoryQueryService';
import { EpisodicMemoryReader } from '../../core/memory/EpisodicMemoryReader';
import { VectorMemoryStore } from '../../core/memory/VectorMemoryStore';
import { ModelOrchestrator } from '../../core/llm/ModelOrchestrator';
import { QwenAdapter, QwenMessage } from '../llm/QwenAdapter';
import { ChatHistoryStore } from './ChatHistoryStore';
import { FeasibilityEvaluator } from './FeasibilityEvaluator';
import { DialogueResultNarrator } from './DialogueResultNarrator';
import { IntentClassifier } from './IntentClassifier';
import { CognitiveContextBuilder } from './CognitiveContextBuilder';
import { ProposalResponseHandler } from './ProposalResponseHandler';
import { ToolExecutionHandler } from './ToolExecutionHandler';
import { AutonomyAgreementStore } from '../../core/autonomy/AutonomyAgreementStore';
import { SubAgentCoordinator } from '../agents/SubAgentCoordinator';
import { CognitiveIntake } from './cognitive/CognitiveIntake';
import { DynamicPromptAssembler } from './cognitive/DynamicPromptAssembler';
import { ReActExecutor } from './cognitive/ReActExecutor';
import { ExecutionProfileBuilder } from './ExecutionProfileBuilder';

interface SpawnGoalPayload {
  requestId: string;
  intent: string;
  parameters: Record<string, any>;
}

/**
 * DialogueEngine — Orchestrates human↔Sera conversation and cognitive execution.
 * 
 * Refactored Architecture (Option A):
 * - Delegates semantic perception to CognitiveIntake (replaces regex IntentClassifier)
 * - Composes lean, domain-specific prompts and selective tools via DynamicPromptAssembler
 * - Delegates multi-step autonomous tool execution & self-healing to ReActExecutor
 * 
 * Enforces Rule 1 (Runtime is composition root) & Rule 7 (Universal English Code Standard).
 */
export class DialogueEngine {
  private orchestrator: ModelOrchestrator;
  private eventBus: EventEmitter;
  private pendingGoals = new Map<string, (result: GoalResultPayload) => void>();
  private worldStateService: WorldStateService;
  private capabilityCatalog: any;
  private memoryStore: IWorkingMemory;
  private memoryQueryService: MemoryQueryService;
  private readonly subAgentCoordinator = new SubAgentCoordinator();
  private pendingProposalId: string | undefined;
  private activeAbortController: AbortController | null = null;

  private _activeResponseContext: Record<string, any> | undefined = undefined;
  private _activeUserMessage: string | undefined = undefined;
  private platformConversationHistory: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>> = new Map();
  private readonly PLATFORM_HISTORY_MAX_TURNS = 8;

  private consentedUsers: Set<string> = new Set();
  private readonly CONSENT_FILE_PATH = path.join(process.cwd(), '.data', 'consented_users.json');
  private readonly persistLocally: boolean;

  private chatHistoryStore: ChatHistoryStore;
  private feasibilityEvaluator: FeasibilityEvaluator;
  private dialogueResultNarrator: DialogueResultNarrator;
  private intentClassifier: IntentClassifier;
  private cognitiveContextBuilder: CognitiveContextBuilder;
  private proposalResponseHandler: ProposalResponseHandler;
  private toolExecutionHandler: ToolExecutionHandler;

  // Modern Cognitive Layer (Phase A)
  private cognitiveIntake: CognitiveIntake;
  private reactExecutor: ReActExecutor;

  constructor(
    eventBus: EventEmitter,
    worldStateService: WorldStateService,
    capabilityCatalog: any,
    memoryStore: IWorkingMemory,
    chatHistoryStore: ChatHistoryStore,
    orchestrator: ModelOrchestrator,
    private sessionId: string = 'default',
    private readonly autonomyAgreementStore?: AutonomyAgreementStore,
    options: { persistLocally?: boolean } = {},
    private readonly subscriptionService?: any
  ) {
    this.eventBus = eventBus;
    this.worldStateService = worldStateService;
    this.capabilityCatalog = capabilityCatalog;
    this.memoryStore = memoryStore;
    this.chatHistoryStore = chatHistoryStore;
    this.orchestrator = orchestrator;
    this.persistLocally = options.persistLocally ?? true;

    const vectorStore = new VectorMemoryStore(sessionId, { persistLocally: this.persistLocally });
    this.memoryQueryService = new MemoryQueryService(
      memoryStore,
      new EpisodicMemoryReader(sessionId, { persistLocally: this.persistLocally }),
      vectorStore,
      new QwenAdapter('text-embedding-v3')
    );

    this.feasibilityEvaluator = new FeasibilityEvaluator(this.worldStateService);
    this.dialogueResultNarrator = new DialogueResultNarrator(this.eventBus, this.orchestrator);
    this.intentClassifier = new IntentClassifier();
    this.cognitiveContextBuilder = new CognitiveContextBuilder(
      this.worldStateService,
      this.memoryQueryService,
      this.chatHistoryStore,
      this.capabilityCatalog
    );
    this.proposalResponseHandler = new ProposalResponseHandler(this.eventBus);
    this.toolExecutionHandler = new ToolExecutionHandler(
      this.eventBus,
      this.orchestrator,
      this.feasibilityEvaluator,
      this.proposalResponseHandler,
      this.dialogueResultNarrator
    );

    // Modular Cognitive Pipeline components
    this.cognitiveIntake = new CognitiveIntake(this.orchestrator);
    this.reactExecutor = new ReActExecutor(this.orchestrator, this.toolExecutionHandler);

    this.loadConsentedUsers();

    this.eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, this.onUserObservation.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_USER_CANCELLED, this.onUserCancelled.bind(this));
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, this.onGoalResult.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, this.onProposalGenerated.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_APPROVED, this.onProposalResolved.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_REJECTED, this.onProposalResolved.bind(this));

    console.log('[DialogueEngine] Initialized with Modular Cognitive Pipeline (Option A).');
  }

  public clearHistory(): void {
    // History is managed via UI messages in ChatHistoryStore. Working memory is dynamic.
  }

  private loadConsentedUsers(): void {
    if (!this.persistLocally) return;
    try {
      if (fs.existsSync(this.CONSENT_FILE_PATH)) {
        const data = fs.readFileSync(this.CONSENT_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.consentedUsers = new Set(parsed);
        }
      }
    } catch (e) {
      console.error('[DialogueEngine] Failed to load consented users:', e);
    }
  }

  private saveConsentedUsers(): void {
    if (!this.persistLocally) return;
    try {
      const dir = path.dirname(this.CONSENT_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.CONSENT_FILE_PATH, JSON.stringify(Array.from(this.consentedUsers)));
    } catch (e) {
      console.error('[DialogueEngine] Failed to save consented users:', e);
    }
  }

  private async buildWorkingMemory(uiCommandExecuted?: boolean, userMessage?: string): Promise<QwenMessage[]> {
    return this.cognitiveContextBuilder.build(
      uiCommandExecuted,
      userMessage,
      this._activeResponseContext,
      this.platformConversationHistory,
      this.PLATFORM_HISTORY_MAX_TURNS
    );
  }

  private emitEvent(type: string, payload: Record<string, any>): void {
    const enrichedPayload =
      type === EventTypes.DIALOGUE_AGENT_SPEAK && this._activeResponseContext
        ? { ...payload, responseContext: this._activeResponseContext }
        : payload;

    if (type === EventTypes.DIALOGUE_AGENT_SPEAK) {
      const ctx = enrichedPayload.responseContext;
      if (ctx) {
        console.log(`[DialogueEngine][DIAG] DIALOGUE_AGENT_SPEAK emitted WITH responseContext → platform=${ctx.platform} channel=${ctx.channelId} thread=${ctx.threadRef}`);
        if (this._activeUserMessage && payload.text) {
          this.persistPlatformTurn(ctx.platform, ctx.channelId, this._activeUserMessage, payload.text);
          this._activeUserMessage = undefined;
        }
      } else {
        console.log(`[DialogueEngine][DIAG] DIALOGUE_AGENT_SPEAK emitted WITHOUT responseContext (UI/Socket reply only)`);
      }
    }

    const event: StandardEvent<any> = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      payload: enrichedPayload,
      timestamp: Date.now(),
      source: 'DialogueEngine'
    };
    this.eventBus.emit(type, event);
  }

  private persistPlatformTurn(platform: string, channelId: string, userMessage: string, assistantText: string): void {
    const ctxKey = `${platform}:${channelId}`;
    if (!this.platformConversationHistory.has(ctxKey)) {
      this.platformConversationHistory.set(ctxKey, []);
    }
    const history = this.platformConversationHistory.get(ctxKey)!;
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: assistantText });

    while (history.length > this.PLATFORM_HISTORY_MAX_TURNS * 2) {
      history.shift();
    }
  }

  private spawnGoalAndAwaitResult(intent: string, parameters: Record<string, any>): Promise<GoalResultPayload> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return new Promise((resolve) => {
      this.pendingGoals.set(requestId, resolve);
      const spawnPayload: SpawnGoalPayload = { requestId, intent, parameters };
      this.emitEvent(EventTypes.DOMAIN_GOAL_SPAWNED, spawnPayload);

      setTimeout(() => {
        if (this.pendingGoals.has(requestId)) {
          this.pendingGoals.delete(requestId);
          resolve({ requestId, success: false, data: {}, errorMessage: 'Goal execution timed out.' });
        }
      }, 30000);
    });
  }

  private evaluateFeasibility(intent: string, parameters: any): { feasible: boolean; reason?: string } {
    return this.feasibilityEvaluator.evaluate(intent, parameters);
  }

  private async onGoalResult(event: StandardEvent<GoalResultPayload>): Promise<void> {
    const result = event.payload;
    const resolver = this.pendingGoals.get(result.requestId);
    if (resolver) {
      this.pendingGoals.delete(result.requestId);
      resolver(result);
    } else {
      const userMessage = result.data?._userMessage || 'The action was executed successfully after user approval.';
      await this.dialogueResultNarrator.narrate(userMessage, result, this.buildWorkingMemory.bind(this), this.activeAbortController?.signal, this.emitEvent.bind(this));
    }
  }

  private onUserCancelled(event: StandardEvent): void {
    console.log('[DialogueEngine] Received DIALOGUE_USER_CANCELLED. Aborting active generation if any.');
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }

  private onProposalGenerated(event: StandardEvent): void {
    this.pendingProposalId = event.payload.proposalId;
  }

  private onProposalResolved(event: StandardEvent): void {
    this.pendingProposalId = undefined;
  }

  /**
   * Main Entry Point: Receives observations from the user (UI, Socket, or Transport Bridges).
   */
  public async onUserObservation(event: StandardEvent): Promise<void> {
    const rawPayload = event.payload || {};
    this._activeResponseContext = rawPayload.responseContext || undefined;
    const userMessage: string = (rawPayload.message || rawPayload.userMessage || '').trim();

    // Check battery / credit limits
    if (this.subscriptionService) {
      const credits = this.subscriptionService.getAgentCredits(this.sessionId);
      if (credits <= 0) {
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
          text: '🔋 **Agent Energy Core depleted.**\n\nPlease top up your tokens in the battery menu to continue processing tasks.'
        });
        return;
      }
    }

    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    this.activeAbortController = new AbortController();

    const attachedImages: string[] = rawPayload.images || [];
    const attachedDocs: any[] = rawPayload.documents || [];
    const hasMedia = attachedImages.length > 0 || attachedDocs.length > 0;

    if (!userMessage.trim() && !hasMedia) {
      this._activeResponseContext = undefined;
      return;
    }

    const effectiveUserMessage = userMessage.trim() || (attachedImages.length > 0
      ? 'Analyze and explain the details, numbers, text, and visual content of this attached image.'
      : 'Analyze this attached document.');
    this._activeUserMessage = effectiveUserMessage;

    // Check conversational proposal approval/rejection
    if (this.pendingProposalId && this.proposalResponseHandler.isApproval(effectiveUserMessage)) {
      this.emitEvent(EventTypes.DIALOGUE_PROPOSAL_APPROVED, { proposalId: this.pendingProposalId });
      this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Applying your approval...' });
      return;
    }

    if (this.pendingProposalId && this.proposalResponseHandler.isRejection(effectiveUserMessage)) {
      this.emitEvent(EventTypes.DIALOGUE_PROPOSAL_REJECTED, { proposalId: this.pendingProposalId });
      return;
    }

    const turnStartTime = Date.now();

    // Emit live thinking state immediately upon receiving user input
    this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
      content: 'Thinking',
      phase: 'THINKING',
      subText: 'Analyzing intent...',
      cognitiveSteps: [],
      startTime: turnStartTime
    });

    try {
      // ── Phase 1: Cognitive Intake & Dynamic Perception ──────────────────────
      const intakeResult = await this.cognitiveIntake.evaluate({
        userMessage: effectiveUserMessage,
        hasImages: attachedImages.length > 0,
        hasDocs: attachedDocs.length > 0,
        abortSignal: this.activeAbortController?.signal
      });

      console.log(`[DialogueEngine] Cognitive Intake: domains=[${intakeResult.domains.join(', ')}] strategy=${intakeResult.executionStrategy} thought="${intakeResult.userFacingThought}"`);

      // Turn start: Thinking phase with active Analyzing sub-step
      this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
        content: 'Thinking',
        phase: 'THINKING',
        subText: 'Reasoning through request...',
        cognitiveSteps: [
          { title: 'Analyzing', detail: 'Evaluating request context and actions...', status: 'active' }
        ],
        startTime: turnStartTime
      });

      // Special action: FORGET_ME
      let forgetMeExecuted = false;
      if (intakeResult.intent === 'FORGET_ME') {
        console.log('[DialogueEngine] Executing FORGET_ME for user/session.');
        this.platformConversationHistory.clear();
        this.chatHistoryStore.clear();
        if (this._activeResponseContext?.senderId) {
          this.consentedUsers.delete(this._activeResponseContext.senderId);
          this.saveConsentedUsers();
        }
        forgetMeExecuted = true;
      }

      // ── Phase 2: Dynamic Capability & Prompt Assembly ───────────────────────
      const userTimezone = (this.worldStateService.getTemporalState() as any)?.timezone;
      const { systemPrompt, tools } = DynamicPromptAssembler.assemble({
        domains: intakeResult.domains,
        executionStrategy: intakeResult.executionStrategy,
        subAgentCoordinator: this.subAgentCoordinator,
        capabilityCatalog: this.capabilityCatalog,
        hasImages: attachedImages.length > 0,
        hasDocs: attachedDocs.length > 0,
        userTimezone
      });

      // Build working memory with dynamic system prompt
      let messages = await this.cognitiveContextBuilder.build(
        false,
        effectiveUserMessage,
        this._activeResponseContext,
        this.platformConversationHistory,
        this.PLATFORM_HISTORY_MAX_TURNS,
        systemPrompt
      );

      if (forgetMeExecuted) {
        messages.push({
          role: 'user',
          content: "[SYSTEM NOTIFICATION] You have just successfully deleted all of the user's chat history and data from the system per their request. Acknowledge this action concisely in the language the user is speaking."
        });
      }

      // Inject cognitive anchor as guidance
      if (intakeResult.cognitiveAnchor) {
        messages.push({
          role: 'user',
          content: `[COGNITIVE GOAL] ${intakeResult.cognitiveAnchor}`
        });
      }

      // Multimodal vision attachments
      if (attachedImages.length > 0) {
        const multimodalContent: any[] = [{ type: 'text', text: effectiveUserMessage }];
        for (const url of attachedImages) {
          if (url && typeof url === 'string' && !url.startsWith('blob:')) {
            multimodalContent.push({ type: 'image_url', image_url: { url } });
          }
        }
        messages.push({ role: 'user', content: multimodalContent });
        messages.push({
          role: 'user',
          content: `[SYSTEM NOTIFICATION: MULTIMODAL VISION ACTIVE]\nThe user attached ${attachedImages.length} image(s). Inspect and analyze the image accurately. If requested to publish to Threads, use THREADS_PUBLISH.`
        });
      }

      // Ingested document attachments
      if (attachedDocs.length > 0) {
        for (const doc of attachedDocs) {
          let docSummary = `[SYSTEM NOTIFICATION: DOCUMENT INGESTED]\nFile: ${doc.filename} (${doc.detectedType}, ${doc.totalRows} rows)\n`;
          if (doc.summaryMetrics && Object.keys(doc.summaryMetrics).length > 0) {
            docSummary += `Key Metrics: ${JSON.stringify(doc.summaryMetrics, null, 2)}\n\n`;
          }
          docSummary += `Data Preview / Table:\n${doc.formattedMarkdownTable}\n\n`;
          docSummary += `Guidelines for Ingested Documents:\n- Summarize the key figures accurately.\n- If the user asks to save, format, or chart this data, invoke GDRIVE_CREATE_SPREADSHEET with options.chart.`;
          messages.push({ role: 'user', content: docSummary });
        }
      }

      // ── Phase 3: Autonomous Multi-Step ReAct Execution ───────────────────────
      const execResult = await this.reactExecutor.execute({
        messages,
        rawTools: tools,
        stepBudget: intakeResult.stepBudget,
        dynamicGoal: intakeResult.userFacingThought,
        turnStartTime,
        hasImages: attachedImages.length > 0,
        event,
        userMessage: effectiveUserMessage,
        sessionId: this.sessionId,
        capabilityCatalog: this.capabilityCatalog,
        autonomyAgreementStore: this.autonomyAgreementStore,
        activeAbortSignal: this.activeAbortController?.signal,
        emitEvent: this.emitEvent.bind(this),
        spawnGoalAndAwaitResult: this.spawnGoalAndAwaitResult.bind(this),
        buildWorkingMemory: this.buildWorkingMemory.bind(this)
      });

      // Emit final conversational response to user
      this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
        id: Date.now(),
        text: execResult.finalAnswer,
        actionLinks: execResult.actionLinks.length > 0 ? execResult.actionLinks : undefined,
        cognitiveSteps: execResult.cognitiveSteps.length > 0 ? execResult.cognitiveSteps : undefined,
        durationSeconds: execResult.durationSeconds,
        hadTools: execResult.hadTools
      });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[DialogueEngine] Generation aborted by user.');
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: '[Generation stopped by user]' });
      } else {
        console.error('[DialogueEngine] Error:', error.message);
        console.error('[DialogueEngine] Stack:', error.stack);

        const errMsg = (error?.message || '').toLowerCase();
        let fallbackNotice = '';

        if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('rate limit')) {
          fallbackNotice = `⚠️ **AI Service Capacity / Quota Limit Exceeded**\n` +
            `The cognitive model service has reached its API capacity or quota limit.\n\n` +
            `• **Diagnosis**: HTTP 429 / Insufficient Quota from upstream model provider.\n` +
            `• **Action**: Please check your API quota or provider account.`;
        } else if (errMsg.includes('timeout') || errMsg.includes('econnreset') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('504')) {
          fallbackNotice = `⚠️ **AI Gateway Timeout / Service Unavailable**\n` +
            `Unable to establish a stable connection with the upstream model provider after multiple retry attempts.\n\n` +
            `• **Diagnosis**: Upstream cognitive service is experiencing high latency.\n` +
            `• **Action**: Please wait a moment and send your message again.`;
        } else {
          fallbackNotice = `⚠️ **Cognitive Execution Interrupted**\n` +
            `An unexpected system error occurred during execution:\n` +
            `\`${error?.message || 'Unknown cognitive error'}\`\n\n` +
            `• **Action**: Please try rephrasing your request.`;
        }

        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: fallbackNotice });
      }
    } finally {
      this._activeResponseContext = undefined;
      this._activeUserMessage = undefined;
    }
  }
}
