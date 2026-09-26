import { SubAgentDomain } from '../agents/types';

export interface WorkRoute {
  workClass: string;
  lane: string;
}

export interface DistilledIntent {
  primaryGoal: string;
  targetDomain: 'SPREADSHEET' | 'VISION' | 'FINANCE' | 'SOCIAL' | 'KNOWLEDGE' | 'COMMERCE' | 'CONVERSATION';
  executionStrategy: 'REQUIRE_TOOL_EXECUTION' | 'MULTI_STEP_ANALYSIS' | 'DIRECT_ANSWER';
  requiredTools?: string[];
  cognitiveAnchor: string;
  activeDomains?: SubAgentDomain[];
}

export interface ClassificationResult {
  intent: string;
  distilledIntent: DistilledIntent;
  parameters: Record<string, any>;
  workRoute: WorkRoute;
}

/**
 * IntentClassifier — Semantic Perception & Domain Router for SERA.
 * 
 * Classifies incoming user messages into domain capabilities (defi, productivity,
 * social, system, general) and selects an execution strategy (DIRECT_ANSWER,
 * REQUIRE_TOOL_EXECUTION, MULTI_STEP_ANALYSIS) to allow just-in-time tool pruning.
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
    const isGreeting = /^(halo|hai|hi|hey|helo|hei|hello|yo|pagi|siang|sore|malam)/i.test(lower) && lower.split(' ').length <= 3;
    if (isGreeting) {
      return 'Acknowledging user greeting and awaiting intent';
    }

    if (hasDocs) {
      return 'Analyzing ingested document structure and calculations';
    }

    if (hasImages) {
      return 'Interpreting attached visual context';
    }

    if (domain === 'FINANCE') {
      return `Analyzing financial & market request: ${raw.slice(0, 45)}`;
    }

    if (domain === 'SPREADSHEET') {
      return `Structuring workspace data / spreadsheet: ${raw.slice(0, 45)}`;
    }

    if (domain === 'SOCIAL') {
      return `Processing creative / social request: ${raw.slice(0, 45)}`;
    }

    if (domain === 'COMMERCE') {
      return `Processing store & catalog commerce request: ${raw.slice(0, 45)}`;
    }

    if (domain === 'KNOWLEDGE') {
      return `Investigating information / web query: ${raw.slice(0, 45)}`;
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
    const lower = raw.toLowerCase();

    const activeDomains = new Set<SubAgentDomain>();
    let targetDomain: DistilledIntent['targetDomain'] = 'CONVERSATION';

    // 1. Attached media context
    if (hasDocs) {
      activeDomains.add('productivity');
      targetDomain = 'SPREADSHEET';
    }
    if (hasImages) {
      activeDomains.add('social');
      activeDomains.add('productivity');
      targetDomain = 'VISION';
    }

    // Finance / DeFi / Crypto / Hyperliquid
    const isFinance = /\b(crypto|kripto|bitcoin|btc|eth|ethereum|sol|solana|hype|purr|token|wallet|dompet|transfer|saldo|balance|usdc|orderbook|market\s*data|beli\s*koin|jual\s*koin|spot|hyperliquid|portfolio|portofolio|cuan|rugi|pnl|kirim\s*(saldo|uang|usdc|dana))\b/i.test(lower);
    if (isFinance) {
      activeDomains.add('defi');
      if (targetDomain === 'CONVERSATION') targetDomain = 'FINANCE';
    }

    // Productivity / Google Drive / Spreadsheets / Documents / Vault
    const isProductivity = /\b(sheet|spreadsheet|excel|csv|tabel|table|kolom|baris|google\s*drive|gdrive|folder|dokumen|catatan|simpan\s*file|buatkan\s*laporan|export|rekap|pembukuan|data\s*penjualan|arsip|vault)\b/i.test(lower);
    if (isProductivity) {
      activeDomains.add('productivity');
      if (targetDomain === 'CONVERSATION') targetDomain = 'SPREADSHEET';
    }

    // Realtime Search / Information queries (WEB_SEARCH is in SocialMediaAgent)
    const isSearch = !isFinance && !isProductivity && /\b(cari|search|googling|grok|lookup|find|browse|siapa(kah)?\b|who\s+is\b|who\s+are\b|profil\b|biografi\b|latar\s*belakang\b|apa\s+(itu|artinya|definisi|yang\s+terjadi|maksud|kabar|perkembangan|penyebab|alasan)|what\s+is\b|what\s+happened\b|jelaskan\s+(tentang\b)?|ceritakan\s+(tentang\b)?|youtube|ytb|video|tonton|podcast|channel|berita|news|kronologi|sejarah|isu|situasi|cuaca|lokasi|terdekat|alamat|jadwal|skor|update(\s*terbaru)?|info\s*terbaru|terkini|latest|recent)\b/i.test(lower);
    if (isSearch) {
      activeDomains.add('social'); // SocialMediaAgent provides WEB_SEARCH
      if (targetDomain === 'CONVERSATION') targetDomain = 'KNOWLEDGE';
    }

    // Commerce / WhatsApp Catalog / Marketplace / Store / Menu / Kuliner
    const isCommerce = /\b(toko|warung|katalog|catalog|menu|makanan|minuman|food|kuliner|pesan|beli|order|belanja|etalase|produk|cart|keranjang|sembako|outlet|lapak|jajanan|bakso|mie\s*ayam|services|layanan|cak\s*jiban)\b/i.test(lower);
    if (!isSearch && !isFinance && isCommerce) {
      activeDomains.add('productivity');
      if (targetDomain === 'CONVERSATION') targetDomain = 'COMMERCE';
    }

    // Social Media / Threads / Image Generation
    const isSocial = /\b(threads|post|posting|tweet|utas|publish|unggah|buatkan\s*gambar|generate\s*image|gambar|draw|lukis|caption|konten)\b/i.test(lower);
    if (isSocial) {
      activeDomains.add('social');
      if (targetDomain === 'CONVERSATION') targetDomain = 'SOCIAL';
    }

    // System commands / Theme / Clear Chat
    const isSystem = /\b(clear\s*chat|hapus\s*chat|bersihkan\s*layar|dark\s*mode|light\s*mode|tema|theme|ingat\s*ini|remember|ganti\s*nama)\b/i.test(lower);
    if (isSystem) {
      activeDomains.add('system');
    }

    // 3. Execution strategy determination
    let executionStrategy: DistilledIntent['executionStrategy'] = 'DIRECT_ANSWER';

    if (activeDomains.size > 0) {
      executionStrategy = activeDomains.size > 1 ? 'MULTI_STEP_ANALYSIS' : 'REQUIRE_TOOL_EXECUTION';
    } else {
      // Casual greeting, banter, small talk, or conversational questions
      activeDomains.add('general');
      executionStrategy = 'DIRECT_ANSWER';
      targetDomain = 'CONVERSATION';
    }

    const cognitiveAnchor = IntentClassifier.synthesizeCognitiveThought(raw, targetDomain, hasDocs, hasImages);

    return {
      intent: 'NONE', // Preserves backward compatibility: delegates to native ReAct loop
      distilledIntent: {
        primaryGoal: cognitiveAnchor,
        targetDomain,
        executionStrategy,
        cognitiveAnchor,
        activeDomains: Array.from(activeDomains)
      },
      parameters: {},
      workRoute: {
        workClass: targetDomain,
        lane: 'cognitive'
      }
    };
  }
}

