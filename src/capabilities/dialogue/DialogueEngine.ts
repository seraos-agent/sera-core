import { EventEmitter } from 'events';
import { QwenAdapter, QwenMessage } from '../llm/QwenAdapter';
import { chatHistoryStore } from './ChatHistoryStore';
import { StandardEvent, EventTypes, SpawnGoalPayload, GoalResultPayload, DialogueUserObservedPayload } from '../../core/events/types';
import { WorldStateService } from '../../core/world-state/WorldStateService';

// Re-export for server bootstrap convenience
export { EventTypes as SERA_EVENTS };

// ── System Prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are SERA (Synthesizing & Evolving Rational Agent), an advanced Agentic OS AI assistant.
You operate as an intelligent interface between the human owner and the SERA Core cognitive system.
You MUST communicate naturally in the exact same language as the user's LATEST message.
If the user's LATEST message is in English, you MUST reply in English. If it is in Indonesian, you MUST reply in Indonesian.
Do not limit yourself to any specific language, and do not get stuck in a previous language if the user switches languages.
Keep responses concise and helpful.

CRITICAL — UI CONTROL PROTOCOL:
If the user explicitly asks to switch to dark mode (mode gelap/dark), embed exactly this tag in your response: <UI_COMMAND:SET_THEME_DARK>
If the user explicitly asks to switch to light mode (mode terang/light), embed exactly this tag in your response: <UI_COMMAND:SET_THEME_LIGHT>
These tags are invisible to the user — they are intercepted by the system. Always include a natural language confirmation alongside them.

CRITICAL — SECURITY AND WALLET POLICY & PERSONA:
- You have your own operational wallet (internally called 'SERA_VAULT'). To the user, refer to this simply as "my balance" or "my funds". Do NOT use the term "Sera Vault" or "Brankas" with the user.
- The user has their own personal wallet (internally called 'USER_MAIN_WALLET'). You have strictly READ-ONLY access to it. You CANNOT transfer funds OUT OF the user's wallet.
- Therefore, when the user asks you to "transfer", "send", or "return" funds, ALWAYS use funds from your own balance (SERA_VAULT). You can only send TO the user's wallet, not FROM it.

CRITICAL — TIMEZONE CONTEXT:
- The user's timezone is provided at the start of your message. Use it to understand relative times like "tomorrow 9am".
- You must always normalize time requests to a valid 'cronExpression' or Unix timestamp (UTC).`;

// ── Intent Extraction Prompt ───────────────────────────────────────────────
const INTENT_EXTRACTION_PROMPT = `You are SERA's intent classifier. Analyze the user's message and respond ONLY with a JSON object — no markdown, no explanation.

