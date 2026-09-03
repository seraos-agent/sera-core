export interface WorkRoute {
  workClass: string;
  lane: string;
}

export interface DistilledIntent {
  primaryGoal: string;
  targetDomain: 'SPREADSHEET' | 'VISION' | 'FINANCE' | 'SOCIAL' | 'KNOWLEDGE' | 'CONVERSATION';
  executionStrategy: 'REQUIRE_TOOL_EXECUTION' | 'MULTI_STEP_ANALYSIS' | 'DIRECT_ANSWER';
  requiredTools?: string[];
  cognitiveAnchor: string;
}

export interface ClassificationResult {
  intent: string;
  distilledIntent: DistilledIntent;
  parameters: Record<string, any>;
  workRoute: WorkRoute;
}

/**
 * IntentClassifier — Cognitive Intent Distillation & Goal Extraction.
 * Formulates a clear, distilled user objective (North Star) before ReAct execution.
 */
export class IntentClassifier {
  constructor() { }

  /**
   * Cleans conversational wrapper phrases to isolate the core subject or entity.
   */
  private static extractCoreTopic(raw: string): string {
    let text = (raw || '').trim();
    // Strip surrounding quotes
    text = text.replace(/^["']+|["']+$/g, '').trim();

    // Strip common question and conditional prefixes
    const prefixRegex = /^(jika|kalau|bagaimana jika|bagaimana kalau|gimana kalau|gimana jika|menurutmu tentang|menurut kamu tentang|coba jelaskan|tolong jelaskan|coba cari|tolong cari|tolong buatkan|coba buatkan|buatkan|apakah|kenapa|mengapa|bagaimana|gimana|apa itu|apakah ada|ada info tentang|tell me about|explain|how about|what if|how to|what is)\s+/i;
    text = text.replace(prefixRegex, '').trim();

    // Strip trailing conversational markers
    text = text.replace(/\s+(bagaimana|gimana|ya|kah|dong|deh|sih)[\s\?\!\.]*$/i, '').trim();
    text = text.replace(/[\?\!\.]+$/, '').trim();

    if (text.length > 50) {
      return text.slice(0, 48).trim() + '...';
    }
    return text;
  }

  public static synthesizeCognitiveThought(
    userMessage: string,
    domain: string,
    hasDocs: boolean,
    hasImages: boolean
  ): string {
    const raw = (userMessage || '').trim();
    const lower = raw.toLowerCase();

    if (!raw) return 'Processing environmental context';

    // 1. Greetings & Salutations
    const greetingWords = [
      'halo', 'hai', 'hi', 'hey', 'hello', 'pagi', 'siang', 'sore', 'malam',
      'assalamualaikum', 'sampurasun', 'met pagi', 'good morning', 'good afternoon',
      'good evening', 'selamat pagi', 'selamat siang', 'selamat malam', 'selamat datang'
    ];
    const isPureGreeting = greetingWords.some(g => lower === g || lower === `${g}!` || (lower.startsWith(`${g} `) && lower.split(' ').length <= 4));
    if (isPureGreeting) {
      return "User greeting detected — acknowledging warmly and inviting user's core intent";
    }

    // 2. Appreciation, Gratitude & Feedback
    const feedbackMap: Record<string, string> = {
      keren: 'keren',
      mantap: 'mantap',
      bagus: 'bagus',
      hebat: 'hebat',
      sip: 'sip',
      makasih: 'makasih',
      'terima kasih': 'terima kasih',
      thanks: 'thanks',
      'thank you': 'thank you',
      great: 'great',
      awesome: 'awesome',
      cool: 'cool',
      nice: 'nice',
      'luar biasa': 'luar biasa'
    };
    for (const [key, word] of Object.entries(feedbackMap)) {
      if (lower === key || (lower.startsWith(`${key} `) && lower.split(' ').length <= 4) || lower.endsWith(` ${key}`)) {
        return `User acknowledged with positive feedback ('${word}') — maintaining conversational momentum and suggesting next steps`;
      }
    }

    // 3. Affirmation & Continuation
    const affirmationWords = [
      'oke', 'ok', 'lanjut', 'lanjutkan', 'siap', 'gas', 'gass', 'gaskan',
      'boleh', 'deal', 'sure', 'yes', 'yep', 'continue', 'proceed', 'go ahead', "let's go"
    ];
    const isAffirmation = affirmationWords.some(a => lower === a || lower === `${a}!` || (lower.startsWith(`${a} `) && lower.split(' ').length <= 4));
    if (isAffirmation) {
      return 'Affirmative continuation received — resuming context from previous execution';
    }

    // 4. System / Identity
    if (lower.includes('siapa kamu') || lower.includes('who are you') || lower === 'sera' || lower.includes('arsitektur') || lower.includes('kemampuan')) {
      return 'Explaining SERA cognitive operating system architecture and autonomy models';
    }

    // 5. Vision & Multimodal Domain
    if (hasImages || domain === 'VISION') {
      return 'Inspecting visual multimodal elements, text, and data structures in image attachment';
    }

    // 6. Spreadsheet & Tabular Data Operations
    if (domain === 'SPREADSHEET' || lower.includes('sheet') || lower.includes('excel') || lower.includes('spreadsheet')) {
      const topic = this.extractCoreTopic(raw);
      if (lower.includes('omset') || lower.includes('penjualan') || lower.includes('revenue') || lower.includes('keuangan')) {
        return 'Analyzing financial metrics and preparing structured ledger spreadsheet';
      }
      if (lower.includes('chart') || lower.includes('grafik')) {
        return 'Configuring dynamic spreadsheet model with interactive charts';
      }
      if (topic && topic.toLowerCase() !== 'spreadsheet' && topic.toLowerCase() !== 'excel') {
        return `Structuring tabular ledger model for '${topic}' in Google Drive`;
      }
      return hasDocs
        ? 'Processing ingested tabular document and generating spreadsheet in Google Drive'
        : 'Generating structured spreadsheet ledger in Google Drive vault';
    }

    // 7. Finance / Web3 / Crypto Domain
    if (domain === 'FINANCE' || lower.includes('transfer') || lower.includes('saldo') || lower.includes('wallet') || lower.includes('swap')) {
      if (lower.includes('saldo') || lower.includes('balance')) {
        return 'Auditing multi-chain agentic wallet balance and asset custody';
      }
      if (lower.includes('swap') || lower.includes('trade') || lower.includes('beli') || lower.includes('jual')) {
        const topic = this.extractCoreTopic(raw);
        return topic ? `Evaluating liquidity depth and preparing token swap for '${topic}'` : 'Evaluating liquidity depth and executing algorithmic token swap';
      }
      if (lower.includes('transfer') || lower.includes('kirim')) {
        return 'Validating recipient address and preparing secure transfer parameters';
      }
      return 'Evaluating decentralized finance protocols and wallet execution state';
    }

    // 8. Social / Threads Domain
    if (domain === 'SOCIAL' || lower.includes('threads') || lower.includes('post') || lower.includes('publish') || lower.includes('tweet') || lower.includes('caption')) {
      const topic = this.extractCoreTopic(raw);
      if (topic && !topic.toLowerCase().startsWith('thread') && !topic.toLowerCase().startsWith('post')) {
        return `Drafting and optimizing narrative thread regarding '${topic}' for social broadcast`;
      }
      return 'Drafting and optimizing narrative thread for social broadcast';
    }

    // 9. Knowledge & Real-time Web Search
    if (domain === 'KNOWLEDGE' || lower.includes('search') || lower.includes('cari') || lower.includes('google') || lower.includes('browse')) {
      const topic = this.extractCoreTopic(raw);
      if (topic && topic.toLowerCase() !== 'search' && topic.toLowerCase() !== 'cari') {
        return `Conducting real-time web discovery regarding '${topic}' and synthesizing factual sources`;
      }
      return 'Conducting real-time web discovery and synthesizing factual sources';
    }

    // 10. Comparative / Analytical Evaluation
    if (
      (lower.includes('kelebihan') || lower.includes('beda') || lower.includes('banding') || lower.includes('compare') || lower.includes('versus') || lower.includes('vs')) &&
      (lower.includes('ai') || lower.includes('agent') || lower.includes('kamu') || lower.includes('lain'))
    ) {
      if (lower.includes('kerja') || lower.includes('manusia') || lower.includes('ganti') || lower.includes('job') || lower.includes('future') || lower.includes('masa depan')) {
        return 'Evaluating comparative advantages against conventional AI agents and assessing future workforce utility';
      }
      return 'Analyzing architectural strengths and autonomous execution capabilities compared to standard LLMs';
    }

    // 11. Contextual & Topical Inquiries (e.g. "jika makan di warung wareg bagaimana?")
    const coreTopic = this.extractCoreTopic(raw);
    if (coreTopic && coreTopic.length > 2 && coreTopic.toLowerCase() !== raw.toLowerCase()) {
      return `Analyzing inquiry regarding '${coreTopic}' and evaluating practical recommendations`;
    }

    // 12. Dynamic Fallback: Clean Quoting of User's Actual Inquiry
    if (raw.length <= 60) {
      return `Analyzing user inquiry: "${raw}"`;
    }
    return `Analyzing user inquiry: "${raw.slice(0, 57)}..."`;
  }

  public async classify(
    userMessage: string,
    options?: { hasImages?: boolean; hasDocs?: boolean; _activeAbortControllerSignal?: AbortSignal }
  ): Promise<ClassificationResult> {
    const raw = (userMessage || '').trim();
    const lower = raw.toLowerCase();
    const hasImages = !!options?.hasImages;
    const hasDocs = !!options?.hasDocs;

    let targetDomain: DistilledIntent['targetDomain'] = 'CONVERSATION';
    let executionStrategy: DistilledIntent['executionStrategy'] = 'DIRECT_ANSWER';
    const requiredTools: string[] = [];

    // 1. Spreadsheet / Google Drive Domain
    if (hasDocs || lower.includes('sheet') || lower.includes('excel') || lower.includes('spreadsheet') ||
        lower.includes('tabel') || lower.includes('table') || lower.includes('grafik') || lower.includes('chart') ||
        lower.includes('omset') || lower.includes('laporan') || lower.includes('export') || lower.includes('drive')) {
      targetDomain = 'SPREADSHEET';
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      requiredTools.push('GDRIVE_CREATE_SPREADSHEET');
    }
    // 2. Vision Domain
    else if (hasImages || lower.includes('screenshot') || lower.includes('tangkapan layar') || lower.includes('gambar') || lower.includes('foto')) {
      targetDomain = 'VISION';
      executionStrategy = 'MULTI_STEP_ANALYSIS';
    }
    // 3. Finance / Web3 / Wallet Domain
    else if (lower.includes('transfer') || lower.includes('kirim') || lower.includes('wallet') || lower.includes('saldo') ||
             lower.includes('balance') || lower.includes('usdc') || lower.includes('eth') || lower.includes('swap') || lower.includes('trade')) {
      targetDomain = 'FINANCE';
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      requiredTools.push('TRANSFER_FUNDS', 'GET_WALLET_STATE');
    }
    // 4. Social / Threads Domain
    else if (lower.includes('threads') || lower.includes('post') || lower.includes('publish') || lower.includes('tweet') || lower.includes('caption')) {
      targetDomain = 'SOCIAL';
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      requiredTools.push('THREADS_PUBLISH');
    }
    // 5. Knowledge / Search Domain
    else if (lower.includes('search') || lower.includes('cari') || lower.includes('google') || lower.includes('browse')) {
      targetDomain = 'KNOWLEDGE';
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      requiredTools.push('WEB_SEARCH');
    }

    const primaryGoal = IntentClassifier.synthesizeCognitiveThought(raw, targetDomain, hasDocs, hasImages);

    const cognitiveAnchor = `[COGNITIVE INTENT ANCHOR]
Primary Goal: ${primaryGoal}
Domain: ${targetDomain}
Execution Strategy: ${executionStrategy}${requiredTools.length > 0 ? `\nRecommended Tools: ${requiredTools.join(', ')}` : ''}`;

    const workRoute: WorkRoute = {
      workClass: targetDomain === 'CONVERSATION' ? 'CONVERSATION' : 'TASK',
      lane: 'EXECUTION'
    };

    return {
      intent: 'NONE',
      distilledIntent: {
        primaryGoal,
        targetDomain,
        executionStrategy,
        requiredTools,
        cognitiveAnchor
      },
      parameters: { _seraWorkClass: workRoute.workClass },
      workRoute
    };
  }
}
