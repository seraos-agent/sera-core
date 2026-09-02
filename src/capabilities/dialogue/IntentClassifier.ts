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
    let primaryGoal = raw ? `Address user inquiry: "${raw.slice(0, 120)}"` : 'Engage with user';
    const requiredTools: string[] = [];

    // 1. Spreadsheet / Google Drive Domain
    if (hasDocs || lower.includes('sheet') || lower.includes('excel') || lower.includes('spreadsheet') ||
        lower.includes('tabel') || lower.includes('table') || lower.includes('grafik') || lower.includes('chart') ||
        lower.includes('omset') || lower.includes('laporan') || lower.includes('export') || lower.includes('drive')) {
      targetDomain = 'SPREADSHEET';
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      primaryGoal = hasDocs
        ? 'Process ingested tabular document, compute summary metrics, and manage spreadsheet/charts in Google Drive.'
        : `Handle spreadsheet/Google Drive data operation requested: "${raw.slice(0, 100)}"`;
      requiredTools.push('GDRIVE_CREATE_SPREADSHEET');
    }
    // 2. Vision Domain
    else if (hasImages || lower.includes('screenshot') || lower.includes('tangkapan layar') || lower.includes('gambar') || lower.includes('foto')) {
      targetDomain = 'VISION';
      executionStrategy = 'MULTI_STEP_ANALYSIS';
      primaryGoal = 'Inspect multimodal image attachments and provide accurate visual analysis, data extraction, and details.';
    }
    // 3. Finance / Web3 / Wallet Domain
    else if (lower.includes('transfer') || lower.includes('kirim') || lower.includes('wallet') || lower.includes('saldo') ||
             lower.includes('balance') || lower.includes('usdc') || lower.includes('eth') || lower.includes('swap') || lower.includes('trade')) {
      targetDomain = 'FINANCE';
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      primaryGoal = `Execute financial/wallet operation with autonomy agreements: "${raw.slice(0, 100)}"`;
      requiredTools.push('TRANSFER_FUNDS', 'GET_WALLET_STATE');
    }
    // 4. Social / Threads Domain
    else if (lower.includes('threads') || lower.includes('post') || lower.includes('publish') || lower.includes('tweet') || lower.includes('caption')) {
      targetDomain = 'SOCIAL';
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      primaryGoal = `Publish or synthesize social media content for Threads: "${raw.slice(0, 100)}"`;
      requiredTools.push('THREADS_PUBLISH');
    }
    // 5. Knowledge / Search Domain
    else if (lower.includes('search') || lower.includes('cari') || lower.includes('google') || lower.includes('browse')) {
      targetDomain = 'KNOWLEDGE';
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      primaryGoal = `Search or retrieve live external knowledge: "${raw.slice(0, 100)}"`;
      requiredTools.push('WEB_SEARCH');
    }

    const cognitiveAnchor = `[COGNITIVE INTENT ANCHOR]
Primary Goal: ${primaryGoal}
Domain: ${targetDomain}
Execution Strategy: ${executionStrategy}${requiredTools.length > 0 ? `\nRecommended Tools: ${requiredTools.join(', ')}` : ''}`;

    const workRoute: WorkRoute = {
      workClass: targetDomain === 'CONVERSATION' ? 'CONVERSATION' : 'TASK',
      lane: 'EXECUTION'
    };

    return {
      intent: targetDomain,
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

