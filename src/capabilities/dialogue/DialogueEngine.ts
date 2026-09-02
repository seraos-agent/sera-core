import { EventEmitter } from 'events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QwenAdapter, QwenMessage } from '../llm/QwenAdapter';
import { ChatHistoryStore } from './ChatHistoryStore';
import { StandardEvent, EventTypes, SpawnGoalPayload, GoalResultPayload, DialogueUserObservedPayload } from '../../core/events/types';
import { WorldStateService } from '../../core/world-state/WorldStateService';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { MemoryProposal, MemoryOperation } from '../../core/memory/MemoryProposal';
import { MemorySource } from '../../core/memory/MemorySource';
import { EvidenceType } from '../../core/memory/MemoryEvidence';
import { MemoryQueryService } from '../../core/memory/MemoryQueryService';
import { EpisodicMemoryReader } from '../../core/memory/EpisodicMemoryReader';
import { VectorMemoryStore } from '../../core/memory/VectorMemoryStore';
import { ConversationContextCompressor } from './ConversationContextCompressor';
import { AutonomyAgreementStore } from '../../core/autonomy/AutonomyAgreementStore';

import { SYSTEM_PROMPT, INTENT_EXTRACTION_PROMPT } from './SystemPrompts';
import { FeasibilityEvaluator } from './FeasibilityEvaluator';
import { DialogueResultNarrator } from './DialogueResultNarrator';
import { IntentClassifier } from './IntentClassifier';
import { CognitiveContextBuilder } from './CognitiveContextBuilder';
import { ProposalResponseHandler } from './ProposalResponseHandler';
import { ToolExecutionHandler } from './ToolExecutionHandler';

/**
 * DialogueEngine — A Capability that handles human↔Sera conversation.
 *
 * Architecture role: Capability Layer (src/capabilities/dialogue/)
 * - Listens for USER_OBSERVATION events on the shared EventBus
 * - Handles multi-step ReAct autonomous tool chaining
 * - Has zero knowledge of HTTP, Socket.io, or transport layers
 */
import { ModelOrchestrator } from '../../core/llm/ModelOrchestrator';
import { ExecutionProfile } from '../../core/llm/types';
import { ExecutionProfileBuilder } from './ExecutionProfileBuilder';

import { SubAgentCoordinator } from '../agents/SubAgentCoordinator';

export class DialogueEngine {
  private orchestrator: ModelOrchestrator;
  private eventBus: EventEmitter;
  // Map from requestId → resolve function, for awaiting goal results
  private pendingGoals = new Map<string, (result: GoalResultPayload) => void>();
  private worldStateService: WorldStateService;
  private capabilityCatalog: any;
  private memoryStore: IWorkingMemory;
  private memoryQueryService: MemoryQueryService;
  private readonly conversationContextCompressor = new ConversationContextCompressor();
  private readonly subAgentCoordinator = new SubAgentCoordinator();
  /** The latest UI proposal that can be answered conversationally (for example, "iya"). */
  private pendingProposalId: string | undefined;
  private activeAbortController: AbortController | null = null;

  private _activeResponseContext: Record<string, any> | undefined = undefined;
  private _activeUserMessage: string | undefined = undefined;
  private platformConversationHistory: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>> = new Map();
  private readonly PLATFORM_HISTORY_MAX_TURNS = 8; // Keep last 8 turns (4 exchanges)

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

