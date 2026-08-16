import { QwenMessage } from '../llm/QwenAdapter';
import { WorldStateService } from '../../core/world-state/WorldStateService';
import { MemoryQueryService } from '../../core/memory/MemoryQueryService';
import { ChatHistoryStore } from './ChatHistoryStore';
import { ConversationContextCompressor } from './ConversationContextCompressor';
import { SYSTEM_PROMPT } from './SystemPrompts';

/**
 * CognitiveContextBuilder — Assembles working memory, cognitive state, and platform history for LLM generation.
 *
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 */
export class CognitiveContextBuilder {
  private readonly conversationContextCompressor = new ConversationContextCompressor();

  constructor(
    private readonly worldStateService: WorldStateService,
    private readonly memoryQueryService: MemoryQueryService,
    private readonly chatHistoryStore: ChatHistoryStore,
    private readonly capabilityCatalog: any
  ) {}

  public async build(
    uiCommandExecuted?: boolean,
    userMessage?: string,
    activeResponseContext?: Record<string, any>,
    platformConversationHistory?: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>,
    maxPlatformHistoryTurns: number = 8
  ): Promise<QwenMessage[]> {
    const messages: QwenMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    const walletState = this.worldStateService.getWalletState();

    const isShortGreeting = Boolean(
      userMessage &&
        userMessage.trim().split(/\s+/).length <= 3 &&
        !/\b(transfer|balance|network|schedule|send|post|search|image|draw)\b/i.test(userMessage)
    );

    const memoryAttention = isShortGreeting
      ? { items: [], estimatedTokens: 0, tokenBudget: 700, truncated: false }
      : await this.memoryQueryService.query(userMessage, { tokenBudget: 700 });

    const cognitiveState = {
      relevant_facts: {
        currentTime: new Date().toUTCString(),
        userMainWalletAddress: walletState?.address || 'Unknown',
        activeCapabilities: this.capabilityCatalog ? this.capabilityCatalog.allConnectorSummaries().filter((c: any) => c.isActive).map((c: any) => c.name) : []
      },
      memory_attention: this.memoryQueryService.toPromptContext(memoryAttention),
      constraints: [
        'User attention is limited. Keep answers concise but genuinely helpful.',
        'Never hallucinate unverified state.',
        'CRITICAL - NO DATA HALLUCINATION: You MUST NOT invent, guess, or hallucinate prices, balances, statistics, or any factual data. If the user asks for real-time information, use your web search tool to find accurate data first.',
        'If the user asks for their balance, you MUST use the CHECK_WALLET_BALANCE tool to fetch it freshly.',
        'If the user asks to transfer or send funds (including "all" funds), you MUST immediately use the TRANSFER_FUNDS tool. DO NOT use CHECK_WALLET_BALANCE before transferring.',
        'CRITICAL - SERA IDENTITY: You are SERA Agent, a friendly and proactive AI operational partner. You have your own operational wallet with USDC on Base Network for P2P transfers. You can search the web, generate images, publish to social media, schedule automated tasks, and assist with a wide range of information needs. You do NOT have trading or token swap capabilities.',
        'CRITICAL - SCHEDULING & AUTOMATIONS: Whenever the user requests to execute ANY action periodically/recurringly (e.g., "every 5 minutes", "every Monday at 9am", "daily at 8pm") OR after a time delay (e.g., "in 20 seconds", "in 1 hour"), you MUST IMMEDIATELY invoke the SCHEDULE_GOAL tool to generate a Schedule Proposal Card. DO NOT refuse recurring schedules by claiming the system requires an end time or duration limit! SERA natively supports indefinite recurring schedules via cron. Put the target tool (e.g. TRANSFER_FUNDS, CHECK_WALLET_BALANCE) inside actionIntent, with its parameters inside actionParameters. Specify scheduleType: "cron" with a valid cronExpression (in UTC) for recurring tasks, or scheduleType: "exact" for single delays.',
        'CRITICAL - PROACTIVE BEHAVIOR: After completing any task, suggest one relevant follow-up action. If the user seems uncertain, offer a concrete suggestion rather than a generic "how can I help". Be the colleague who anticipates needs.',
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

    if (!activeResponseContext) {
      const legacyRefusalRegex = /(?:cannot\s+(?:buy|execute|access|trade)|do\s+not\s+have\s+access|only\s+provide\s+market\s+data|read-only|paper\s+trading|unable\s+to\s+perform|spot\s+(?:swap|dex|trading)|hyperliquid|perpetual\s+futures|uniswap|aerodrome)/i;
      const recentUi = this.chatHistoryStore.getUiMessages()
        .filter(m => m.type !== 'activity' && m.content && !legacyRefusalRegex.test(m.content))
        .map(m => ({ role: m.role === 'agent' ? ('assistant' as const) : ('user' as const), content: m.content! }));

      const context = this.conversationContextCompressor.compress(recentUi, {
        tokenBudget: 3000,
        maxRecentTurns: 15
      });

      messages.push(...context.messages);
    } else {
      const ctxKey = `${activeResponseContext.platform}:${activeResponseContext.channelId}`;
      const history = platformConversationHistory?.get(ctxKey) ?? [];

      messages.push({
        role: 'system',
        content: `[PLATFORM CONTEXT] Message arrived via ${activeResponseContext.platform}. Rules for this context: (1) Plain prose only, no markdown bullet lists unless displaying structured data. (2) Clarification questions must be ONE short sentence. (3) Do NOT list your capabilities. (4) Do NOT end with open-ended offers to help. Write like a senior colleague, not a support bot.`
      });

      if (history.length > 0) {
        const context = this.conversationContextCompressor.compress(history, {
          tokenBudget: 3000,
          maxRecentTurns: maxPlatformHistoryTurns
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
}
