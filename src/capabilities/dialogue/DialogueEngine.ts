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
import { DynamicPromptAssembler } from './cognitive/DynamicPromptAssembler';
import { ReActExecutor } from './cognitive/ReActExecutor';
import { ExecutionProfileBuilder } from './ExecutionProfileBuilder';
import { LanguageInference } from './LanguageInference';

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
  private goalContexts = new Map<string, Record<string, any>>();
  private worldStateService: WorldStateService;
  private capabilityCatalog: any;
  private memoryStore: IWorkingMemory;
  private memoryQueryService: MemoryQueryService;
  private readonly subAgentCoordinator = new SubAgentCoordinator();
  private pendingProposalId: string | undefined;
  private activeTaskSession: {
    abortController: AbortController;
    responseContext?: Record<string, any>;
    userMessage: string;
    steeringQueue: Array<{ message: string; timestamp: number }>;
    isExecutingTools: boolean;
    startTime: number;
  } | null = null;

  /** Accumulator for rapid-fire messages during pre-tool supersede */
  private _accumulatedMessages: string[] = [];
  private _accumulateTimer: NodeJS.Timeout | null = null;
  private _accumulateResolve: (() => void) | null = null;
  private readonly ACCUMULATE_MICRO_DELAY_MS = 200;

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

    this.reactExecutor = new ReActExecutor(this.orchestrator, this.toolExecutionHandler);

    this.loadConsentedUsers();
    this.syncPlatformHistoryFromStore();

    this.eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, this.onUserObservation.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_USER_CANCELLED, this.onUserCancelled.bind(this));
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, this.onGoalResult.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, this.onProposalGenerated.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_APPROVED, this.onProposalResolved.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_REJECTED, this.onProposalResolved.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_EXPIRED, this.onProposalResolved.bind(this));

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

  private syncPlatformHistoryFromStore(): void {
    const allPlatforms = this.chatHistoryStore.getAllPlatformMessages();
    for (const [ctxKey, turns] of Object.entries(allPlatforms)) {
      if (!turns || turns.length === 0) continue;
      if (!this.platformConversationHistory.has(ctxKey)) {
        this.platformConversationHistory.set(ctxKey, []);
      }
      const existing = this.platformConversationHistory.get(ctxKey)!;
      if (existing.length === 0) {
        existing.push(...turns.map(t => ({ role: t.role, content: t.content })));
      } else if (turns.length > existing.length) {
        this.platformConversationHistory.set(ctxKey, turns.map(t => ({ role: t.role, content: t.content })));
      }
      const updated = this.platformConversationHistory.get(ctxKey)!;
      while (updated.length > this.PLATFORM_HISTORY_MAX_TURNS * 2) {
        updated.shift();
      }
    }
  }

  private async buildWorkingMemory(uiCommandExecuted?: boolean, userMessage?: string): Promise<QwenMessage[]> {
    await this.chatHistoryStore.ensureLoaded();
    this.syncPlatformHistoryFromStore();

    return this.cognitiveContextBuilder.build(
      uiCommandExecuted,
      userMessage,
      this._activeResponseContext,
      this.platformConversationHistory,
      this.PLATFORM_HISTORY_MAX_TURNS
    );
  }

  private emitEvent(type: string, payload: Record<string, any>): void {
    const activeCtx = payload.responseContext || this._activeResponseContext;
    const enrichedPayload =
      (type === EventTypes.DIALOGUE_AGENT_SPEAK || type === EventTypes.DIALOGUE_ACTIVITY) && activeCtx
        ? { ...payload, responseContext: activeCtx }
        : payload;

    if (type === EventTypes.DIALOGUE_AGENT_SPEAK) {
      if (enrichedPayload.text && typeof enrichedPayload.text === 'string') {
        // Sanitize any artificial AI long em dashes (—) to clean en dashes (–)
        enrichedPayload.text = enrichedPayload.text.replace(/\s*—\s*/g, ' – ').replace(/—/g, ' – ');
        // Sanitize leaked CJK tokens from model generation when conversing in non-Chinese languages
        const cjkMatches = enrichedPayload.text.match(/[\u4e00-\u9fa5]/g);
        const totalChars = enrichedPayload.text.trim().length;
        if (cjkMatches && totalChars > 0 && (cjkMatches.length / totalChars) < 0.25) {
          enrichedPayload.text = enrichedPayload.text
            .replace(/语音\s*call/gi, 'voice call')
            .replace(/语音\s*note/gi, 'voice note')
            .replace(/语音/g, 'suara')
            .replace(/[\u4e00-\u9fa5]+/g, '');
        }
      }
      const ctx = enrichedPayload.responseContext;
      if (ctx) {
        console.log(`[DialogueEngine] Outbound speak routed to ${ctx.platform}:${ctx.channelId}`);
        if (this._activeUserMessage && payload.text && !payload.isInterim) {
          this.persistPlatformTurn(ctx.platform, ctx.channelId, this._activeUserMessage, payload.text);
          this._activeUserMessage = undefined;
        }
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

    // Persist to durable store (local disk + Supabase cloud snapshot)
    this.chatHistoryStore.appendPlatformTurn(platform, channelId, 'user', userMessage);
    this.chatHistoryStore.appendPlatformTurn(platform, channelId, 'assistant', assistantText);
  }

  private spawnGoalAndAwaitResult(intent: string, parameters: Record<string, any>): Promise<GoalResultPayload> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (this._activeResponseContext) {
      this.goalContexts.set(requestId, { ...this._activeResponseContext });
    }

    const isHeavyOperation =
      intent.startsWith('GDRIVE_') ||
      intent.includes('SPREADSHEET') ||
      intent === 'media_generation' ||
      intent === 'generate_image';
    const timeoutMs = isHeavyOperation ? 90000 : 45000;

    return new Promise((resolve) => {
      this.pendingGoals.set(requestId, resolve);
      const spawnPayload: SpawnGoalPayload = {
        requestId,
        intent,
        parameters: {
          ...parameters,
          ...(this._activeResponseContext ? { _responseContext: { ...this._activeResponseContext } } : {})
        }
      };
      this.emitEvent(EventTypes.DOMAIN_GOAL_SPAWNED, spawnPayload);

      setTimeout(() => {
        if (this.pendingGoals.has(requestId)) {
          this.pendingGoals.delete(requestId);
          // Retain goalContexts temporarily for potential late resolution
          setTimeout(() => this.goalContexts.delete(requestId), 300000);
          resolve({ requestId, success: false, data: {}, errorMessage: 'Goal execution timed out.' });
        }
      }, timeoutMs);
    });
  }

  private evaluateFeasibility(intent: string, parameters: any): { feasible: boolean; reason?: string } {
    return this.feasibilityEvaluator.evaluate(intent, parameters);
  }

  private async onGoalResult(event: StandardEvent<GoalResultPayload>): Promise<void> {
    const result = event.payload;
    const resolver = this.pendingGoals.get(result.requestId);
    const originContext = this.goalContexts.get(result.requestId) || result.data?._responseContext;

    if (resolver) {
      this.pendingGoals.delete(result.requestId);
      this.goalContexts.delete(result.requestId);
      resolver(result);
    } else {
      const userMessage = result.data?._userMessage || 'The action was executed successfully after user approval.';
      const contextualEmit = (type: string, payload: Record<string, any>) => {
        const enriched = originContext ? { ...payload, responseContext: originContext } : payload;
        this.emitEvent(type, enriched);
      };
      await this.dialogueResultNarrator.narrate(
        userMessage,
        result,
        this.buildWorkingMemory.bind(this),
        this.activeTaskSession?.abortController.signal,
        contextualEmit
      );
      this.goalContexts.delete(result.requestId);
    }
  }

  private onUserCancelled(event: StandardEvent): void {
    console.log('[DialogueEngine] Received DIALOGUE_USER_CANCELLED. Aborting active generation if any.');
    if (this.activeTaskSession) {
      this.activeTaskSession.abortController.abort();
      this.activeTaskSession = null;
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

    // Check battery / credit limits (ensuring cloud rehydration has resolved)
    if (this.subscriptionService) {
      if (typeof this.subscriptionService.ensureLoaded === 'function') {
        await this.subscriptionService.ensureLoaded();
      }
      let credits = this.subscriptionService.getAgentCredits(this.sessionId);
      if (credits <= 0) {
        // Fallback 1: check operational wallet address
        const walletAddress = (this.worldStateService as any)?.getWalletState?.()?.address;
        if (walletAddress) {
          const walletCredits = this.subscriptionService.getAgentCredits(walletAddress);
          if (walletCredits > 0) {
            credits = walletCredits;
          }
        }
      }

      // Fallback 2: If the user has never had an entry initialized in the ledger,
      // auto-grant 1,000,000 welcome computation tokens (matching Web UI login grant in SocketGateway.ts).
      if (credits <= 0 && typeof this.subscriptionService.hasEntry === 'function' && !this.subscriptionService.hasEntry(this.sessionId)) {
        console.log(`[DialogueEngine] Initializing 1,000,000 welcome computation tokens for session: ${this.sessionId}`);
        this.subscriptionService.addCreditsDirectly(this.sessionId, 1000000);
        credits = this.subscriptionService.getAgentCredits(this.sessionId);
      }

      if (credits <= 0) {
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
          text: '🔋 **Agent Energy Core depleted.**\n\nPlease top up your tokens in the battery menu to continue processing tasks.',
          responseContext: this._activeResponseContext
        });
        return;
      }
    }

    const attachedImages: string[] = rawPayload.images || [];
    const attachedDocs: any[] = rawPayload.documents || [];
    const hasMedia = attachedImages.length > 0 || attachedDocs.length > 0;

    if (!userMessage.trim() && !hasMedia) {
      this._activeResponseContext = undefined;
      return;
    }

    let effectiveUserMessage = userMessage.trim() || (attachedImages.length > 0
      ? 'Analyze and explain the details, numbers, text, and visual content of this attached image.'
      : 'Analyze this attached document.');
    this._activeUserMessage = effectiveUserMessage;

    // Natural Introduction: Detect if user is introducing their name
    const nameIntroMatch = effectiveUserMessage.match(/^(?:halo|hai|hi|hei|yo|oy)?\s*(?:namaku|nama saya|panggil (?:aja|saja)?\s*(?:aku|saya)?|my name is|call me)\s+([a-zA-Z\s]{2,25})/i);
    if (nameIntroMatch && nameIntroMatch[1]) {
      const extractedName = nameIntroMatch[1].trim().replace(/[.,!?:;]$/, '');
      if (extractedName.length >= 2) {
        if ((this.worldStateService as any).setUserPreferredName) {
          (this.worldStateService as any).setUserPreferredName(extractedName);
        }
        if (this.memoryStore && typeof (this.memoryStore as any).storeBelief === 'function') {
          (this.memoryStore as any).storeBelief({
            id: `mem-user-name-${this.sessionId}`,
            category: 'SEMANTIC',
            key: 'user_preferred_name',
            content: `The user's preferred name is "${extractedName}".`,
            status: 'ACTIVE',
            source: 'DIRECT',
            verificationLevel: 'CONFIRMED',
            confidence: 1.0,
            evidenceIds: [],
            contradictionIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        }
        console.log(`[DialogueEngine] User introduced themselves as: "${extractedName}". Saved to WorldState & WorkingMemory.`);
      }
    }

    // Check conversational proposal approval/rejection
    if (this.pendingProposalId && this.proposalResponseHandler.isApproval(effectiveUserMessage)) {
      this.emitEvent(EventTypes.DIALOGUE_PROPOSAL_APPROVED, { proposalId: this.pendingProposalId });
      this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Applying your confirmation...' });
      return;
    }

    if (this.pendingProposalId && this.proposalResponseHandler.isRejection(effectiveUserMessage)) {
      this.emitEvent(EventTypes.DIALOGUE_PROPOSAL_REJECTED, { proposalId: this.pendingProposalId });
      return;
    }

    // Context-Aware Passive Acknowledgment Suppression
    const isPassiveAck = /^(?:ok|okay|k|got it|noted|roger|cool|great|all good|thx|thanks|thank you|sip|siap|mantap|yoi|oke|okee|👍|👌|🙏)$/i.test(effectiveUserMessage.trim());
    if (isPassiveAck && !this.pendingProposalId) {
      const isTaskInProgress = Boolean(this.activeTaskSession);
      const ctxKey = this._activeResponseContext ? `${this._activeResponseContext.platform}:${this._activeResponseContext.channelId}` : '';
      const recentHistory = ctxKey ? this.platformConversationHistory.get(ctxKey) : null;
      const lastSpeakerWasAssistant = recentHistory && recentHistory.length > 0 && recentHistory[recentHistory.length - 1].role === 'assistant';
      const lastAssistantText = lastSpeakerWasAssistant ? recentHistory![recentHistory!.length - 1].content : '';

      // Case 1: Active background task in progress — absorb passive ack so task runs undisturbed
      if (isTaskInProgress) {
        console.log(`[DialogueEngine] Passive acknowledgment ("${effectiveUserMessage}") absorbed during active task. Suppressing redundant bot reply.`);
        if (this._activeResponseContext) {
          this.persistPlatformTurn(this._activeResponseContext.platform, this._activeResponseContext.channelId, effectiveUserMessage, '');
        }
        return;
      }

      // Case 2: No task in progress.
      // Differentiate appreciation/praise ("mantap", "thanks", "keren") from pure closure ("ok", "k", "👍").
      // NEVER suppress appreciation/praise after substantive assistant content — users expect a warm acknowledgment.
      const isAppreciation = /^(?:mantap|keren|cool|great|thx|thanks|thank you|terima kasih|makasih|alhamdulillah|top)$/i.test(effectiveUserMessage.trim());
      const isPureTrailingClosure = /^(?:ok|okay|k|got it|noted|roger|sip|siap|yoi|oke|okee|👍|👌|🙏)$/i.test(effectiveUserMessage.trim());

      // Only suppress pure trailing closures if the assistant's previous message was ALREADY a short closure/pleasantry (<160 chars)
      const lastAssistantWasShortClosure = lastSpeakerWasAssistant && lastAssistantText.length < 160 && (
        /^(?:sama-sama|siap|baik|terima kasih|senang bisa bantu|you're welcome|anytime|kapan pun|ready|standby)/i.test(lastAssistantText.trim()) ||
        /ada yang bisa dibantu lagi|ada yang mau dibahas lagi/i.test(lastAssistantText.trim())
      );

      if (!isAppreciation && isPureTrailingClosure && lastAssistantWasShortClosure) {
        console.log(`[DialogueEngine] Trailing closure ack ("${effectiveUserMessage}") absorbed after prior closure message. Suppressing redundant loop.`);
        if (this._activeResponseContext) {
          this.persistPlatformTurn(this._activeResponseContext.platform, this._activeResponseContext.channelId, effectiveUserMessage, '');
        }
        return;
      }
    }

    // Explicit Task Cancellation Intent Detection
    const isCancelRequest = /^(?:stop|batal|batalkan|cancel|hentikan|udah|sudah|gajadi|ga jadi)$/i.test(effectiveUserMessage.trim());
    if (isCancelRequest && (this.activeTaskSession || this._accumulateResolve)) {
      console.log(`[DialogueEngine] Explicit task cancellation received ("${effectiveUserMessage}"). Aborting active task session.`);
      if (this._accumulateTimer) {
        clearTimeout(this._accumulateTimer);
        this._accumulateTimer = null;
      }
      this._accumulatedMessages = [];
      if (this._accumulateResolve) {
        const resolve = this._accumulateResolve;
        this._accumulateResolve = null;
        resolve();
      }
      if (this.activeTaskSession) {
        this.activeTaskSession.abortController.abort();
        this.activeTaskSession = null;
      }
      this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
        text: 'Baik, pengerjaan tugas telah dihentikan sesuai permintaanmu. 👌',
        responseContext: this._activeResponseContext
      });
      if (this._activeResponseContext) {
        this.persistPlatformTurn(
          this._activeResponseContext.platform,
          this._activeResponseContext.channelId,
          effectiveUserMessage,
          'Baik, pengerjaan tugas telah dihentikan sesuai permintaanmu. 👌'
        );
      }
      return;
    }

    // Absorb rapid-fire message if an accumulation debounce timer is already ticking
    if (this._accumulateResolve) {
      console.log(`[DialogueEngine] Absorbing rapid-fire message into pending accumulator: "${effectiveUserMessage}"`);
      this._accumulatedMessages.push(effectiveUserMessage);
      if (this._accumulateTimer) {
        clearTimeout(this._accumulateTimer);
      }
      this._accumulateTimer = setTimeout(() => {
        const resolve = this._accumulateResolve;
        this._accumulateResolve = null;
        this._accumulateTimer = null;
        if (resolve) resolve();
      }, this.ACCUMULATE_MICRO_DELAY_MS);
      return;
    }

    // Mid-Flight Task Steering (if task is actively executing tools)
    if (this.activeTaskSession && this.activeTaskSession.isExecutingTools) {
      console.log(`[DialogueEngine] Mid-flight steering received during tool execution: "${effectiveUserMessage}"`);
      this.activeTaskSession.steeringQueue.push({
        message: effectiveUserMessage,
        timestamp: Date.now()
      });
      // Instant interim acknowledgment (zero latency)
      this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
        text: 'Siap, aku catat dan langsung sesuaikan dengan langkah pengerjaan sekarang ya... ✍️',
        isInterim: true,
        responseContext: this._activeResponseContext
      });
      if (this._activeResponseContext) {
        this.persistPlatformTurn(
          this._activeResponseContext.platform,
          this._activeResponseContext.channelId,
          effectiveUserMessage,
          ''
        );
      }
      return;
    }

    // Accumulate & Restart (if previous task is running but NOT yet executing operational tools)
    if (this.activeTaskSession && !this.activeTaskSession.isExecutingTools) {
      const priorMessage = this.activeTaskSession.userMessage;
      console.log(`[DialogueEngine] Accumulating superseded message: "${priorMessage}" + "${effectiveUserMessage}"`);
      this.activeTaskSession.abortController.abort();
      this.activeTaskSession = null;

      // Seed accumulator with prior message and current message
      if (this._accumulatedMessages.length === 0 && priorMessage) {
        this._accumulatedMessages.push(priorMessage);
      }
      this._accumulatedMessages.push(effectiveUserMessage);

      if (this._accumulateTimer) {
        clearTimeout(this._accumulateTimer);
      }

      // Wait 200ms for additional rapid-fire bursts before dispatching
      await new Promise<void>((resolve) => {
        this._accumulateResolve = resolve;
        this._accumulateTimer = setTimeout(() => {
          this._accumulateResolve = null;
          this._accumulateTimer = null;
          resolve();
        }, this.ACCUMULATE_MICRO_DELAY_MS);
      });

      // If cancelled during debounce window, abort early
      if (this._accumulatedMessages.length === 0) {
        return;
      }

      // Merge all accumulated messages into a single combined message
      effectiveUserMessage = this._accumulatedMessages.join('\n');
      this._activeUserMessage = effectiveUserMessage;
      this._accumulatedMessages = [];
    }

    const currentAbortController = new AbortController();
    this.activeTaskSession = {
      abortController: currentAbortController,
      responseContext: this._activeResponseContext,
      userMessage: effectiveUserMessage,
      steeringQueue: [],
      isExecutingTools: false,
      startTime: Date.now()
    };

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
      // Turn start: Thinking phase
      this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
        content: 'Thinking',
        phase: 'THINKING',
        subText: 'Reasoning through request...',
        cognitiveSteps: [],
        startTime: turnStartTime
      });

      // Special action: FORGET_ME
      let forgetMeExecuted = false;
      const lower = effectiveUserMessage.toLowerCase();
      if (/^(forget me|hapus data saya|clear my data|lupakan saya)/i.test(lower)) {
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
      const classification = await this.intentClassifier.classify(effectiveUserMessage, {
        hasDocs: attachedDocs.length > 0,
        hasImages: attachedImages.length > 0
      });

      // Update thinking activity with distilled cognitive anchor
      this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
        content: 'Thinking',
        phase: 'THINKING',
        subText: classification.distilledIntent.cognitiveAnchor,
        cognitiveSteps: [],
        startTime: turnStartTime
      });

      const { systemPrompt, tools } = DynamicPromptAssembler.assemble({
        domains: classification.distilledIntent.activeDomains,
        executionStrategy: classification.distilledIntent.executionStrategy,
        subAgentCoordinator: this.subAgentCoordinator,
        capabilityCatalog: this.capabilityCatalog,
        hasImages: attachedImages.length > 0,
        hasDocs: attachedDocs.length > 0,
        userTimezone
      });


      // Ensure chat history and platform turns are loaded and synchronized from Supabase
      await this.chatHistoryStore.ensureLoaded();
      if (typeof (this.worldStateService as any).ensureLoaded === 'function') {
        await (this.worldStateService as any).ensureLoaded();
      }
      this.syncPlatformHistoryFromStore();

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

      // Multimodal vision attachments
      if (attachedImages.length > 0) {
        if (this._activeResponseContext && messages.length > 0 && messages[messages.length - 1].role === 'user') {
          messages.pop();
        }
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
        turnStartTime,
        hasImages: attachedImages.length > 0,
        event,
        userMessage: effectiveUserMessage,
        sessionId: this.sessionId,
        capabilityCatalog: this.capabilityCatalog,
        autonomyAgreementStore: this.autonomyAgreementStore,
        activeAbortSignal: currentAbortController.signal,
        emitEvent: this.emitEvent.bind(this),
        spawnGoalAndAwaitResult: this.spawnGoalAndAwaitResult.bind(this),
        buildWorkingMemory: this.buildWorkingMemory.bind(this),
        steeringQueue: this.activeTaskSession?.steeringQueue,
        onExecutionStateChange: (state) => {
          if (this.activeTaskSession && this.activeTaskSession.abortController === currentAbortController) {
            this.activeTaskSession.isExecutingTools = state.isExecutingTools;
          }
        }
      });

      // Emit final conversational response to user (skipped if proposal was generated to prevent duplicate speech or if turn was aborted)
      if (!execResult.proposalEncountered && !execResult.aborted && execResult.finalAnswer) {
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
          id: Date.now(),
          text: execResult.finalAnswer,
          actionLinks: execResult.actionLinks.length > 0 ? execResult.actionLinks : undefined,
          cognitiveSteps: execResult.cognitiveSteps.length > 0 ? execResult.cognitiveSteps : undefined,
          durationSeconds: execResult.durationSeconds,
          hadTools: execResult.hadTools,
          richContent: execResult.richContent,
          responseContext: this._activeResponseContext
        });
      }

    } catch (error: any) {
      if (error.name === 'AbortError' || currentAbortController.signal.aborted) {
        console.log('[DialogueEngine] Generation aborted by user/superseded.');
        // Silently discard aborted turns without emitting error notice to user
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

        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
          text: fallbackNotice,
          responseContext: this._activeResponseContext
        });
      }
    } finally {
      if (this.activeTaskSession && this.activeTaskSession.abortController === currentAbortController) {
        this.activeTaskSession = null;
        this._activeResponseContext = undefined;
        this._activeUserMessage = undefined;
      }
    }
  }
}
