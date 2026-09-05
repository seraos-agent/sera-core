import { ModelOrchestrator } from '../../../core/llm/ModelOrchestrator';
import { SubAgentDomain } from '../../agents/types';

export interface CognitiveIntakeParams {
  userMessage: string;
  historySnippet?: string;
  hasImages?: boolean;
  hasDocs?: boolean;
  abortSignal?: AbortSignal;
}

export interface CognitiveIntakeResult {
  intent: string;
  domains: SubAgentDomain[];
  userFacingThought: string;
  cognitiveAnchor: string;
  executionStrategy: 'DIRECT_ANSWER' | 'REQUIRE_TOOL_EXECUTION' | 'MULTI_STEP_ANALYSIS';
  stepBudget: number;
}

/**
 * CognitiveIntake — Instantaneous Semantic Perception & Domain Routing.
 * 
 * Performs sub-millisecond semantic domain evaluation in memory to eliminate redundant
 * network latency, allowing the main LLM to focus on deep native cognitive reasoning (Chain-of-Thought).
 * 
 * Architecture Principle: Single Responsibility, English Code Standard (Rule 7).
 */
export class CognitiveIntake {
  constructor(private readonly orchestrator?: ModelOrchestrator) {}

  public async evaluate(params: CognitiveIntakeParams): Promise<CognitiveIntakeResult> {
    const { userMessage, hasImages, hasDocs } = params;
    const cleanMessage = (userMessage || '').trim();

    return this.createInstantPerception(cleanMessage, hasImages, hasDocs);
  }

  public createInstantPerception(
    cleanMessage: string,
    hasImages: boolean = false,
    hasDocs: boolean = false
  ): CognitiveIntakeResult {
    const lower = cleanMessage.toLowerCase();

    const domains: SubAgentDomain[] = [];
    if (hasDocs || /\b(drive|sheet|sheets|spreadsheet|excel|csv|tabel|table|anggaran|budget|laporan|ledger|rekap|simpan|save|folder|arsip|rapikan|tidy|pindahkan|rename|organize|direktori|directory|formula|chart|grafik|uji|verifikasi)\b/i.test(lower)) {
      domains.push('productivity');
    }
    if (
      /\b(solana|sol|usdc|transfer|wallet|saldo|swap|hyperliquid|hl|crypto|koin|token|trade|market|harga)\b/i.test(lower) ||
      /\bkirim\s+(sol|usdc|koin|token|saldo|crypto|uang|dana)\b/i.test(lower)
    ) {
      domains.push('defi');
    }
    if (hasImages || /\b(threads|twitter|tweet|post|gambar|image|generate|photo|foto|video|mp4|media|draw)\b/i.test(lower)) {
      domains.push('social');
    }
    if (/\b(theme|tema|hapus chat|clear chat|ingatkan|reminder|jadwal|schedule|alarm|cron)\b/i.test(lower)) {
      domains.push('system');
    }
    if (domains.length === 0) {
      domains.push('general');
    }

    const isSimpleGreeting = /^(halo|hai|hi|hey|hello|pagi|siang|sore|malam|assalamualaikum)\b/i.test(lower) && lower.split(' ').length <= 3;
    const isDirectCapabilityInquiry = /\b(kemampuan|bisa apa|fitur|capabilities|who are you|siapa kamu)\b/i.test(lower);
    const isConversationalConfirmation = /^(boleh|oke|ok|ya|iya|siap|mantap|baik|silakan|lanjutkan|lanjut|terima kasih|thanks|makasih)\b/i.test(lower) && !/\b(buatkan|bikin|buat|create|transfer|swap|hapus|delete|move|rename|ganti)\b/i.test(lower);

    let executionStrategy: CognitiveIntakeResult['executionStrategy'] = 'REQUIRE_TOOL_EXECUTION';
    let stepBudget = 5;

    if (isSimpleGreeting) {
      executionStrategy = 'DIRECT_ANSWER';
      stepBudget = 1;
    } else if (isConversationalConfirmation || isDirectCapabilityInquiry) {
      executionStrategy = 'DIRECT_ANSWER';
      stepBudget = 2;
    } else {
      executionStrategy = 'REQUIRE_TOOL_EXECUTION';
      stepBudget = 5;
    }

    const userFacingThought = hasImages || hasDocs
      ? 'Analyzing attached media and documents...'
      : 'Evaluating request context and preparing actions...';

    return {
      intent: isSimpleGreeting ? 'GREETING' : (isDirectCapabilityInquiry ? 'CAPABILITY_QUERY' : (isConversationalConfirmation ? 'CONFIRMATION' : 'OPERATION')),
      domains: domains.length > 0 ? domains : ['general'],
      executionStrategy,
      userFacingThought,
      cognitiveAnchor: cleanMessage ? `Process request: ${cleanMessage.slice(0, 50)}` : 'Awaiting user input',
      stepBudget
    };
  }

  public createFallbackResult(
    reason: string,
    cleanMessage: string,
    hasImages: boolean = false,
    hasDocs: boolean = false
  ): CognitiveIntakeResult {
    return this.createInstantPerception(cleanMessage, hasImages, hasDocs);
  }
}
