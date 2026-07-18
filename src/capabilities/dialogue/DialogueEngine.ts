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
import { WorkClassificationPolicy } from '../../core/work-classification/WorkClassificationPolicy';
import { WorkerCapabilityRegistry } from '../../core/work-classification/WorkerCapabilityRegistry';

// Re-export for server bootstrap convenience
export { EventTypes as SERA_EVENTS };

// ── System Prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are SERA — Synthesizing & Evolving Rational Agent.
You are NOT a chatbot. You are an operational agent already integrated into the user's workflow.
You operate as a cognitive partner: you monitor, reason, propose, and act on behalf of the user.

CRITICAL — IDENTITY AND PERSONA:
- You are already present and operational.
- You HAVE full internet access and real-time capabilities via your connected Tools (such as web search, wallets, etc.).
- NEVER claim that you are an AI model without internet access or real-time data. You are SERA, a sovereign agent connected to the world. If you need data, use your tools or rely on the system data provided to you.
- DO NOT expose internal technical jargon to the user. Never mention tool names like 'brave_web_search', 'MCP', 'JSON', or 'API'. Speak naturally. E.g., say "I searched the web" instead of "I used the brave_web_search tool".
- RULE 1 — Pure greeting (ONLY words like "hi", "hello", "helo", "hey", "yo", "hei", "oke", "ok", "sip", "siap" with absolutely no other content): reply with ONE word or very short phrase acknowledging them. Example: "Siap.", "Hadir.", or "Menyimak." Do NOT say "Online."
- RULE 2 — Any message that contains a question, a request, or substantive content: you MUST give a full, real answer. A one-word presence acknowledgment is FORBIDDEN for these.
- RULE 3 — Identity questions ("kamu siapa", "perkenalkan", "who are you", "apa itu SERA", "introduce yourself"): give a clear, brief self-description as an operational agent — in the SAME LANGUAGE as the user's message. Describe what SERA does, not just the name expansion. Keep it to 2-3 sentences.
- NEVER say "How can I help?", "What can I assist with?", or any generic assistant offer.
- No excessive emoji. No self-introduction repetition.

CRITICAL — COMMUNICATION STYLE:
- Be concise. An agent answers in the fewest words that are still precise and complete.
- Be confident. State things as fact, not as offers. "I'll check that." not "I can try to check that for you!"
- Match the user's register: formal if they are formal, casual if they are casual.
- You MUST respond in the exact language of the user's LATEST message (Indonesian → Indonesian, English → English). Switch languages fluidly.
- Write in complete, fluid sentences. Do NOT use long em-dashes (—). Short hyphens (-) are fine.
- NEVER list your own capabilities as a response. Saying "I can do X, Y, Z" is FORBIDDEN unless the user explicitly asks what you can do.
- NEVER end a response with an open offer like "let me know if you need anything", "just ask", or "I'm ready whenever you are".
- When asking for clarification, ask ONE short plain question. Do NOT use bullet points, numbered lists, or structured formatting just to ask a simple question.

CRITICAL — PLATFORM AWARENESS:
- When operating via Slack, write like a knowledgeable colleague, not a helpdesk bot.
- In Slack: no markdown bullet lists unless listing actual data (like addresses or balances). Use plain sentences.
- In Slack: a greeting is operational signal. Respond and move forward. Don’t offer a menu of services.
- In Slack: clarification questions should be ONE line. Example: "Maksudnya 'con' apa — config, contract, atau typo 'can'?"

CRITICAL — SECURITY AND WALLET POLICY:
- You have your own operational wallet. Refer to it as "my balance", "my funds", or "my wallet". NEVER say "vault" or "brankas".
- The user has their own personal wallet. You have READ-ONLY access to it. You CANNOT transfer funds OUT OF the user's wallet.
- When the user asks you to "transfer", "send", or "return" funds, ALWAYS use your own balance. You can only send TO the user's wallet, not FROM it.

CRITICAL — TIMEZONE CONTEXT:
- The user's timezone is provided at the start of your message. Use it to understand relative times like "tomorrow 9am".
- Always normalize time requests to a valid 'cronExpression' or Unix timestamp (UTC).`;

// ── Intent Extraction Prompt ───────────────────────────────────────────────
const INTENT_EXTRACTION_PROMPT = `You are Sera's intent classifier. Analyze the user's message and respond ONLY with a JSON object — no markdown, no explanation.

