import { ThreadsPostHistoryStore } from './ThreadsPostHistoryStore';
import { HyperliquidClient } from '../hyperliquid/HyperliquidClient';
import { QwenAdapter, QwenMessage } from '../llm/QwenAdapter';

export interface DynamicSocialSynthesizerOptions {
  historyStore?: ThreadsPostHistoryStore;
  hyperliquidClient?: HyperliquidClient;
  llmAdapter?: QwenAdapter;
}

export type HumanSocialArchetype =
  | 'CASUAL_CONVERSATIONAL'
  | 'ALL_LOWERCASE_CHILL'
  | 'EMOTIVE_ALL_CAPS_HYPE'
  | 'DISCUSSION_BAIT_QUESTION'
  | 'PUNCHY_ONE_LINER';

/**
 * DynamicSocialSynthesizer — Synthesizes rich, varied, and non-repetitive social content
 * powered by multi-source sensory data (Hyperliquid L1 DEX, Web Search Trends, and Memory).
 * 
 * Architecture Role: Capability Sub-Component (src/capabilities/threads/)
 * - Respects the user's specific brief (North Star).
 * - Gathers live market prices from Hyperliquid L1 orderbook (BTC, ETH, SOL, HYPE).
 * - Performs targeted trend/news sensory scans.
 * - Injects recent post history as a strict anti-repetition negative constraint.
 * - Rotates through 5 distinct human social writing archetypes.
 * - Enforces Rule 7 (Universal Codebase Language: English Standard).
 */
export class DynamicSocialSynthesizer {
  private readonly historyStore: ThreadsPostHistoryStore;
  private readonly hyperliquidClient: HyperliquidClient;
  private llmAdapter?: QwenAdapter;

  private static readonly HUMAN_ARCHETYPES: Array<{
    id: HumanSocialArchetype;
    name: string;
    styleInstruction: string;
  }> = [
    {
      id: 'CASUAL_CONVERSATIONAL',
      name: 'Casual / Coffee Shop Vibe',
      styleInstruction: 'Write naturally like a real human hanging out with peers. Use expressive, imperfect, and conversational flow. In Indonesian, naturally use slang, elongated words (e.g. "gasss", "mlekkk", "wkwk"), and friendly openers (e.g. "oyyy", "jujur ya"). In English, use casual modern phrasing (e.g. "yo", "frfr", "honestly"). Avoid stiff formal grammar.'
    },
    {
      id: 'ALL_LOWERCASE_CHILL',
      name: 'All-Lowercase Aesthetic',
      styleInstruction: 'Write in an all-lowercase stream-of-consciousness style without capitalization or trailing period. Feels genuine, chill, observant, and relatable.'
    },
    {
      id: 'EMOTIVE_ALL_CAPS_HYPE',
      name: 'Emotive / High-Energy Hype',
      styleInstruction: 'High energy and enthusiastic. Use selective ALL-CAPS words for dramatic emphasis and genuine excitement. Hook the reader immediately and make it buzz-worthy.'
    },
    {
      id: 'DISCUSSION_BAIT_QUESTION',
      name: 'Interactive Discussion Bait',
      styleInstruction: 'Frame the post around an intriguing, open, or slightly polarizing question that triggers people to jump into the comments (e.g. "serius nanya...", "spill dong...", "drop your thoughts on...").'
    },
    {
      id: 'PUNCHY_ONE_LINER',
      name: 'Punchy One-Liner',
      styleInstruction: 'Extremely concise, witty, or sarcastic 1-sentence observation. Short, memorable, and highly repostable.'
    }
  ];

  constructor(options: DynamicSocialSynthesizerOptions = {}) {
    this.historyStore = options.historyStore || new ThreadsPostHistoryStore();
    this.hyperliquidClient = options.hyperliquidClient || new HyperliquidClient();
    this.llmAdapter = options.llmAdapter;
  }

  private getLLM(): QwenAdapter {
    if (!this.llmAdapter) {
      this.llmAdapter = new QwenAdapter(process.env.QWEN_LIGHT_MODEL || 'qwen3.8-flash');
    }
    return this.llmAdapter;
  }

