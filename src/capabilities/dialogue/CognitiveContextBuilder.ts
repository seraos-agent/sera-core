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
    maxPlatformHistoryTurns: number = 8,
    overrideSystemPrompt?: string
  ): Promise<QwenMessage[]> {
    const messages: QwenMessage[] = [{ role: 'system', content: overrideSystemPrompt || SYSTEM_PROMPT }];
    const walletState = this.worldStateService.getWalletState();

    const memoryAttention = await this.memoryQueryService.query(userMessage, { tokenBudget: 2000 });

    const activeCaps = this.capabilityCatalog
      ? this.capabilityCatalog.allConnectorSummaries().filter((c: any) => c.isActive).map((c: any) => c.name).join(', ')
      : 'None';

    const memoryContext = this.memoryQueryService.toPromptContext(memoryAttention);

    const profile = (this.worldStateService as any).getUserProfile?.() || null;
    const preferredName = profile?.preferredName;

    const userNameInfo = preferredName
      ? `- User Name: ${preferredName}`
      : `- User Name: Not established yet. (If the user asks who they are or whether you remember them, warmly acknowledge them and ask how they prefer to be called. NEVER guess, assume, or invent a name from platform handles or phone numbers).`;

    // High-Efficiency Streamlined Cognitive Working Memory (Markdown format)
    let cognitiveStateMarkdown = `[COGNITIVE STATE (WORKING MEMORY)]
${userNameInfo}
- Active Workspace Integrations: ${activeCaps}`;

    if (walletState?.address) {
      cognitiveStateMarkdown += `\n- Agent Operational Wallet: ${walletState.address} (USDC on Base)`;
    }

    if (memoryContext?.items && memoryContext.items.length > 0) {
      cognitiveStateMarkdown += `\n\n[ARCHIVED HISTORICAL MEMORY (PREVIOUS SESSIONS - BACKGROUND ONLY)]\n(Notice: The following are past historical memories. Do NOT assert or hallucinate that past bugs, errors, or previous testing claims apply to the current test or active session unless explicitly requested by the user):\n${memoryContext.items.map(it => `- ${it.content}`).join('\n')}`;
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
        tokenBudget: 24000,
        maxRecentTurns: 8
      });

      messages.push(...context.messages);
    } else {
      const ctxKey = `${activeResponseContext.platform}:${activeResponseContext.channelId}`;
      const history = platformConversationHistory?.get(ctxKey) ?? [];

      // Unified Omnichannel Persona: warm, intelligent, and proactive across all channels
      const platformName = activeResponseContext.platform || 'external';
      let channelGuidance: string;

      if (platformName === 'whatsapp') {
        channelGuidance = `[PLATFORM: WHATSAPP - MOBILE CONVERSATION]
You are conversing directly with the user via personal WhatsApp chat.
- CONVERSATION REGISTRATION & TONE: Be warm, intelligent, agile, and natural—like a trusted, capable executive co-pilot chatting on mobile. Do NOT use stiff, robotic disclaimers or repetitive greetings like "Hello! I am SERA, an AI agent...".
- WHATSAPP NATIVE FORMATTING (CRITICAL):
  * Use *single asterisks* for bold text (e.g. *Order confirmed* or *Key summary*). NEVER use double asterisks (**bold**), as WhatsApp renders them literally.
  * Use _underscores_ for italics, ~tildes~ for strikethrough, and \`single backticks\` for inline codes/numbers.
  * Use > blockquotes for important highlights, executive summaries, or key quotes.
  * Use - dashes or bullet points for readable structured lists.
  * NEVER use Markdown headers (#, ##, ###) or wide markdown tables; use bold section titles (*SECTION NAME*) and bullet points instead for seamless mobile readability.
- CHAT CADENCE & NATURAL THOUGHT BLOCKS (HUMAN-LIKE PACING):
  * Structure your replies using 1 to 3 distinct thought blocks separated by double line breaks (\n\n).
  * For quick greetings, casual chat, or simple answers: keep it to 1 concise, direct bubble.
  * For completed tasks, deliverables, or recommendations: naturally separate into 2 blocks (Block 1: Core deliverable/action result/link; Block 2: Brief follow-up question or revision offer).
  * For complex tasks with a notable finding: use up to 3 blocks (Block 1: Deliverable/Action; Block 2: Key observation or analytical takeaway; Block 3: Next step / collaborative question).
  * Avoid walls of text. Keep each block punchy and natural like a fast-moving executive texting on WhatsApp.
- USER IDENTITY & MEMORY INQUIRIES:
  * If the user asks whether you remember them ("kamu ingat aku?", "siapa saya?", "apa yang kamu tahu tentang aku?"): answer warmly, honestly, and non-technically. Acknowledge that you recognize them in this workspace. Do NOT recite raw hashes, technical timezone strings, or connector lists.
  * If the user's name is not yet recorded, warmly say you'd love to know how they prefer to be called (e.g. "Enaknya aku panggil siapa ya?").
  * NEVER fabricate, guess, or invent a name (such as random strings) or fake past projects (such as nZEB or fake roadmaps).
  * NEVER make meta-commentary about your memory system or being tested (e.g. "wajar kalau kamu mau tes memori saya").`;
      } else if (platformName === 'telegram') {
        channelGuidance = `[PLATFORM: TELEGRAM] You are conversing directly with the user via Telegram. Maintain your warm, intelligent, and proactive SERA personality. Use clear Telegram-friendly Markdown formatting.`;
      } else {
        channelGuidance = `[PLATFORM: ${platformName.toUpperCase()}] You are conversing via ${platformName}. Maintain your warm, intelligent, and proactive SERA personality.`;
      }

      messages.push({
        role: 'system',
        content: channelGuidance
      });

      if (history.length > 0) {
        const context = this.conversationContextCompressor.compress(history, {
          tokenBudget: 24000,
          maxRecentTurns: maxPlatformHistoryTurns
        });
        messages.push({
          role: 'system',
          content: `[CONVERSATION HISTORY - ${platformName} channel]`
        });
        messages.push(...context.messages);
      }

      // Fix Context Lag: Ensure the active incoming message is appended as the latest user turn
      if (userMessage && userMessage.trim()) {
        messages.push({
          role: 'user',
          content: userMessage.trim()
        });
      }
    }

    return messages;
  }
}