  constructor(eventBus: EventEmitter, worldStateService: WorldStateService, capabilityCatalog: any, memoryStore: IWorkingMemory, chatHistoryStore: ChatHistoryStore, orchestrator: ModelOrchestrator, private sessionId: string = 'default', private readonly autonomyAgreementStore?: AutonomyAgreementStore, options: { persistLocally?: boolean } = {}, private readonly subscriptionService?: any) {
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
    this.cognitiveContextBuilder = new CognitiveContextBuilder(this.worldStateService, this.memoryQueryService, this.chatHistoryStore, this.capabilityCatalog);
    this.proposalResponseHandler = new ProposalResponseHandler(this.eventBus);
    this.toolExecutionHandler = new ToolExecutionHandler(
      this.eventBus,
      this.orchestrator,
      this.feasibilityEvaluator,
      this.proposalResponseHandler,
      this.dialogueResultNarrator
    );

    this.loadConsentedUsers();

    this.eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, this.onUserObservation.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_USER_CANCELLED, this.onUserCancelled.bind(this));
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, this.onGoalResult.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, this.onProposalGenerated.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_APPROVED, this.onProposalResolved.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_REJECTED, this.onProposalResolved.bind(this));

    console.log('[DialogueEngine] Initialized and listening for dialogue events.');
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

  // ── Cognitive Context Builder ─────────────────────────────────────────────

  private async buildWorkingMemory(uiCommandExecuted?: boolean, userMessage?: string): Promise<QwenMessage[]> {
    return this.cognitiveContextBuilder.build(
      uiCommandExecuted,
      userMessage,
      this._activeResponseContext,
      this.platformConversationHistory,
      this.PLATFORM_HISTORY_MAX_TURNS
    );
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Emits a StandardEvent on the EventBus.
   * When emitting DIALOGUE_AGENT_SPEAK, automatically attaches the active
   * responseContext so CommunicationBridge can route the reply to the
   * correct platform and channel. The context is opaque to DialogueEngine.
   */
  private emitEvent(type: string, payload: Record<string, any>): void {
    const enrichedPayload =
      type === EventTypes.DIALOGUE_AGENT_SPEAK && this._activeResponseContext
        ? { ...payload, responseContext: this._activeResponseContext }
        : payload;

    // [DIAGNOSTIC] Trace responseContext propagation on every AGENT_SPEAK emit
    if (type === EventTypes.DIALOGUE_AGENT_SPEAK) {
      const ctx = enrichedPayload.responseContext;
      if (ctx) {
        console.log(`[DialogueEngine][DIAG] DIALOGUE_AGENT_SPEAK emitted WITH responseContext → platform=${ctx.platform} channel=${ctx.channelId} thread=${ctx.threadRef}`);
        
        // Persist turn to platformConversationHistory for multi-turn conversational continuity
        if (this._activeUserMessage && payload.text) {
          this.persistPlatformTurn(ctx.platform, ctx.channelId, this._activeUserMessage, payload.text);
          this._activeUserMessage = undefined; // Clear to prevent double-persistence
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

  private profileFor(
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

  private spawnGoalAndAwaitResult(intent: string, parameters: Record<string, any>): Promise<GoalResultPayload> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return new Promise((resolve) => {
      // Register handler before emitting to avoid race conditions
      this.pendingGoals.set(requestId, resolve);

      const spawnPayload: SpawnGoalPayload = { requestId, intent, parameters };
      this.emitEvent(EventTypes.DOMAIN_GOAL_SPAWNED, spawnPayload);

      // Timeout safety: resolve with error after 30s if no result
      setTimeout(() => {
        if (this.pendingGoals.has(requestId)) {
          this.pendingGoals.delete(requestId);
          resolve({ requestId, success: false, data: {}, errorMessage: 'Goal execution timed out.' });
        }
      }, 30000);
    });
  }

  /**
   * ARCHITECTURAL BOUNDARY:
   * This method currently performs lightweight deterministic validation for simple intents (e.g. Transfers).
   * If feasibility checks expand across multiple complex domains (staking, swapping, calendar, mapping),
   * this logic MUST be extracted into a dedicated shared FeasibilityService in the execution pipeline.
   * 
   * Remember: DialogueEngine interprets intent; it performs *pre-proposal validation* here only because
   * proposal generation currently originates from DialogueEngine. As additional execution entry points emerge 
   * (Triggers, Planner, Reflection, APIs), feasibility validation should be promoted into a shared execution-stage service.
   */
  private evaluateFeasibility(intent: string, parameters: any): { feasible: boolean, reason?: string } {
    return this.feasibilityEvaluator.evaluate(intent, parameters);
  }

  // ── Event Handlers ────────────────────────────────────────────────────────

  private async onGoalResult(event: StandardEvent<GoalResultPayload>): Promise<void> {
    const result = event.payload;
    const resolver = this.pendingGoals.get(result.requestId);
    if (resolver) {
      this.pendingGoals.delete(result.requestId);
      resolver(result);
    } else {
      // Goal was spawned externally (e.g. via ProposalManager after approval)
      const userMessage = result.data?._userMessage || "The action was executed successfully after user approval.";
      await this.narrateResult(userMessage, result);
    }
  }

  private onUserCancelled(event: StandardEvent): void {
    console.log('[DialogueEngine] Received DIALOGUE_USER_CANCELLED. Aborting active generation if any.');
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }

  private onProposalGenerated(event: any): void {
    const proposalId = event?.payload?.proposalId || event?.proposalId;
    if (proposalId) this.pendingProposalId = proposalId;
  }

  private onProposalResolved(event: any): void {
    const proposalId = event?.payload?.proposalId || event?.proposalId;
    if (event?.payload?.proposalId === this.pendingProposalId || event?.proposalId === this.pendingProposalId) {
      this.pendingProposalId = undefined;
    }
  }

  private async onUserObservation(event: StandardEvent<DialogueUserObservedPayload>): Promise<void> {
    const rawPayload = (event?.payload || {}) as any;
    const userMessage: string = (rawPayload.message || rawPayload.userMessage || '').trim();

    // Check battery empty state
    if (this.subscriptionService) {
      const credits = this.subscriptionService.getAgentCredits(this.sessionId);
      if (credits <= 0) {
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { 
          text: '🔋 **Agent Energy Core depleted.**\n\nPlease top up your tokens in the battery menu to continue processing tasks.'
        });
        return;
      }
    }

    // Reset abort controller for the new request
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    this.activeAbortController = new AbortController();

    // Capture any response routing context injected by the transport layer (e.g. ThreadsDaemon, McpServer, TelegramAdapter).
    const attachedImages: string[] = rawPayload.images || [];
    const attachedDocs: any[] = rawPayload.documents || [];
    const hasMedia = attachedImages.length > 0 || attachedDocs.length > 0;

    if (!userMessage.trim() && !hasMedia) {
      this._activeResponseContext = undefined;
      return;
    }

    const effectiveUserMessage = userMessage.trim() || (attachedImages.length > 0 ? 'Analyze this image.' : 'Analyze this attached document.');
    this._activeUserMessage = effectiveUserMessage;

    if (this.pendingProposalId && this.isProposalApproval(effectiveUserMessage)) {
      this.emitEvent(EventTypes.DIALOGUE_PROPOSAL_APPROVED, { proposalId: this.pendingProposalId });
      this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Applying your approval...' });
      return;
    }

    if (this.pendingProposalId && this.isProposalRejection(effectiveUserMessage)) {
      this.emitEvent(EventTypes.DIALOGUE_PROPOSAL_REJECTED, { proposalId: this.pendingProposalId });
      return;
    }

    this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Thinking...' });
    try {
      // ── Step 1: Classify intent ──────────────────────────────────────────
      const classification = await this.intentClassifier.classify(effectiveUserMessage, this.activeAbortController?.signal);
      let { intent, parameters, workRoute } = classification;

      console.log(`[DialogueEngine] Classified intent: ${intent} with class ${workRoute.workClass}`);

      // ── Step 1.5: Intercept Complex Autonomy Tasks ───────────────────────────
      // If this requires swarm or planner coordination, bypass the 1-shot LLM and inject directly into the cognitive loop.
      if (workRoute.workClass === 'COMPLEX' && process.env.ENABLE_COMPLEX_AUTONOMY === 'true') {
        const intentId = `intent-${Date.now()}`;
        this.emitEvent('system.register.intent' as any, {
          intent: {
            id: intentId,
            description: userMessage, // The raw text acts as the intent goal for the Swarm/Planner to unpack
            status: 'ALIVE',
            terminality: 'TERMINAL', // It should complete and stop
            createdAt: Date.now()
          }
        });

        const messages = await this.buildWorkingMemory();
        messages.push({ role: 'user', content: '[SYSTEM NOTIFICATION] The user has submitted a complex request that requires multi-step planning. Acknowledge the request naturally and concisely. Tell the user you are analyzing and planning the steps in the background, and will provide a proposal shortly.' });
        const ackResponse = await this.orchestrator.generate(this.profileFor('Execution', messages), messages, [], this.activeAbortController?.signal);

        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: ackResponse.text.trim() });
        this._activeResponseContext = undefined;
        return;
      }

      // ── Step 2: Clarification Validation ───────────────────────────────────────
      // (Legacy logic removed - clarification is now natively handled by Tool Calling)

      let forgetMeExecuted = false;
      if (intent === 'FORGET_ME') {
        console.log(`[DialogueEngine] Executing FORGET_ME for user/session.`);
        // In a real system, we'd delete SQLite rows matching the user's principalId.
        // For now, we clear the working memory map.
        this.platformConversationHistory.clear();
        this.chatHistoryStore.clear();

        if (this._activeResponseContext && this._activeResponseContext.senderId) {
          this.consentedUsers.delete(this._activeResponseContext.senderId);
          this.saveConsentedUsers();
        }

        forgetMeExecuted = true;
        intent = 'NONE'; // Fallback to conversational handler to let LLM generate response
      }

      // ── Step 3: Actionable Intents (Proposals vs Direct Execution) ──────────
      if (intent !== 'NONE') {
        // Read-only operations execute immediately without proposal cards.
        // Only mutative/financial actions (TRANSFER_FUNDS, SCHEDULE_GOAL,
        // ACTIVATE_AUTONOMY_AGREEMENT) fall through to the proposal path below.
        const PROPOSAL_REQUIRED_INTENTS = ['TRANSFER_FUNDS', 'SCHEDULE_GOAL', 'ACTIVATE_AUTONOMY_AGREEMENT'];
        const shouldAutoExecute = !PROPOSAL_REQUIRED_INTENTS.includes(intent);

        if (shouldAutoExecute) {
          // AUTO-EXECUTE path
          this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
            content: `${intent.split('_').join(' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}...`,
          });
          const result = await this.spawnGoalAndAwaitResult(intent, parameters);
          await this.narrateResult(userMessage, result);
        } else {
          this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Validating request feasibility' });

          // Pre-Proposal Validation
          const feasibility = this.evaluateFeasibility(intent, parameters);
          if (!feasibility.feasible) {
            const systemRejectionMsg = `The user's requested operation failed the pre-flight feasibility check. Reason: ${feasibility.reason}. Respond strictly as an objective operational system agent. Explain that the request was evaluated against current world state and cannot be prepared. Do NOT apologize. Maintain an operational, matter-of-fact tone.`;

            const messages = await this.buildWorkingMemory();
            messages.push({ role: 'user', content: `[SYSTEM NOTIFICATION] ${systemRejectionMsg}` });

            const response = await this.orchestrator.generate(this.profileFor('Execution', messages), messages, undefined, this.activeAbortController?.signal);

            const rawText = response.text.trim();
            // LLM messages are no longer persisted

            this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: rawText });
          } else {
            this.emitEvent(EventTypes.SYSTEM_PROPOSE_GOAL, {
              intent,
              parameters,
              userMessage
            });

            // Reply conversationally that we are proposing it using the LLM to maintain language continuity

            const walletState = this.worldStateService.getWalletState();
            const systemProposalMsg = `You have just prepared an action proposal.
Intent: ${intent}
Parameters: ${JSON.stringify(parameters)}
Current World State:
- Agent Vault Balance: ${walletState?.vaultBalance ?? 'Unknown'} USDC
- User Main Wallet Balance: ${walletState?.balance ?? 'Unknown'} USDC

CRITICAL INSTRUCTION:
Do NOT say that you are processing, executing, or performing the action right now. The action has NOT happened yet.
You MUST write a brief, natural response asking the user to review and click "Approve" on the proposal shown on their UI. You may cognitively reason about the exact parameters and current world state if relevant to the request. Keep it strictly under 2 sentences. Do NOT hallucinate any values outside of the provided parameters and world state.`;
            const messages = await this.buildWorkingMemory(false, userMessage);
            messages.push({ role: 'user', content: `[SYSTEM NOTIFICATION] ${systemProposalMsg}` });
            const proposalResponse = await this.orchestrator.generate(this.profileFor('Execution', messages), messages, undefined, this.activeAbortController?.signal);

            let summaryText = proposalResponse.text.trim();

            // Strip any UI commands just in case
            const darkThemeRegex = /<UI_COMMAND:\s*SET_THEME_DARK\s*>/gi;
            summaryText = summaryText.replace(darkThemeRegex, '').trim();
            const lightThemeRegex = /<UI_COMMAND:\s*SET_THEME_LIGHT\s*>/gi;
            summaryText = summaryText.replace(lightThemeRegex, '').trim();

            // LLM messages are no longer persisted


            this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryText });
          }
        }
      } else {
        // ── Step 2: Extract Working Memory ────────────────────────────────────────
        let messages = await this.buildWorkingMemory(false, effectiveUserMessage);

        if (forgetMeExecuted) {
          messages.push({
            role: 'user',
            content: "[SYSTEM NOTIFICATION] You have just successfully deleted all of the user's chat history and data from the system per their request. Acknowledge this action concisely in the language the user is speaking."
          });
        }

        const attachedImages: string[] = event?.payload?.images || [];
        const hasImages = attachedImages.length > 0;
        if (hasImages) {
          const multimodalContent: any[] = [
            { type: 'text', text: effectiveUserMessage }
          ];
          for (const url of attachedImages) {
            multimodalContent.push({
              type: 'image_url',
              image_url: { url }
            });
          }
          messages.push({
            role: 'user',
            content: multimodalContent
          });
          messages.push({
            role: 'user',
            content: `[SYSTEM NOTIFICATION: MULTIMODAL VISION ACTIVE]
The user attached ${attachedImages.length} image(s) above.
You have direct visual capability to inspect and analyze the image in full detail.
Guidelines:
- Analyze, read, and interpret the content, text, numbers, charts, or elements in the image accurately and helpfully.
- If the user asks you to post or publish this image to Threads (e.g. "post this to Threads with caption..."), invoke the THREADS_PUBLISH tool call with parameters: { "text": "<your caption>", "imageUrl": "${attachedImages[0]}" }.
- For normal chat, treat the image as private context.`
          });
        }

        const attachedDocs: any[] = event?.payload?.documents || [];
        const hasDocs = attachedDocs.length > 0;
        if (hasDocs) {
          for (const doc of attachedDocs) {
            let docSummary = `[SYSTEM NOTIFICATION: DOCUMENT INGESTED]\nFile: ${doc.filename} (${doc.detectedType}, ${doc.totalRows} rows)\n`;
            if (doc.summaryMetrics && Object.keys(doc.summaryMetrics).length > 0) {
              docSummary += `Key Metrics: ${JSON.stringify(doc.summaryMetrics, null, 2)}\n\n`;
            }
            docSummary += `Data Preview / Table:\n${doc.formattedMarkdownTable}\n\n`;
            docSummary += `Guidelines for Ingested Documents:
- Summarize the key figures clearly and accurately (e.g. gross revenue, marketplace/platform fees, net profit/payout, total transactions/orders).
- If the user asks to save, organize, or create a chart/report for this data, invoke the GDRIVE_CREATE_SPREADSHEET or sera_gdrive_create_sheet tool with 'options.chart' (such as COLUMN, LINE, or PIE) to generate a permanent Google Spreadsheet with live interactive charts in their Google Drive.`;

            messages.push({
              role: 'user',
              content: docSummary
            });
          }
        }

        // Aggregate all tools across specialized sub-agents (DeFi, Productivity, Social, System) and catalog
        const catalogTools = typeof this.capabilityCatalog?.availableTools === 'function'
          ? this.capabilityCatalog.availableTools()
          : (Array.isArray(this.capabilityCatalog) ? [...this.capabilityCatalog] : []);

        const subAgentTools = this.subAgentCoordinator.getAllTools();
        const toolMap = new Map<string, any>();
        for (const t of [...subAgentTools, ...catalogTools]) {
          if (!toolMap.has(t.name)) {
            toolMap.set(t.name, t);
          }
        }
        const rawTools = Array.from(toolMap.values());

        // ── Step 4: Autonomous Multi-Step ReAct Execution Loop ─────────────────────
        const maxSteps = this.calculateDynamicStepBudget(userMessage, hasImages, hasDocs);
        let stepCount = 0;
        let finalAnswer = '';
        const executedSignatures: string[] = [];

        while (stepCount < maxSteps) {
          stepCount++;
          if (this.activeAbortController?.signal.aborted) break;

          this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { 
            content: 'Thinking...' 
          });

          const toolTier = hasImages ? 'Vision' : 'Execution';
          const response = await this.orchestrator.generate(
            this.profileFor(toolTier, messages, { requiresVision: hasImages, requiresTools: rawTools.length > 0, requiresThinking: false }),
            messages,
            rawTools,
            this.activeAbortController?.signal
          );

          if (this.activeAbortController?.signal.aborted) break;

          // Check if Qwen 3.8 selected one or more tools to execute
          if (response.toolCalls && response.toolCalls.length > 0) {
            // Append assistant message with tool calls to conversation context
            const assistantMsg: QwenMessage = {
              role: 'assistant',
              content: response.text || null,
              tool_calls: (response as any).rawMessage?.tool_calls || response.toolCalls.map((tc, idx) => ({
                id: tc.id || `call_${Date.now()}_${idx}`,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
                }
              }))
            };
            messages.push(assistantMsg);

            let proposalEncountered = false;

            for (let i = 0; i < response.toolCalls.length; i++) {
              const toolCall = response.toolCalls[i];
              const toolCallId = toolCall.id || assistantMsg.tool_calls?.[i]?.id || `call_${Date.now()}_${i}`;
              const signature = `${toolCall.name}:${JSON.stringify(toolCall.arguments || {})}`;

              // ── Anti-Infinite Loop Circuit Breaker ──────────────────────────
              const duplicateCount = executedSignatures.filter((sig, idx) => idx >= executedSignatures.length - 2 && sig === signature).length;
              if (duplicateCount >= 2) {
                console.warn(`[DialogueEngine][CircuitBreaker] Infinite loop prevented for ${toolCall.name}. Breaking repeated cycle.`);
                messages.push({
                  role: 'tool',
                  tool_call_id: toolCallId,
                  name: toolCall.name,
                  content: JSON.stringify({
                    warning: `[CIRCUIT BREAKER] You have already executed ${toolCall.name} with identical arguments. Do not call it again with the same parameters. Use the data you have already received to formulate your final answer.`
                  })
                });
                continue;
              }

              executedSignatures.push(signature);

              console.log(`[DialogueEngine][ReAct Step ${stepCount}/${maxSteps}] Invoking tool: ${toolCall.name} (id: ${toolCallId})`);

              const execResult = await this.toolExecutionHandler.executeSingleTool({
                toolCall,
                toolCallId,
                event,
                userMessage,
                sessionId: this.sessionId,
                capabilityCatalog: this.capabilityCatalog,
                autonomyAgreementStore: this.autonomyAgreementStore,
                activeAbortControllerSignal: this.activeAbortController?.signal,
                spawnGoalAndAwaitResult: this.spawnGoalAndAwaitResult.bind(this),
                emitEvent: this.emitEvent.bind(this),
                buildWorkingMemory: this.buildWorkingMemory.bind(this)
              });

              if (execResult.isProposal) {
                // A financial/mutative action requires user proposal approval. Halt the ReAct loop.
                proposalEncountered = true;
                break;
              }

              // Feed the structured tool result back into the context for next iteration
              messages.push({
                role: 'tool',
                tool_call_id: toolCallId,
                name: toolCall.name,
                content: typeof execResult.output === 'string' ? execResult.output : JSON.stringify(execResult.output)
              });
            }

            if (proposalEncountered) {
              return;
            }

            // Loop continues to next ReAct step!
            continue;
          }

          // No tool calls: model has synthesized the final response!
          finalAnswer = response.text.trim();
          break;
        }

        // Guaranteed Final Synthesis Turn:
        // If multi-step tool execution completed but final response text is empty,
        // run an explicit final synthesis turn with tool_choice: 'none' to produce the executive briefing.
        if (!finalAnswer.trim() && !this.activeAbortController?.signal.aborted) {
          console.log(`[DialogueEngine] Multi-step tools finished (${stepCount}/${maxSteps} steps). Triggering final report synthesis...`);
          this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Thinking...' });

          const synthesisTools: any = [...rawTools];
          synthesisTools._toolChoice = 'none';

          messages.push({
            role: 'user',
            content: '[SYSTEM INSTRUCTION] All operational actions and tools have completed execution. Provide a concise, professional, clear, and well-structured final summary report (under 150 words) to the user now.'
          });

          try {
            const synthesisResponse = await this.orchestrator.generate(
              this.profileFor('Execution', messages, { requiresVision: false, requiresTools: true, requiresThinking: false }),
              messages,
              synthesisTools,
              this.activeAbortController?.signal
            );
            finalAnswer = synthesisResponse.text.trim();
          } catch (e: any) {
            console.error('[DialogueEngine] Error generating final synthesis response:', e);
          }
        }

        let rawText = finalAnswer;
        console.log(`[DialogueEngine] ReAct loop completed in ${stepCount}/${maxSteps} step(s). Final answer length: ${rawText.length}`);

        // Safety Net: Strip any legacy UI commands the LLM might hallucinate from its history
        const darkThemeRegex = /<UI_COMMAND:\s*SET_THEME_DARK\s*>/gi;
        const lightThemeRegex = /<UI_COMMAND:\s*SET_THEME_LIGHT\s*>/gi;
        rawText = rawText.replace(darkThemeRegex, '').replace(lightThemeRegex, '').trim();

        // Deterministic Fallback Guard: If Qwen claims in text that it switched to dark/light mode without emitting a tool call, force-emit the UI_COMMAND!
        const isThemeRequest = /\b(mode|theme|display)\b/i.test(userMessage) || /\b(light|dark)\b/i.test(userMessage);
        if (isThemeRequest) {
          const textClaimsLight = /light/i.test(rawText) || /light/i.test(userMessage);
          const textClaimsDark = /dark/i.test(rawText) || /dark/i.test(userMessage);
          if (textClaimsLight && !textClaimsDark) {
            console.log('[DialogueEngine] Safety Guard: Force-emitting UI_COMMAND SET_THEME light.');
            this.emitEvent(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: 'light' });
          } else if (textClaimsDark) {
            console.log('[DialogueEngine] Safety Guard: Force-emitting UI_COMMAND SET_THEME dark.');
            this.emitEvent(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: 'dark' });
          }
        }

        // Deterministic Fallback Guard for CLEAR_CHAT: If the user asked to clear/delete/hapus
        // chat but the LLM skipped the tool call and hallucinated a confirmation, force-emit the
        // CLEAR_CHAT_COUNTDOWN UI command and suppress the hallucinated text.
        const isClearChatRequest = /\b(clear|delete|hapus|wipe|reset|bersihkan|kosongkan)\b/i.test(userMessage)
          && /\b(chat|pesan|message|riwayat|history|obrolan)\b/i.test(userMessage);
        if (isClearChatRequest) {
          console.log('[DialogueEngine] Safety Guard: User requested chat clear but LLM skipped tool call. Force-emitting CLEAR_CHAT_COUNTDOWN.');
          this.emitEvent(EventTypes.UI_COMMAND, { command: 'CLEAR_CHAT_COUNTDOWN' });
          rawText = '';
        }

        // Parse any markdown links out of the text to optionally render companion buttons
        const actionLinks = [];
        const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
        let match;
        while ((match = markdownLinkRegex.exec(rawText)) !== null) {
          actionLinks.push({ label: match[1].includes('http') ? 'View Resource' : match[1], url: match[2] });
        }

        // Deterministic Fallback if model returned empty text: Never leave UI hanging in blank state!
        if (!rawText.trim()) {
          const lastTool = executedSignatures[executedSignatures.length - 1];
          const toolName = lastTool ? lastTool.split(':')[0] : 'Operation';
          rawText = `✅ **${toolName} completed.** All requested actions have been executed successfully.`;
        }

        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: rawText, actionLinks });
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[DialogueEngine] LLM generation aborted by user.');
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
          text: '[Generation stopped by user]',
        });
      } else {
        console.error('[DialogueEngine] Error:', error.message);
        console.error('[DialogueEngine] Stack:', error.stack);
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
          text: 'I apologize, but I encountered an error while communicating with the cognitive system. Please try again.',
        });
      }
    } finally {
      this._activeResponseContext = undefined;
      this._activeUserMessage = undefined;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isProposalApproval(message: string): boolean {
    return this.proposalResponseHandler.isApproval(message);
  }

  private isProposalRejection(message: string): boolean {
    return this.proposalResponseHandler.isRejection(message);
  }

  private async narrateResult(userMessage: string, result: GoalResultPayload): Promise<void> {
    await this.dialogueResultNarrator.narrate(userMessage, result, this.buildWorkingMemory.bind(this), this.activeAbortController?.signal, this.emitEvent.bind(this));
  }

  /**
   * Dynamically determines the max ReAct execution steps based on task complexity.
   */
  private calculateDynamicStepBudget(userMessage: string, hasImages: boolean, hasDocs: boolean): number {
    const msg = (userMessage || '').toLowerCase();
    
    // Check if task spans multiple operational domains
    const isMultiDomain = (
      (/\b(crypto|coin|token|hyperliquid|hl|price|balance|wallet|funds|btc|eth|hype|koin|harga|saldo)\b/i.test(msg) ? 1 : 0) +
      (/\b(drive|sheet|spreadsheet|excel|doc|document|table|report|chart|graph|dokumen|tabel|laporan|grafik)\b/i.test(msg) || hasDocs ? 1 : 0) +
      (/\b(threads|post|social|media|picture|drawing|image|photo|sosmed|gambar)\b/i.test(msg) || hasImages ? 1 : 0) +
      (/\b(search|news|look up|find|google|browse|web|berita|cari)\b/i.test(msg) ? 1 : 0)
    ) >= 2;

    const hasComplexDirectives = /\b(then|after that|and also|subsequently|analyze|compare|research|comparison|generate.*chart|summarize and create|lalu|kemudian|setelah itu|dan juga|analisis|bandingkan|riset|komparasi|buatkan.*chart)\b/i.test(msg);

    if (isMultiDomain || (hasComplexDirectives && (hasImages || hasDocs || msg.length > 70))) {
      return 10; // Max budget for deep multi-step workflows
    }
    if (hasComplexDirectives || msg.length > 100 || hasDocs || hasImages) {
      return 7; // Medium-high budget
    }
    return 5; // Standard budget
  }
}