  /**
   * Fetches real-time market data across Hyperliquid spot markets.
   */
  public async getHyperliquidSensoryData(): Promise<string> {
    try {
      const topCoins = ['BTC', 'ETH', 'SOL', 'HYPE'];
      const results: string[] = [];

      for (const coin of topCoins) {
        try {
          const data = await this.hyperliquidClient.getSpotMarketData(coin);
          if (data && data.midPrice > 0) {
            const sign = data.priceChange24hPercent >= 0 ? '+' : '';
            results.push(`• ${coin}: $${data.midPrice.toLocaleString()} (${sign}${data.priceChange24hPercent}% 24h)`);
          }
        } catch {}
      }

      if (results.length > 0) {
        return `[REAL-TIME HYPERLIQUID L1 DEX DATA]\n${results.join('\n')}\n`;
      }
    } catch (e: any) {
      console.warn(`[DynamicSocialSynthesizer] Hyperliquid sensory fetch skipped:`, e.message);
    }
    return '';
  }

  /**
   * Directly synthesizes and returns the final social post string ready for immediate publishing.
   */
  public async generateSocialPost(
    sessionId: string,
    userTaskPrompt: string
  ): Promise<string> {
    // 1. Fetch recent post history for anti-repetition blacklist
    const recentPosts = this.historyStore.getRecentPosts(sessionId, 6);

    // 2. Select a random human writing archetype for stylistic diversity
    const chosenArchetype =
      DynamicSocialSynthesizer.HUMAN_ARCHETYPES[
        Math.floor(Math.random() * DynamicSocialSynthesizer.HUMAN_ARCHETYPES.length)
      ];

    // 3. Gather multi-source sensory context (Hyperliquid DEX data)
    let sensoryContext = '';
    const isCryptoRelated = /crypto|btc|eth|sol|hype|price|market|kripto|harga|trading/i.test(userTaskPrompt);
    if (isCryptoRelated) {
      sensoryContext = await this.getHyperliquidSensoryData();
    }

    // 4. Construct Anti-Repetition Blacklist Section
    let antiRepetitionSection = '';
    if (recentPosts.length > 0) {
      antiRepetitionSection = `
[RECENT POSTS ALREADY PUBLISHED BY THIS ACCOUNT - STRICT BLACKLIST]
${recentPosts.map((p, i) => `${i + 1}. "${p.text}"`).join('\n')}

CRITICAL ANTI-REPETITION RULES:
- YOU MUST NOT repeat, rephrase, or reuse the themes, jokes, analogies, punchlines, or opening hooks from the recent posts above.
- Pick a completely different angle, topic, or observation within the user's requested domain.
- Do NOT use repetitive cliché phrases (e.g. avoid "screen time", "at 2am", "doomscrolling", "nobody talks about").
`;
    }

    // 5. Assemble the LLM Generation Prompt
    const messages: QwenMessage[] = [
      {
        role: 'system',
        content: `You are an elite, highly authentic social media creator on Meta Threads. 
Your goal is to write a single, punchy, real-human social media post.

CRITICAL FORMATTING RULES:
1. CONCISE & PUNCHY: Keep the post strictly to 1-3 short lines max. Never write lengthy essays, formal articles, or newspaper-style blocks of text.
2. NO HASHTAGS: NEVER use hashtags or the "#" symbol. Threads users despise hashtag spam.
3. NO QUOTES OR PREAMBLE: Return ONLY the raw post text. Do not wrap in quotes or add preamble like "Here is your post:".
4. AUTHENTIC & ORGANIC: Write like a real person sharing a quick thought, witty observation, or intriguing question.`
      },
      {
        role: 'user',
        content: `[TASK]: Write an engaging Threads post based on the following instructions and context.

[USER GUIDELINES / NORTH STAR]
"${userTaskPrompt}"

${sensoryContext}
${antiRepetitionSection}
[SELECTED WRITING STYLE ARCHETYPE: ${chosenArchetype.name.toUpperCase()}]
${chosenArchetype.styleInstruction}

[STRICT OUTPUT INSTRUCTION]
Output ONLY the raw post content. Strict max 1-3 lines. Zero hashtags (#).`
      }
    ];

    const llm = this.getLLM();
    const response = await llm.generate(messages);
    let postText = response.text.trim();

    // Clean up any extraneous quotes, code blocks, or rogue hashtags
    postText = postText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    if (postText.startsWith('"') && postText.endsWith('"') && postText.length > 2) {
      postText = postText.slice(1, -1).trim();
    }
    // Strip hashtags if any were produced
    postText = postText.replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s{2,}/g, ' ').trim();

    return postText;
  }
}