Supported intents:
- CHECK_NETWORK: user asks about the current network, chain, or blockchain Sera is connected to.
- EXECUTE_UI_COMMAND: user wants to change a UI state, such as dark/light mode or clearing the chat. parameters must include "uiCommand" ("SET_THEME_DARK", "SET_THEME_LIGHT", or "CLEAR_CHAT").
- FORGET_ME: user asks SERA to forget them, delete their data, wipe their memory, or opt-out.
- NONE: anything else (conversation, questions, checking balances, transferring funds, scheduling tasks)

Response format:
{"intent": "CHECK_NETWORK", "parameters": {}}
{"intent": "EXECUTE_UI_COMMAND", "parameters": {"uiCommand": "SET_THEME_DARK"}}
{"intent": "FORGET_ME", "parameters": {}}
{"intent": "NONE", "parameters": {}}

User Context:
Current Time (UTC): \${new Date().toISOString()}
Timezone: UTC+7 (WIB)

User message: `;

/**
 * DialogueEngine — A Capability that handles human↔Sera conversation.
 *
 * Architecture role: Capability Layer (src/capabilities/dialogue/)
 * - Listens for USER_OBSERVATION events on the shared EventBus
 * - Classifies intent: delegates to GoalBridge for actionable intents, LLM for conversation
 * - Emits SPAWN_GOAL for actionable intents (picked up by GoalBridge)
 * - Listens for GOAL_RESULT events and narrates results back via AGENT_SPEAK
 * - Emits UI_COMMAND for theme changes
 * - Has zero knowledge of HTTP, Socket.io, or transport layers
 */
import { ModelOrchestrator } from '../../core/llm/ModelOrchestrator';
import { ExecutionProfile } from '../../core/llm/types';
import { ExecutionProfileBuilder } from './ExecutionProfileBuilder';

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
  private readonly workClassificationPolicy = new WorkClassificationPolicy();
  private readonly workerRegistry = new WorkerCapabilityRegistry();
  private activeAbortController: AbortController | null = null;

  /**
   * TRANSPORT-AGNOSTIC RESPONSE ROUTING
   * Holds the response context for the currently active observation request.
   * This is set at the start of onUserObservation() and cleared when the reply
   * is emitted. DialogueEngine does NOT inspect platform-specific fields.
   * It simply carries this opaque object from input event to output event,
   * allowing CommunicationBridge to route the reply back to the correct channel.
   *
   * BOUNDARY NOTE: No Slack-specific logic shall ever be added here.
   * The entire platform surface area is contained inside CommunicationBridge
   * and the adapter layer.
   */
  private _activeResponseContext: Record<string, any> | undefined = undefined;

  /**
   * PLATFORM CONVERSATION HISTORY
   * Stores recent conversation turns per external platform channel.
   * Key: "platform:channelId" (e.g. "slack:C0B9D2MHMDY")
   * Value: rolling window of the last N {role, content} turns.
   *
   * This gives SERA conversational memory within a Slack thread (or any platform
   * channel) without coupling DialogueEngine to any platform-specific logic.
   * The key uses the opaque channelId from _activeResponseContext.
   */
  private platformConversationHistory: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>> = new Map();
  private readonly PLATFORM_HISTORY_MAX_TURNS = 8; // Keep last 8 turns (4 exchanges)
  
  private consentedUsers: Set<string> = new Set();
  private readonly CONSENT_FILE_PATH = path.join(process.cwd(), '.data', 'consented_users.json');

  private chatHistoryStore: ChatHistoryStore;

  constructor(eventBus: EventEmitter, worldStateService: WorldStateService, capabilityCatalog: any, memoryStore: IWorkingMemory, chatHistoryStore: ChatHistoryStore, orchestrator: ModelOrchestrator, private sessionId: string = 'default') {
    this.eventBus = eventBus;
    this.worldStateService = worldStateService;
    this.capabilityCatalog = capabilityCatalog;
    this.memoryStore = memoryStore;
    this.chatHistoryStore = chatHistoryStore;
    this.orchestrator = orchestrator;
    this.workerRegistry.register({ id: 'dialogue-ui', lane: 'DETERMINISTIC_UI', supportedWorkClasses: ['INSTANT_UI'] });
    this.workerRegistry.register({ id: 'dialogue-model', lane: 'DIALOGUE', supportedWorkClasses: ['CONVERSATION'] });
    const vectorStore = new VectorMemoryStore(sessionId);
    this.memoryQueryService = new MemoryQueryService(
      memoryStore,
      new EpisodicMemoryReader(sessionId),
      vectorStore,
      new QwenAdapter('text-embedding-v3')
    );

    this.loadConsentedUsers();

    this.eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, this.onUserObservation.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_USER_CANCELLED, this.onUserCancelled.bind(this));
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, this.onGoalResult.bind(this));

    console.log('[DialogueEngine] Initialized and listening for dialogue events.');
  }

  public clearHistory(): void {
    // History is managed via UI messages in ChatHistoryStore. Working memory is dynamic.
  }

  private loadConsentedUsers(): void {
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
    const messages: QwenMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];

    const walletState = this.worldStateService.getWalletState();

    // Unified Memory Retrieval
    const memoryAttention = await this.memoryQueryService.query(userMessage, { tokenBudget: 700 });

    const cognitiveState = {
      relevant_facts: {
        userMainWalletAddress: walletState?.address || 'Unknown'
      },
      memory_attention: this.memoryQueryService.toPromptContext(memoryAttention),
      constraints: [
        'User attention is limited. Keep answers concise.',
        'Never hallucinate unverified state.',
        'If the user asks for their balance, you MUST use the CHECK_WALLET_BALANCE tool to fetch it freshly.',
        'If the user asks to transfer or send "all" funds, use the string "all" as the amount parameter. No need to check balance.',
        'CRITICAL: If the user specifies a delay (e.g. "dalam 20dtk", "in 1 hour"), you MUST use the SCHEDULE_GOAL tool, NOT the TRANSFER_FUNDS tool. Put TRANSFER_FUNDS inside the actionIntent of SCHEDULE_GOAL.'
      ]
    };

    messages.push({
      role: 'system',
      content: `[COGNITIVE STATE (WORKING MEMORY)]\n${JSON.stringify(cognitiveState, null, 2)}`
    });

    if (uiCommandExecuted) {
      messages.push({ 
        role: 'system', 
        content: `The system has just executed the user's requested UI action in the background automatically. Acknowledge this naturally and concisely without explaining how it works. Do not claim you lack access to settings.` 
      });
    }

    // Recent Dialogue Context
    // PLATFORM BOUNDARY: When the message originates from an external platform
    // (Slack, Discord, etc.), the chatHistoryStore contains web UI history that
    // is irrelevant and actively harmful — the LLM would respond to UI context
    // instead of the actual Slack message. We skip it entirely for platform messages.
    if (!this._activeResponseContext) {
      // UI/Socket.io origin: include recent web chat history as conversation context
      const recentUi = this.chatHistoryStore.getUiMessages()
        .filter(m => m.type !== 'activity' && m.content)
        .map(m => ({ role: m.role === 'agent' ? 'assistant' as const : 'user' as const, content: m.content! }));
      const context = this.conversationContextCompressor.compress(recentUi, {
        tokenBudget: 700,
        maxRecentTurns: 5
      });

      messages.push(...context.messages);
    } else {
      // External platform origin: inject platform context + conversation history
      const ctxKey = `${this._activeResponseContext.platform}:${this._activeResponseContext.channelId}`;
      const history = this.platformConversationHistory.get(ctxKey) ?? [];

      messages.push({
        role: 'system',
        content: `[PLATFORM CONTEXT] Message arrived via ${this._activeResponseContext.platform}. Rules for this context: (1) Plain prose only, no markdown bullet lists unless displaying structured data. (2) Clarification questions must be ONE short sentence. (3) Do NOT list your capabilities. (4) Do NOT end with open-ended offers to help. Write like a senior colleague, not a support bot.`
      });

      // Inject platform-specific conversation history so SERA has conversational
      // continuity within a Slack thread. Without this, every message is stateless.
      if (history.length > 0) {
        const context = this.conversationContextCompressor.compress(history, {
          tokenBudget: 700,
          maxRecentTurns: this.PLATFORM_HISTORY_MAX_TURNS
        });
        messages.push({
          role: 'system',
          content: `[CONVERSATION HISTORY - selective context from ${history.length} turns in this channel]`
        });
        messages.push(...context.messages);
      }
    }

    return messages;
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

  private async classifyIntent(userMessage: string): Promise<{ intent: string; parameters: Record<string, any> }> {
    try {
      const messages = [
        { role: 'system', content: INTENT_EXTRACTION_PROMPT },
        { role: 'user', content: userMessage }
      ];
      const response = await this.orchestrator.generate(this.profileFor('Execution', messages, { requiresJSON: true }), messages, undefined, this.activeAbortController?.signal);
      const parsed = JSON.parse(response.text.trim());
      return parsed;
    } catch {
      return { intent: 'NONE', parameters: {} };
    }
  }

  private profileFor(
    tier: ExecutionProfile['tier'],
    messages: Array<{ content?: unknown }>,
    requirements: { requiresJSON?: boolean; requiresTools?: boolean; requiresThinking?: boolean } = {}
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
    return builder.build();
  }

  private spawnGoalAndAwaitResult(intent: string, parameters: Record<string, any>): Promise<GoalResultPayload> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return new Promise((resolve) => {
      // Register handler before emitting to avoid race conditions
      this.pendingGoals.set(requestId, resolve);

      const spawnPayload: SpawnGoalPayload = { requestId, intent, parameters };
      this.emitEvent(EventTypes.DOMAIN_GOAL_SPAWNED, spawnPayload);

      // Timeout safety: resolve with error after 15s if no result
      setTimeout(() => {
        if (this.pendingGoals.has(requestId)) {
          this.pendingGoals.delete(requestId);
          resolve({ requestId, success: false, data: {}, errorMessage: 'Goal execution timed out.' });
        }
      }, 15000);
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
    let checkIntent = intent;
    let checkParams = parameters;
    
    if (intent === 'SCHEDULE_GOAL' && parameters && parameters.actionIntent) {
      checkIntent = parameters.actionIntent;
      checkParams = parameters.actionParameters || {};
    }

    if (checkIntent === 'TRANSFER_FUNDS') {
      const walletState = this.worldStateService.getWalletState();
      if (!walletState) return { feasible: false, reason: "Wallet state is completely unknown or disconnected." };

      const requestedAmount = checkParams.amount;
      const currentBalance = walletState.balance; // Using Main Wallet (or Vault depending on logic)

      // Based on rules, Sera writes to Sera Vault balance
      const vaultBalance = walletState.vaultBalance;
      const effectiveBalance = checkParams.fromWallet === 'user_main_wallet' ? currentBalance : vaultBalance;

      if (requestedAmount === 'all') {
        if (effectiveBalance <= 0) return { feasible: false, reason: `Insufficient funds. Available balance is 0 USDC.` };
      } else {
        const amount = parseFloat(requestedAmount);
        if (isNaN(amount) || amount <= 0) return { feasible: false, reason: "Invalid amount specified." };
        if (amount > effectiveBalance) return { feasible: false, reason: `Insufficient funds. Requested: ${amount}, Available: ${effectiveBalance} USDC.` };
      }
    }

    return { feasible: true };
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

  private async onUserObservation(event: StandardEvent<DialogueUserObservedPayload>): Promise<void> {
    const userMessage: string = event.payload.message;

    // Reset abort controller for the new request
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    this.activeAbortController = new AbortController();

    // Capture any response routing context injected by the transport layer (e.g. SlackAdapter).
    // This is stored as opaque state and forwarded on every DIALOGUE_AGENT_SPEAK emit.
    // DialogueEngine does NOT inspect the platform field — it is irrelevant to cognition.
    this._activeResponseContext = (event.payload as any)._responseContext ?? undefined;

    console.log(`[DialogueEngine] Processing DIALOGUE_USER_OBSERVED: "${userMessage}"` +
      (this._activeResponseContext ? ` [routing context: platform=${this._activeResponseContext.platform}]` : ''));

    this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Preparing your request...' });

    try {
      // ── Step 1: Classify intent ──────────────────────────────────────────
      const deterministicUiCommand = this.workClassificationPolicy.uiCommand(userMessage);
      if (deterministicUiCommand) this.workerRegistry.require('INSTANT_UI', 'DETERMINISTIC_UI');
      let { intent, parameters } = deterministicUiCommand
        ? { intent: 'EXECUTE_UI_COMMAND', parameters: { uiCommand: deterministicUiCommand } }
        : await this.classifyIntent(userMessage);
      console.log(`[DialogueEngine] Classified intent: ${intent}`);

      // ── Step 2: Clarification Validation ───────────────────────────────────────
      // (Legacy logic removed - clarification is now natively handled by Tool Calling)

        let uiCommandExecuted = false;

        if (intent === 'EXECUTE_UI_COMMAND') {
          uiCommandExecuted = true;
          const cmd = String(parameters.uiCommand).toUpperCase();
          
          if (cmd === 'SET_THEME_DARK') this.emitEvent(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: 'dark' });
          if (cmd === 'SET_THEME_LIGHT') this.emitEvent(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: 'light' });
          
          if (cmd === 'CLEAR_CHAT') {
            this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: 'Alright, I will clear the chat history for you.' });
            this.emitEvent(EventTypes.UI_COMMAND, { command: 'CLEAR_CHAT_COUNTDOWN' });
            return; // Return immediately to avoid unnecessary LLM generation
          }
          
          // Force fallback to conversational response so the agent acknowledges the action naturally
          intent = 'NONE';
        }

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
        // AUTO-EXECUTE path: Read-only operations and authorized vault operations (e.g. transfers)
        const AUTO_EXECUTE_INTENTS = ['CHECK_NETWORK'];
        const shouldAutoExecute = AUTO_EXECUTE_INTENTS.includes(intent);

        if (shouldAutoExecute) {
          // AUTO-EXECUTE path
          this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
            content: `${intent.split('_').join(' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}...`,
          });
          const result = await this.spawnGoalAndAwaitResult(intent, parameters);
          await this.narrateResult(userMessage, result);
        } else {
          // Pre-Proposal Validation
          const feasibility = this.evaluateFeasibility(intent, parameters);
          if (!feasibility.feasible) {
            const systemRejectionMsg = `The user's requested operation failed the pre-flight feasibility check. Reason: ${feasibility.reason}. Respond strictly as an objective operational system agent. Explain that the request was evaluated against current world state and cannot be prepared. Do NOT apologize. Maintain an operational, matter-of-fact tone.`;
            
            const messages = await this.buildWorkingMemory();
            messages.push({ role: 'system', content: systemRejectionMsg });

            const response = await this.orchestrator.generate(this.profileFor('Execution', messages), messages, undefined, this.activeAbortController?.signal);

            const rawText = response.text.trim();
            // LLM messages are no longer persisted

            this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: rawText });
            return;
          }

          // PROPOSAL path (Risk-Tiered: WRITE/FINANCE/SCHEDULE)
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
          messages.push({ role: 'system', content: systemProposalMsg });
          const proposalResponse = await this.orchestrator.generate(this.profileFor('Reasoning', messages), messages, undefined, this.activeAbortController?.signal);

          let summaryText = proposalResponse.text.trim();
          
          // Strip any UI commands just in case
          const darkThemeRegex = /<UI_COMMAND:\s*SET_THEME_DARK\s*>/gi;
          summaryText = summaryText.replace(darkThemeRegex, '').trim();
          const lightThemeRegex = /<UI_COMMAND:\s*SET_THEME_LIGHT\s*>/gi;
          summaryText = summaryText.replace(lightThemeRegex, '').trim();

          // LLM messages are no longer persisted


          this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryText });
        }
      } else {
        // ── Step 2: Extract Working Memory ────────────────────────────────────────
      let messages = await this.buildWorkingMemory(uiCommandExecuted, userMessage);

      if (forgetMeExecuted) {
        messages.push({
          role: 'system',
          content: "[SYSTEM NOTIFICATION] You have just successfully deleted all of the user's chat history and data from the system per their request. Acknowledge this action concisely in the language the user is speaking."
        });
      }

      // Determine available tools based on intent ──────────────────────────────
        // Programmatic gate: if the message contains substantive content (question words,
        // request verbs, or multiple words), inject an explicit override to prevent the
        // LLM from defaulting to a one-word greeting acknowledgment.
        const isPureGreeting = /^(hi|hello|helo|hei|hey|yo|hai|halo|oke|ok|sip|siap)[\.!\s]*$/i.test(userMessage.trim());
        if (!isPureGreeting) {
          messages.push({
            role: 'system',
            content: `OVERRIDE: The user's message "${userMessage}" is NOT a pure greeting. It contains a question or substantive request. You MUST provide a complete, relevant answer. Responding with only a presence word like "Online." or "Here." is STRICTLY FORBIDDEN for this message. Answer the actual content of what was asked.`
          });
        }

        const availableTools = this.capabilityCatalog?.availableTools() || [];
        
        availableTools.push({
          name: 'REMEMBER_FACT',
          description: 'Use this tool when the user explicitly instructs you to remember, save, or note a fact, rule, or piece of information.',
          parameters: {
            type: 'object',
            properties: {
              fact: { type: 'string', description: 'The exact fact or information to remember.' }
            },
            required: ['fact']
          },
          requiresApproval: false
        });

        const response = await this.orchestrator.generate(this.profileFor('Reasoning', messages, { requiresTools: true }), messages, availableTools, this.activeAbortController?.signal);

        // ── Step 4.5: Handle Native Tool Call (Dual Stack) ───────────────────
        if (response.toolCalls && response.toolCalls.length > 0) {
          const toolCall = response.toolCalls[0];
          console.log(`[DialogueEngine] LLM Native Tool Call selected: ${toolCall.name}`);
          
          const startTime = Date.now();
          
          const toolIntent = toolCall.name;
          let toolParams: Record<string, any> = {};
          try {
            toolParams = typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments;
          } catch (e) {
            console.error('[DialogueEngine] Failed to parse tool arguments:', e);
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
            this.emitEvent(EventTypes.MEMORY_PROPOSAL_REQUESTED, proposal);
            
            messages.push({ role: 'assistant', content: `[TOOL_CALL: REMEMBER_FACT] ${JSON.stringify(toolParams)}` });
            messages.push({ role: 'system', content: `[SYSTEM NOTIFICATION] You have successfully saved the fact "${fact}" to long-term memory. Acknowledge this briefly in the user's language.` });
            
            const summaryResponse = await this.orchestrator.generate(this.profileFor('Execution', messages), messages, [], this.activeAbortController?.signal);
            this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryResponse.text.trim() });
            return;
          }

          // Route tool call through standard execution/proposal path

          // Determine safety dynamically via CapabilityCatalog
          const toolMeta = this.capabilityCatalog?.getTool(toolIntent);
          const isSafe = toolMeta ? !toolMeta.requiresApproval : true;

          if (isSafe) {
            this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
              content: `${toolIntent.split('_').join(' ').toLowerCase().replace(/^./, (c: string) => c.toUpperCase())}...`,
            });
            const result = await this.spawnGoalAndAwaitResult(toolIntent, toolParams);
            const duration = Date.now() - startTime;
            
            // Phase 8: Tool Telemetry
            this.emitEvent('SYSTEM_TELEMETRY' as any, {
              metric: 'tool_execution',
              toolName: toolIntent,
              success: result.success,
              durationMs: duration
            });

            await this.narrateResult(userMessage, result);
          } else {
            // PROPOSAL path for risky tools
            const feasibility = this.evaluateFeasibility(toolIntent, toolParams);
            if (!feasibility.feasible) {
              const messages = await this.buildWorkingMemory();
              messages.push({ 
                role: 'system', 
                content: `CRITICAL OVERRIDE: The user requested an action (${toolIntent}) which is currently NOT FEASIBLE. Reason: ${feasibility.reason}. \nAct as a highly intelligent, logical AI assistant. Explain to the user exactly why the request cannot be processed based on the current data. Use a natural, helpful, and professional tone (similar to Claude), but DO NOT apologize. If applicable, provide a logical next step (e.g., "Please top up your balance first"). DO NOT pretend to schedule or execute the action. DO NOT ask the user to approve anything.` 
              });
              const failResponse = await this.orchestrator.generate(this.profileFor('Execution', messages), messages, undefined, this.activeAbortController?.signal);
              this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: failResponse.text.trim() });
              return;
            }

            console.log(`[DialogueEngine] Tool Call ${toolIntent} requires user approval (Proposal).`);
            this.emitEvent(EventTypes.SYSTEM_PROPOSE_GOAL, {
              intent: toolIntent,
              parameters: toolParams,
              userMessage
            });

            const walletState = this.worldStateService.getWalletState();
            const systemProposalMsg = `You have just prepared an action proposal via Tool Calling.
Intent: ${toolIntent}
Parameters: ${JSON.stringify(toolParams)}
Current World State:
- Agent Vault Balance: ${walletState?.vaultBalance ?? 'Unknown'} USDC
- User Main Wallet Balance: ${walletState?.balance ?? 'Unknown'} USDC

CRITICAL INSTRUCTION:
Do NOT say that you are processing, executing, or transferring the funds right now. The action has NOT happened yet.
You MUST respond naturally to the user acknowledging that you have prepared the request and are currently WAITING for them to click "Approve" or "Reject" in the UI popup. Keep it extremely brief and professional.`;

            const messages = await this.buildWorkingMemory();
            messages.push({ role: 'system', content: systemProposalMsg });

            const proposalResponse = await this.orchestrator.generate(this.profileFor('Reasoning', messages), messages, undefined, this.activeAbortController?.signal);

            const summaryText = proposalResponse.text.trim();
            // LLM messages are no longer persisted
            
            // Telemetry for proposal generation
            this.emitEvent('SYSTEM_TELEMETRY' as any, {
              metric: 'tool_proposal',
              toolName: toolIntent,
              success: true,
              durationMs: Date.now() - startTime
            });

            this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryText });
          }
          return;
        }

        let rawText = response.text.trim();
        console.log(`[DialogueEngine] Qwen responded (${response.usage?.total_tokens || 0} tokens).`);

        // Safety Net: Strip any legacy UI commands the LLM might hallucinate from its history
        const darkThemeRegex = /<UI_COMMAND:\s*SET_THEME_DARK\s*>/gi;
        const lightThemeRegex = /<UI_COMMAND:\s*SET_THEME_LIGHT\s*>/gi;
        rawText = rawText.replace(darkThemeRegex, '').replace(lightThemeRegex, '').trim();

        // LLM messages are no longer persisted


        // Parse any markdown links out of the text to render them as UI buttons instead
        const actionLinks = [];
        const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
        let match;
        while ((match = markdownLinkRegex.exec(rawText)) !== null) {
          // If the LLM generates a link, we move it to the actionLinks array
          actionLinks.push({ label: match[1].includes('http') ? 'View on BaseScan' : match[1], url: match[2] });
        }

        // Strip the markdown links and any trailing link emojis from the text
        rawText = rawText.replace(markdownLinkRegex, '').replace(/🔗\s*/g, '').trim();

        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: rawText, actionLinks });
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[DialogueEngine] LLM generation aborted by user.');
        // We can emit a specific message or just end silently
        // Let's emit an activity update that clears the processing spinner
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
          text: '[Generation stopped by user]',
        });
      } else {
        console.error('[DialogueEngine] Error:', error.message);
        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
          text: 'I apologize, but I encountered an error while communicating with the cognitive system. Please try again.',
        });
      }
    } finally {
      // Clear routing context after every request cycle to prevent cross-request contamination.
      // The next message (from any transport layer) starts with a clean slate.
      this._activeResponseContext = undefined;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async narrateResult(userMessage: string, result: GoalResultPayload): Promise<void> {
    let sanitizedDataStr = JSON.stringify(result.data || {});
    sanitizedDataStr = sanitizedDataStr.replace(/"vaultBalance"/g, '"agentBalance"');
    sanitizedDataStr = sanitizedDataStr.replace(/"vaultAddress"/g, '"agentAddress"');
    sanitizedDataStr = sanitizedDataStr.replace(/"personalBalance"/g, '"userBalance"');
    sanitizedDataStr = sanitizedDataStr.replace(/"personalAddress"/g, '"userAddress"');
    sanitizedDataStr = sanitizedDataStr.replace(/sera vault/gi, 'agent balance');

    const narratePrompt = result.success
      ? `The user asked: "${userMessage}". The Sera system retrieved this data: ${sanitizedDataStr}. Narrate this result naturally and concisely in the same language the user used. IMPORTANT: Do NOT mention the transaction hash or provide any links in your response.`
      : `The user asked: "${userMessage}". The Sera system failed to complete the action. Error: ${result.errorMessage}. Inform the user naturally and concisely.`;

    const messages = await this.buildWorkingMemory();
    messages.push({ role: 'user', content: narratePrompt });

    const narrateResponse = await this.orchestrator.generate(this.profileFor('Execution', messages), messages, undefined, this.activeAbortController?.signal);

    const generatedText = narrateResponse.text.trim();
    // LLM messages are no longer persisted

    const actionLinks = [];
    if (result.success && result.data?.executionId && typeof result.data.executionId === 'string' && result.data.executionId.startsWith('0x')) {
      const txHash = result.data.executionId;
      actionLinks.push({ label: 'View on Basescan', url: `https://basescan.org/tx/${txHash}` });
    }

    this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: generatedText, actionLinks });
  }
}
