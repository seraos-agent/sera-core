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
    private readonly chatHistoryStore: ChatHistoryStore
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
        !/\b(buy|sell|swap|transfer|balance|network|schedule|trade|token)\b/i.test(userMessage)
    );

    const memoryAttention = isShortGreeting
      ? { items: [], estimatedTokens: 0, tokenBudget: 700, truncated: false }
      : await this.memoryQueryService.query(userMessage, { tokenBudget: 700 });

    const cognitiveState = {
      relevant_facts: {
        currentTime: new Date().toUTCString(),
        userMainWalletAddress: walletState?.address || 'Unknown'
      },
      memory_attention: this.memoryQueryService.toPromptContext(memoryAttention),
      constraints: [
        'User attention is limited. Keep answers concise.',
        'Never hallucinate unverified state.',
        'CRITICAL — NO PRICE HALLUCINATION: You MUST NOT invent, guess, or hallucinate the price, volume, or market data of ANY crypto token (e.g. BTC, ETH, SOL, TOSHI). If the user asks for a price, you MUST use the HYPERLIQUID_MARKET_SUMMARY tool (for major perpetuals like BTC, ETH, SOL) or the RESOLVE_TOKEN tool (for Base DEX spot tokens) to fetch the real data first.',
        'If the user asks for their balance, you MUST use the CHECK_WALLET_BALANCE tool to fetch it freshly.',
        'If the user asks to transfer or send funds (including "all" funds), you MUST immediately use the TRANSFER_FUNDS tool. DO NOT use CHECK_WALLET_BALANCE before transferring.',
        'CRITICAL — SERA IDENTITY & SPOT TRADING: You are SERA Agent, a sovereign Web3 AI operational agent. You HAVE your own operational wallet (agent_vault) and active DEX Spot Market execution capabilities on Base Network (Uniswap V3 / Aerodrome). You CAN buy, sell, and swap ERC-20 crypto tokens. NEVER say you lack access to exchanges or wallets. When asked if you can buy or swap a token, explain confidently that you CAN execute spot DEX swaps via your operational wallet, and generate a SPOT_SWAP tool call or proposal for the user to approve.',
        'CRITICAL — SCHEDULING & AUTOMATIONS: Whenever the user requests to execute ANY action, monitor an asset, or fetch data periodically/recurringly (e.g., "every 30 seconds", "every 5 minutes", "every Monday at 9am", "daily at 8pm") OR after a time delay (e.g., "in 20 seconds", "in 1 hour"), you MUST IMMEDIATELY invoke the SCHEDULE_GOAL tool to generate a Schedule Proposal Card. DO NOT refuse recurring schedules by claiming the system requires an end time or duration limit! SERA natively supports indefinite recurring schedules via cron. Put the target tool (e.g. HYPERLIQUID_CANDLES, HYPERLIQUID_MARKET_SUMMARY, TRANSFER_FUNDS, CHECK_WALLET_BALANCE) inside actionIntent, with its parameters inside actionParameters. Specify scheduleType: "cron" with a valid cronExpression (in UTC) for recurring tasks, or scheduleType: "exact" for single delays.'
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
      const legacyRefusalRegex = /(?:cannot\s+(?:buy|execute|access)|do\s+not\s+have\s+access|only\s+provide\s+market\s+data|read-only|paper\s+trading|unable\s+to\s+perform)/i;
      const recentUi = this.chatHistoryStore.getUiMessages()
        .filter(m => m.type !== 'activity' && m.content && !legacyRefusalRegex.test(m.content))
        .map(m => ({ role: m.role === 'agent' ? ('assistant' as const) : ('user' as const), content: m.content! }));

      const context = this.conversationContextCompressor.compress(recentUi, {
        tokenBudget: 700,
        maxRecentTurns: 5
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
          tokenBudget: 700,
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
