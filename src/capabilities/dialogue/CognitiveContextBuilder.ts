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
- DEFAULT 1-BUBBLE CADENCE (CRITICAL HUMAN FEEL FOR CASUAL CHAT):
  * For casual chat, greetings, banters, jokes, personal remarks, or casual check-ins ("aku ngantuk", "hayo lagi ngapain", "capek", "mantap", etc.): ALWAYS reply with exactly ONE single, warm, punchy message bubble.
  * ZERO UNSOLICITED OFFERS: NEVER tack on unsolicited capability offers (e.g. DO NOT offer to check crypto prices, portfolio, or schedules when the user is just casually chatting). Real human friends do not turn every casual remark into an assistant sales pitch.
- LONG CONTENT, SUMMARIES & EDUCATIONAL DIGESTS (OPTION 2 CADENCE):
  * Whenever delivering multi-point summaries, research breakdowns, or industry news, structure your response cleanly into 2 distinct sections separated by double newlines (\n\n) which will deliver as 2 balanced bubbles:
    - BUBBLE 1 (THE SUBSTANCE):
      ~ OPENING LEAD-IN: Write 1 to 2 smooth, natural, context-rich conversational sentences. It must feel conversational and engaging, not stiff or robotic. NEVER write an abrupt, lazy 5-word intro ending with a colon (e.g. NEVER write "sedang hangat-hangatnya nih, ini rangkumannya:" or "ini rangkumannya:"). Connect the lead-in directly into the body.
      ~ POINT FORMATTING: Format each point cleanly with bold titles: "*1. Title* – Core fact in 1 sentence. Impact or insight in 1 sentence.". Keep each point concise (max 2-3 sentences), punchy, and skimmable. Separate each numbered point with a double newline (\n\n) so text breathes and never forms an intimidating wall of text.
    - BUBBLE 2 (THE TAKEAWAY & COLLABORATIVE DIALOGUE):
      ~ Exactly 1 punchy conclusion sentence capturing the big-picture takeaway + 1 natural question inviting discussion or exploring next steps (e.g. "Intinya arahnya makin jelas ke produksi dan security. Dari poin-poin tadi, mana yang paling menarik buat kita gali duluan?").
      ~ Always separate this closing paragraph from the body points with a double newline (\n\n).
- DETAILED EXPLANATIONS & DEEP-DIVES (ANTI-NEWSPAPER / SUB-BULLET FORMULA):
  * When explaining complex technical topics or answering deep-dive follow-ups (e.g. "No 1", "jelaskan lebih detail", "bedah topik ini"):
    - MAJOR SECTIONS: Separate major numbered points (*1. Title*, *2. Title*) with an empty line (\n\n).
    - INSIDE EACH POINT (1 LINE PER SUB-BULLET):
      ~ Under the point title, write a 1-line overview if needed.
      ~ Break down the deep-dive into compact sub-bullets using "• " on adjacent lines (\n, without empty lines between sibling bullets).
      ~ Sub-bullet format: "• *Keyword/Aspect:* Core explanation in 1 concise sentence (1-2 lines on phone screen)."
      ~ STRICTLY FORBIDDEN: NEVER write a monolithic 8-12 line wall-of-text paragraph like a newspaper column. Use clean, skimmable sub-bullets so the screen breathes comfortably.
- WHATSAPP NATIVE FORMATTING (CLEAN & CASUAL):
  * NEVER use blockquotes (> text). Blockquote lines feel artificial and machine-generated on WhatsApp. Write clean, natural sentences without quote symbols.
  * NEVER use long em dashes (—). Em dashes feel artificial and machine-generated. Use a clean en dash (–) with spaces or a standard hyphen (-) instead.
  * Use *single asterisks* for bold text (e.g. *Order confirmed* or *Key summary*). NEVER use double asterisks (**bold**), as WhatsApp renders them literally.
  * Use _underscores_ for italics, ~tildes~ for strikethrough, and \`single backticks\` for inline codes/numbers.
  * NEVER use HTML tags (<br>, <p>, <b>, <span>, etc.). WhatsApp does NOT parse HTML and renders them as raw text. Use clean newlines (\n) for line breaks.
  * NEVER use Markdown headers (#, ##, ###) or wide markdown tables; use bold section titles (*SECTION NAME*) and bullet points instead for seamless mobile readability.
- WHATSAPP VOICE NOTES & NATURAL CONVERSATION:
  * You HAVE FULL real-time voice note perception and voice synthesis on WhatsApp!
  * You can listen to user voice notes and you CAN and WILL reply with natural, expressive voice notes using your signature voice (Ara).
  * NEVER say or pretend that you cannot send voice notes, that you have no voice apparatus ("alat suara belum dipasang"), that you only have a keyboard, or that you cannot speak.
  * When the user asks you to reply with voice notes ("balas pake vn", "voice note dong", "pake suara", "ngomong dong"), warmly agree and speak to them! The system automatically turns your spoken response into an authentic WhatsApp voice note.
- STRICT LANGUAGE PURITY (ZERO CHINESE / CJK LEAKAGE):
  * You are a universal global agent. Adapt fluidly to the user's native language (Indonesian, English, Swahili, French, Spanish, Arabic, etc.).
  * NEVER leak unintended Chinese characters or Hanzi tokens (such as 语音, 的, 了, 是) into non-Chinese sentences!
  * When referring to voice calls or voice notes, use natural language terms (e.g. in Indonesian use "voice note", "voice call", "teleponan", or "panggilan suara", NEVER "语音 call" or "语音").
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
