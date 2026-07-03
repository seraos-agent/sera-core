import { EventEmitter } from 'events';
import { QwenAdapter, QwenMessage } from '../llm/QwenAdapter';
import { StandardEvent, EventTypes, SpawnGoalPayload, GoalResultPayload, DialogueUserObservedPayload } from '../../core/events/types';

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

CRITICAL — SECURITY AND WALLET POLICY:
- You have READ access to: Personal Wallet and Sera Vault.
- You have WRITE access to: ONLY the Sera Vault.
- When told to "transfer" or "send", always use funds from the Sera Vault balance.

CRITICAL — TIMEZONE CONTEXT:
- The user's timezone is provided at the start of your message. Use it to understand relative times like "tomorrow 9am".
- You must always normalize time requests to a valid 'cronExpression' or Unix timestamp (UTC).`;

// ── Intent Extraction Prompt ───────────────────────────────────────────────
const INTENT_EXTRACTION_PROMPT = `You are SERA's intent classifier. Analyze the user's message and respond ONLY with a JSON object — no markdown, no explanation.

Supported intents:
- CHECK_WALLET_BALANCE: user asks about wallet balance, saldo, dompet, ETH, crypto balance
- CHECK_NETWORK: user asks about the current network, chain, blockchain SERA is connected to
- TRANSFER_FUNDS: user wants to send, transfer, or kirim crypto to an address. parameters must include "recipient" (string address), "amount" (number), "asset" (string, e.g. "eth" or "usdc"), and "fromWallet" (string, MUST ALWAYS BE "sera_vault").
- SCHEDULE_GOAL: user wants to do an action in the future or on a recurring basis. parameters must include "scheduleType" ("cron" or "exact"), "humanIntent", "cronExpression" (if recurring, in UTC), "executeAfterUtc" (if exact timestamp in UTC), "actionIntent" (e.g. "CHECK_WALLET_BALANCE" or "TRANSFER_FUNDS"), and "actionParameters".
- NONE: anything else (conversation, questions, commands, UI changes)

Response format:
{"intent": "CHECK_WALLET_BALANCE", "parameters": {"asset": "eth"}}
{"intent": "CHECK_NETWORK", "parameters": {}}
{"intent": "TRANSFER_FUNDS", "parameters": {"recipient": "0x...", "amount": 10, "asset": "usdc", "fromWallet": "sera_vault"}}
{"intent": "SCHEDULE_GOAL", "parameters": {"scheduleType": "cron", "humanIntent": "every monday 9 AM", "cronExpression": "0 2 * * 1", "actionIntent": "CHECK_WALLET_BALANCE", "actionParameters": {}}}
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
  private conversationHistory: QwenMessage[] = [];
  // Map from requestId → resolve function, for awaiting goal results
  private pendingGoals = new Map<string, (result: GoalResultPayload) => void>();

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.llm = new QwenAdapter();

    this.conversationHistory.push({ role: 'system', content: SYSTEM_PROMPT });

    this.eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, this.onUserObservation.bind(this));
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, this.onGoalResult.bind(this));
    
    console.log('[DialogueEngine] Initialized and listening for dialogue events.');
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

    this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, { content: 'Analyzing message intent...' });

    try {
      // ── Step 1: Classify intent ──────────────────────────────────────────
      const { intent, parameters } = await this.classifyIntent(userMessage);
      console.log(`[DialogueEngine] Classified intent: ${intent}`);

      // ── Step 2: Route actionable intents to GoalBridge ───────────────────
      if (intent !== 'NONE') {
        this.emitEvent(EventTypes.DIALOGUE_ACTIVITY, {
          content: `Executing goal: ${intent.replace(/_/g, ' ').toLowerCase()}...`,
        });

        const result = await this.spawnGoalAndAwaitResult(intent, parameters);

        // Ask LLM to narrate the result naturally in the user's language
        const narratePrompt = result.success
          ? `The user asked: "${userMessage}". The SERA system retrieved this data: ${JSON.stringify(result.data)}. Narrate this result naturally and concisely in the same language the user used.`
          : `The user asked: "${userMessage}". The SERA system failed to complete the action. Error: ${result.errorMessage}. Inform the user naturally and concisely.`;

        const narrateResponse = await this.llm.generate([
          { role: 'system', content: SYSTEM_PROMPT },
          ...this.conversationHistory,
          { role: 'user', content: narratePrompt },
        ]);

        const generatedText = narrateResponse.text.trim();
        this.conversationHistory.push({ role: 'user', content: userMessage });
        this.conversationHistory.push({ role: 'assistant', content: generatedText });

        this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: generatedText });
        return;
      }

      // ── Step 3: Regular conversation (no actionable intent) ───────────────
      this.conversationHistory.push({ role: 'user', content: userMessage });

      const messages: QwenMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...this.conversationHistory,
      ];

      const response = await this.llm.generate(messages);
      let rawText = response.text;

      console.log(`[DialogueEngine] Qwen responded (${response.usage.total_tokens} tokens).`);

      // Parse and strip embedded UI commands before sending text to UI
      if (rawText.includes('<UI_COMMAND:SET_THEME_DARK>')) {
        rawText = rawText.replace('<UI_COMMAND:SET_THEME_DARK>', '').trim();
        this.emitEvent(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: 'dark' });
      }
      if (rawText.includes('<UI_COMMAND:SET_THEME_LIGHT>')) {
        rawText = rawText.replace('<UI_COMMAND:SET_THEME_LIGHT>', '').trim();
        this.emitEvent(EventTypes.UI_COMMAND, { command: 'SET_THEME', value: 'light' });
      }

      this.conversationHistory.push({ role: 'assistant', content: rawText });

      // Keep history bounded to last 20 turns
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, { text: rawText });

    } catch (error: any) {
      console.error('[DialogueEngine] Error:', error.message);
      this.emitEvent(EventTypes.DIALOGUE_AGENT_SPEAK, {
        text: 'I apologize, but I encountered an error while communicating with the cognitive system. Please try again.',
      });
    }
  }
}
