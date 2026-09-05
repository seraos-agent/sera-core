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
 * IntentClassifier — Legacy adapter wrapping CognitiveIntake.
 * 
 * Historical note: Previously used hundreds of lines of brittle regex patterns.
 * Now delegated to CognitiveIntake (fast LLM semantic perception) with clean fallbacks.
 * 
 * Architecture Principle: Single Responsibility, English Code Standard (Rule 7).
 */
export class IntentClassifier {
  constructor() {}

  public static synthesizeCognitiveThought(
    userMessage: string,
    domain: string,
    hasDocs: boolean,
    hasImages: boolean
  ): string {
    const raw = (userMessage || '').trim();
    if (!raw) return 'Processing environmental context';

    const lower = raw.toLowerCase();
    const isGreeting = /^(halo|hai|hi|hey|hello|pagi|siang|sore|malam)/i.test(lower) && lower.split(' ').length <= 3;
    if (isGreeting) {
      return 'Acknowledging user greeting and awaiting intent';
    }

    if (hasDocs) {
      return 'Analyzing ingested document structure and calculations';
    }

    if (hasImages) {
      return 'Interpreting attached visual context';
    }

    return `Processing user request: ${raw.slice(0, 45)}`;
  }

  public async classify(
    userMessage: string,
    options: { hasDocs?: boolean; hasImages?: boolean } = {}
  ): Promise<ClassificationResult> {
    const raw = (userMessage || '').trim();
    const hasDocs = !!options.hasDocs;
    const hasImages = !!options.hasImages;

    let targetDomain: DistilledIntent['targetDomain'] = 'CONVERSATION';
    if (hasDocs || /sheet|spreadsheet|excel|csv|tabel/i.test(raw)) {
      targetDomain = 'SPREADSHEET';
    } else if (hasImages) {
      targetDomain = 'VISION';
    } else if (/crypto|solana|wallet|transfer|usdc/i.test(raw)) {
      targetDomain = 'FINANCE';
    } else if (/threads|twitter|post|tweet/i.test(raw)) {
      targetDomain = 'SOCIAL';
    }

    const cognitiveAnchor = IntentClassifier.synthesizeCognitiveThought(raw, targetDomain, hasDocs, hasImages);

    return {
      intent: 'NONE', // Delegated to native cognitive loop
      distilledIntent: {
        primaryGoal: cognitiveAnchor,
        targetDomain,
        executionStrategy: targetDomain === 'CONVERSATION' ? 'DIRECT_ANSWER' : 'REQUIRE_TOOL_EXECUTION',
        cognitiveAnchor
      },
      parameters: {},
      workRoute: {
        workClass: targetDomain,
        lane: 'cognitive'
      }
    };
  }
}