Supported intents:
- CHECK_WALLET_BALANCE: user asks about wallet balance, saldo, dompet, ETH, crypto balance
- CHECK_NETWORK: user asks about the current network, chain, blockchain SERA is connected to
- TRANSFER_FUNDS: user wants to send, transfer, or kirim crypto to an address. parameters must include "recipient" (object), "amount" (number or "all"), "asset" (string, MUST DEFAULT TO "usdc" unless explicitly specified as another asset), and "fromWallet" (string, MUST ALWAYS BE "sera_vault"). The "recipient" MUST be an object: {"type": "USER_MAIN_WALLET" | "SERA_VAULT" | "EXTERNAL_ADDRESS", "address": "0x..." (only if EXTERNAL_ADDRESS)}. Use "USER_MAIN_WALLET" if they refer to their own wallet (dompet saya, kembalikan uang saya, dompet utama). Use "SERA_VAULT" if they refer to your balance (saldo kamu, saldo agen).
- SCHEDULE_GOAL: user wants to do an action in the future or on a recurring basis. parameters must include "scheduleType" ("cron" or "exact"), "humanIntent" (A professional, clear, and concise summary of WHEN this will happen, translated into a formal statement. Do NOT just copy the user's raw chat message), "cronExpression" (if recurring, in UTC), "delaySeconds" (if exact timestamp, how many seconds from now this should execute. e.g. 30 for 30 seconds from now), "actionIntent" (e.g. "CHECK_WALLET_BALANCE" or "TRANSFER_FUNDS"), and "actionParameters".
- NONE: anything else (conversation, questions, commands, UI changes)

Response format:
{"intent": "CHECK_WALLET_BALANCE", "parameters": {"asset": "eth"}}
{"intent": "CHECK_NETWORK", "parameters": {}}
{"intent": "TRANSFER_FUNDS", "parameters": {"recipient": {"type": "EXTERNAL_ADDRESS", "address": "0x..."}, "amount": 10, "asset": "usdc", "fromWallet": "sera_vault"}}
{"intent": "TRANSFER_FUNDS", "parameters": {"recipient": {"type": "USER_MAIN_WALLET"}, "amount": "all", "asset": "usdc", "fromWallet": "sera_vault"}}
{"intent": "SCHEDULE_GOAL", "parameters": {"scheduleType": "cron", "humanIntent": "every monday 9 AM", "cronExpression": "0 2 * * 1", "actionIntent": "CHECK_WALLET_BALANCE", "actionParameters": {}}}
{"intent": "SCHEDULE_GOAL", "parameters": {"scheduleType": "exact", "humanIntent": "in 30 seconds", "delaySeconds": 30, "actionIntent": "TRANSFER_FUNDS", "actionParameters": {"recipient": {"type": "SERA_VAULT"}, "amount": 10, "asset": "usdc", "fromWallet": "sera_vault"}}}
{"intent": "NONE", "parameters": {}}

User Context:
Current Time (UTC): \${new Date().toISOString()}
Timezone: UTC+7 (WIB)

User message: `;

/**
 * DialogueEngine — A Capability that handles human↔SERA conversation.
 *
 * Architecture role: Capability Layer (src/capabilities/dialogue/)
 * - Listens for USER_OBSERVATION events on the shared EventBus
 * - Classifies intent: delegates to GoalBridge for actionable intents, LLM for conversation
 * - Emits SPAWN_GOAL for actionable intents (picked up by GoalBridge)
 * - Listens for GOAL_RESULT events and narrates results back via AGENT_SPEAK
 * - Emits UI_COMMAND for theme changes
 * - Has zero knowledge of HTTP, Socket.io, or transport layers
 */
export class DialogueEngine {
  private llm: QwenAdapter;
  private eventBus: EventEmitter;
  private conversationHistory: QwenMessage[];
  // Map from requestId → resolve function, for awaiting goal results
  private pendingGoals = new Map<string, (result: GoalResultPayload) => void>();

  // Map from proposalId → proposal data (awaiting user approval)
  private pendingProposals = new Map<string, { intent: string, parameters: Record<string, any>, userMessage: string }>();
  private worldStateService: WorldStateService;

  constructor(eventBus: EventEmitter, worldStateService: WorldStateService) {
    this.eventBus = eventBus;
    this.worldStateService = worldStateService;
    this.llm = new QwenAdapter();

    this.conversationHistory = chatHistoryStore.getLlmMessages();
    if (this.conversationHistory.length === 0) {
      const sysMsg: QwenMessage = { role: 'system', content: SYSTEM_PROMPT };
      this.conversationHistory.push(sysMsg);
      chatHistoryStore.appendLlmMessage(sysMsg);
    }

    this.eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, this.onUserObservation.bind(this));
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, this.onGoalResult.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_APPROVED, this.onProposalApproved.bind(this));
    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_REJECTED, this.onProposalRejected.bind(this));

    console.log('[DialogueEngine] Initialized and listening for dialogue events.');
  }

  // ── Proposal Listeners ────────────────────────────────────────────────────

  private async onProposalApproved(event: StandardEvent): Promise<void> {
    const proposalId = event.payload.proposalId;
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) return;

    this.pendingProposals.delete(proposalId);

    this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
      content: `${proposal.intent.split('_').join(' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}...`,
    });

    // Execute after approval
    const result = await this.spawnGoalAndAwaitResult(proposal.intent, proposal.parameters);
    this.narrateResult(proposal.userMessage, result);
  }

  private onProposalRejected(event: StandardEvent): Promise<void> {
    const proposalId = event.payload.proposalId;
    if (this.pendingProposals.has(proposalId)) {
      this.pendingProposals.delete(proposalId);

      this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
        text: "Proposal has been cancelled. Let me know if you'd like to do something else."
      });
    }
    return Promise.resolve();
  }

  public clearHistory(): void {
    this.conversationHistory = [];
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private emitEvent(type: string, payload: Record<string, any>): void {
    const event: StandardEvent<any> = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      payload,
      timestamp: Date.now(),
      source: 'DialogueEngine'
    };
    this.eventBus.emit(type, event);
  }

  private async classifyIntent(userMessage: string): Promise<{ intent: string; parameters: Record<string, any> }> {
    try {
      const prompt = INTENT_EXTRACTION_PROMPT.replace('${new Date().toISOString()}', new Date().toISOString()) + userMessage;
      const response = await this.llm.generate([
        { role: 'user', content: prompt },
      ]);
      const parsed = JSON.parse(response.text.trim());
      return parsed;
    } catch {
      return { intent: 'NONE', parameters: {} };
    }
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
    if (intent === 'TRANSFER_FUNDS') {
      const walletState = this.worldStateService.getWalletState();
      if (!walletState) return { feasible: false, reason: "Wallet state is completely unknown or disconnected." };

      const requestedAmount = parameters.amount;
      const currentBalance = walletState.balance; // Using Main Wallet (or Vault depending on logic. Wait, SERA vault balance?)

      // Based on rules, SERA writes to Sera Vault balance
      const vaultBalance = walletState.vaultBalance;
      const effectiveBalance = parameters.fromWallet === 'sera_vault' ? vaultBalance : currentBalance;

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

  private onGoalResult(event: StandardEvent<GoalResultPayload>): void {
    const result = event.payload;
    const resolver = this.pendingGoals.get(result.requestId);
    if (resolver) {
      this.pendingGoals.delete(result.requestId);
      resolver(result);
    }
  }

  private async onUserObservation(event: StandardEvent<DialogueUserObservedPayload>): Promise<void> {
    const userMessage: string = event.payload.message;
    console.log(`[DialogueEngine] Processing DIALOGUE_USER_OBSERVED: "${userMessage}"`);

    this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Preparing your request...' });

    try {
      // ── Step 1: Classify intent ──────────────────────────────────────────
      const { intent, parameters } = await this.classifyIntent(userMessage);
      console.log(`[DialogueEngine] Classified intent: ${intent}`);

      // ── Step 1.5: Pre-Clarification Fast Fail ──────────────────────────────
      if (intent === 'TRANSFER_FUNDS' || (intent === 'SCHEDULE_GOAL' && parameters.actionIntent === 'TRANSFER_FUNDS')) {
        const walletState = this.worldStateService.getWalletState();
        if (!walletState || walletState.vaultBalance <= 0) {
          const userMsg: QwenMessage = { role: 'user', content: userMessage };
          this.conversationHistory.push(userMsg);
          chatHistoryStore.appendLlmMessage(userMsg);

          const systemRejectionMsg = `The user wants to transfer funds, but you currently hold 0 USDC in your balance. Respond naturally and concisely that the transfer cannot be performed because you don't have any funds. Do not use the term "Sera Vault". Do not ask for missing parameters.`;
          const response = await this.llm.generate([
            { role: 'system', content: SYSTEM_PROMPT },
            ...this.conversationHistory,
            { role: 'system', content: systemRejectionMsg }
          ]);

          const rawText = response.text.trim();
          const asstMsg: QwenMessage = { role: 'assistant', content: rawText };
          this.conversationHistory.push(asstMsg);
          chatHistoryStore.appendLlmMessage(asstMsg);

          this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: rawText });
          return;
        }
      }

      // ── Step 2: Clarification Validation ───────────────────────────────────────
      let missingParams: string[] = [];
      if (intent === 'TRANSFER_FUNDS') {
        if (!parameters.recipient || !parameters.recipient.type) missingParams.push('recipient address');
        if (parameters.recipient?.type === 'EXTERNAL_ADDRESS' && !parameters.recipient.address) missingParams.push('recipient address');
        if (!parameters.amount && parameters.amount !== 0) missingParams.push('amount to send');
        if (!parameters.asset) parameters.asset = 'usdc';
      } else if (intent === 'SCHEDULE_GOAL' && parameters.actionIntent === 'TRANSFER_FUNDS') {
        if (!parameters.actionParameters) parameters.actionParameters = {};
        if (!parameters.actionParameters.recipient || !parameters.actionParameters.recipient.type) missingParams.push('recipient address');
        if (parameters.actionParameters.recipient?.type === 'EXTERNAL_ADDRESS' && !parameters.actionParameters.recipient.address) missingParams.push('recipient address');
        if (!parameters.actionParameters.amount && parameters.actionParameters.amount !== 0) missingParams.push('amount to send');
        if (!parameters.actionParameters.asset) parameters.actionParameters.asset = 'usdc';
      }

      if (missingParams.length > 0) {
        console.log(`[DialogueEngine] Missing parameters for ${intent}: ${missingParams.join(', ')}. Triggering Clarification Mode.`);

        // Push user message to history so LLM has context
        const userMsg: QwenMessage = { role: 'user', content: userMessage };
        this.conversationHistory.push(userMsg);
        chatHistoryStore.appendLlmMessage(userMsg);

        const clarificationPrompt = `The user wants to transfer funds, but their request is missing the following required information: ${missingParams.join(', ')}. 
Please ask the user naturally (in the same language they used) to provide this missing information. Keep it brief. Do not mention JSON or parameters.`;

        const response = await this.llm.generate([
          { role: 'system', content: SYSTEM_PROMPT },
          ...this.conversationHistory,
          { role: 'system', content: clarificationPrompt }
        ]);

        const responseText = response.text.trim();
        const asstMsg: QwenMessage = { role: 'assistant', content: responseText };
        this.conversationHistory.push(asstMsg);
        chatHistoryStore.appendLlmMessage(asstMsg);

        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: responseText });
        return; // Abort execution/proposal and wait for user's next message
      }

      // ── Step 3: Route actionable intents via Risk Policy ───────────────────
      if (intent !== 'NONE') {
        // AUTO-EXECUTE path: Read-only operations and authorized vault operations (e.g. transfers)
        const AUTO_EXECUTE_INTENTS = ['CHECK_WALLET_BALANCE', 'CHECK_NETWORK'];
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
            const userMsg3: QwenMessage = { role: 'user', content: userMessage };
            this.conversationHistory.push(userMsg3);
            chatHistoryStore.appendLlmMessage(userMsg3);

            const systemRejectionMsg = `The user's requested operation failed the pre-flight feasibility check. Reason: ${feasibility.reason}. Respond strictly as an objective operational system agent. Explain that the request was evaluated against current world state and cannot be prepared. Do NOT apologize. Maintain an operational, matter-of-fact tone.`;
            const response = await this.llm.generate([
              { role: 'system', content: SYSTEM_PROMPT },
              ...this.conversationHistory,
              { role: 'system', content: systemRejectionMsg }
            ]);

            const rawText = response.text.trim();
            const asstMsg3: QwenMessage = { role: 'assistant', content: rawText };
            this.conversationHistory.push(asstMsg3);
            chatHistoryStore.appendLlmMessage(asstMsg3);

            this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: rawText });
            return;
          }

          // PROPOSAL path (Risk-Tiered: WRITE/FINANCE/SCHEDULE)
          const proposalId = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          this.pendingProposals.set(proposalId, { intent, parameters, userMessage });

          this.emitEvent(EventTypes.DIALOGUE_PROPOSAL_GENERATED, {
            proposalId,
            intent,
            parameters
          });

          // Reply conversationally that we are proposing it
          const summaryText = intent === 'SCHEDULE_GOAL'
            ? `I can set up that schedule for you. Please review the proposal.`
            : `I have prepared the transaction. Please review the details before I proceed.`;

          this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: summaryText });
        }
      } else {
        // ── Step 4: Pure conversational response ─────────────────────────────
        const userMsg2: QwenMessage = { role: 'user', content: userMessage };
        this.conversationHistory.push(userMsg2);
        chatHistoryStore.appendLlmMessage(userMsg2);

        const response = await this.llm.generate([
          { role: 'system', content: SYSTEM_PROMPT },
          ...this.conversationHistory,
        ]);

        let rawText = response.text.trim();
        console.log(`[DialogueEngine] Qwen responded (${response.usage?.total_tokens || 0} tokens).`);

        // Parse and strip embedded UI commands before sending text to UI
        if (rawText.includes('<UI_COMMAND:SET_THEME_DARK>')) {
          this.emitEvent(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: 'dark' });
          rawText = rawText.replace('<UI_COMMAND:SET_THEME_DARK>', '').trim();
        }
        if (rawText.includes('<UI_COMMAND:SET_THEME_LIGHT>')) {
          this.emitEvent(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: 'light' });
          rawText = rawText.replace('<UI_COMMAND:SET_THEME_LIGHT>', '').trim();
        }

        const asstMsg2: QwenMessage = { role: 'assistant', content: rawText };
        this.conversationHistory.push(asstMsg2);
        chatHistoryStore.appendLlmMessage(asstMsg2);

        // Keep history bounded to last 20 turns
        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }

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
      console.error('[DialogueEngine] Error:', error.message);
      this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
        text: 'I apologize, but I encountered an error while communicating with the cognitive system. Please try again.',
      });
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
      ? `The user asked: "${userMessage}". The SERA system retrieved this data: ${sanitizedDataStr}. Narrate this result naturally and concisely in the same language the user used. IMPORTANT: Do NOT mention the transaction hash or provide any links in your response.`
      : `The user asked: "${userMessage}". The SERA system failed to complete the action. Error: ${result.errorMessage}. Inform the user naturally and concisely.`;

    const narrateResponse = await this.llm.generate([
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.conversationHistory,
      { role: 'user', content: narratePrompt },
    ]);

    const generatedText = narrateResponse.text.trim();

    this.conversationHistory.push({ role: 'assistant', content: generatedText });
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    const actionLinks = [];
    if (result.success && result.data?.executionId && typeof result.data.executionId === 'string' && result.data.executionId.startsWith('0x')) {
      const txHash = result.data.executionId;
      actionLinks.push({ label: 'View on Basescan', url: `https://basescan.org/tx/${txHash}` });
    }

    this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: generatedText, actionLinks });
  }
}
