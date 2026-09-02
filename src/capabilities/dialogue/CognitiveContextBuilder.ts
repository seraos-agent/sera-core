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
      ? { items: [], estimatedTokens: 0, tokenBudget: 500, truncated: false }
      : await this.memoryQueryService.query(userMessage, { tokenBudget: 500 });

    const activeCaps = this.capabilityCatalog
      ? this.capabilityCatalog.allConnectorSummaries().filter((c: any) => c.isActive).map((c: any) => c.name).join(', ')
      : 'None';

    const memoryContext = this.memoryQueryService.toPromptContext(memoryAttention);

    // High-Efficiency Streamlined Cognitive Working Memory (Markdown format)
    let cognitiveStateMarkdown = `[COGNITIVE STATE (WORKING MEMORY)]\n- User Wallet: ${walletState?.address || 'Not connected'}\n- Active Connectors: ${activeCaps}`;
    if (memoryContext?.items && memoryContext.items.length > 0) {
      cognitiveStateMarkdown += `\n\n[RELEVANT MEMORY ATTENTION]\n${memoryContext.items.map(it => `- ${it.content}`).join('\n')}`;
    }

    messages.push({
      role: 'system',
      content: cognitiveStateMarkdown
    });

    if (uiCommandExecuted) {
      messages.push({
        role: 'system',
        content: `The system has just executed the user's requested UI action in the background automatically. Acknowledge this naturally and concisely without explaining how it works. Do not claim you lack access to settings.`
      });
    }

    if (!activeResponseContext) {
      const recentUi = this.chatHistoryStore.getUiMessages()
        .filter(m => m.type !== 'activity' && (m.content || (m.images && m.images.length > 0)))
        .map(m => ({ 
          role: m.role === 'agent' ? ('assistant' as const) : ('user' as const), 
          content: m.content || (m.images && m.images.length > 0 ? '[User attached image(s)]' : '') 
        }));

      const context = this.conversationContextCompressor.compress(recentUi, {
        tokenBudget: 1500,
        maxRecentTurns: 6
      });

      messages.push(...context.messages);
    } else {
      const ctxKey = `${activeResponseContext.platform}:${activeResponseContext.channelId}`;
      const history = platformConversationHistory?.get(ctxKey) ?? [];

      // Unified Omnichannel Persona: warm, intelligent, and proactive across all channels
      const platformName = activeResponseContext.platform || 'external';
      const channelGuidance = platformName === 'telegram'
        ? `[PLATFORM: TELEGRAM] You are conversing directly with the user via Telegram. Maintain your warm, intelligent, and proactive SERA personality. Use clear Telegram-friendly Markdown formatting.`
        : `[PLATFORM: ${platformName.toUpperCase()}] You are conversing via ${platformName}. Maintain your warm, intelligent, and proactive SERA personality.`;

      messages.push({
        role: 'system',
        content: channelGuidance
      });

      if (history.length > 0) {
        const context = this.conversationContextCompressor.compress(history, {
          tokenBudget: 3000,
          maxRecentTurns: maxPlatformHistoryTurns
        });
        messages.push({
          role: 'system',
          content: `[CONVERSATION HISTORY - ${platformName} channel]`
        });
        messages.push(...context.messages);
      }
    }

    return messages;
  }
}
