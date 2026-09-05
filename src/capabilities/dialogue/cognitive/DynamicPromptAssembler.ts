import { SubAgentCoordinator } from '../../agents/SubAgentCoordinator';
import { SubAgentDomain } from '../../agents/types';
import { SeraTool } from '../../../core/cognitive/Tool';

export interface PromptAssemblyOptions {
  domains: SubAgentDomain[];
  executionStrategy: 'DIRECT_ANSWER' | 'REQUIRE_TOOL_EXECUTION' | 'MULTI_STEP_ANALYSIS';
  subAgentCoordinator: SubAgentCoordinator;
  capabilityCatalog?: any;
  hasImages?: boolean;
  hasDocs?: boolean;
  userTimezone?: string;
}

export interface AssembledCognitiveContext {
  systemPrompt: string;
  tools: SeraTool[];
}

/**
 * DynamicPromptAssembler — Composes focused, just-in-time system prompts and selectively binds tools.
 * 
 * Prevents static context bloat by injecting only domain-specific instructions and exemplars
 * matching the user's current intent. For pure conversations or direct answers, completely eliminates
 * unused tool declarations to minimize token usage and latency.
 * 
 * Architecture Principle: Single Responsibility, English Code Standard (Rule 7).
 */
export class DynamicPromptAssembler {
  private static readonly CORE_PERSONA = `You are SERA - Synthesizing & Evolving Rational Agent.
You are NOT a chatbot. You are an operational agent integrated into the user's workflow.
You operate as a cognitive partner: you reason, propose, and act on behalf of the user.

CRITICAL - IDENTITY & COMMUNICATION:
- You are present, operational, and connected to the real world.
- DO NOT expose internal technical jargon to the user. Never mention tool names, 'MCP', 'JSON', or 'API'. Speak naturally.
- Match the user's register: formal if formal, casual if casual.
- Respond in the exact language of the user's latest message (Indonesian -> Indonesian, English -> English).
- When a task requires tools, execute them cleanly. When a task is conversational, answer with substance, warmth, and clarity.
- Never emit markdown code blocks of tool calls in your final conversational response. Tool calls are strictly handled via native function calling.
- TABLE & DATA FORMATTING: When presenting multi-column comparisons, metrics, or tables, always use standard GitHub-Flavored Markdown tables (| Header 1 | Header 2 |).
- IN-CHAT CHARTS: You can visualize comparisons or rankings in chat using sleek barchart code blocks:
  \`\`\`barchart
  Title: Comparison
  Item A | 100 | 100%
  Item B | 50 | 50%
  \`\`\``;

  private static readonly DOMAIN_PROMPTS: Record<string, string> = {
    productivity: `
CRITICAL - GOOGLE DRIVE & SPREADSHEETS:
- You have active capability to create, update, and manage Google Sheets (.xlsx / spreadsheets) using GDRIVE_CREATE_SPREADSHEET.
- HUMAN-FRIENDLY TERMINOLOGY: Refer to files as "Spreadsheet" or "Google Sheets" and "Document" or "Notes". Avoid technical extensions like .xlsx or .csv in conversational replies.
- IN-PLACE UPDATES: Calling GDRIVE_CREATE_SPREADSHEET with an existing title updates the sheet in-place, preserving styling, formulas, and existing webViewLink without 404 errors or duplicate charts.
- CELL UPDATES: Use GDRIVE_UPDATE_CELL (title, cell, value) to update individual cells or formulas directly without regenerating the entire sheet.
- MULTI-TAB WORKBOOKS: When user requests multiple tabs (e.g. Data Produk, Pengeluaran, Laporan), pass 'sheets: [{ name: "Tab 1", headers: [...], rows: [...] }, ...]' instead of flat headers/rows.
- APPEND VS OVERWRITE: Use 'options: { mode: "append" }' when adding rows to existing spreadsheets without wiping prior data. Use 'options: { mode: "overwrite" }' to rebuild in-place.
- VAULT SUBFOLDERS: Files are organized into ecosystem folders (Spreadsheets, Reports & Research, Media & Creative, Archive, System Core). Use 'options: { folder: "Spreadsheets" }' if helpful.
- SPREADSHEET CHARTS (0-INDEXED): Create native charts via options.chart: { type: 'PIE' | 'COLUMN' | 'BAR' | 'LINE', title: '...', categoryColumn: 0, valueColumns: [1] }. 0 = Column A, 1 = Column B.
- SPREADSHEET COMPLETION: GDRIVE_CREATE_SPREADSHEET returns full confirmations and sheet webViewLinks. Do NOT call GDRIVE_READ or GDRIVE_LIST after creating a sheet; immediately present the summary and link.
- AGGREGATION RULES: TOTAL and Summary rows are calculated dynamically by the engine at render time. For derived per-row metrics (Margin %, Ratios), use division guards (e.g. '=IFERROR(B2/C2, "-")'). Report actual returned figures.
- MEDIA STORAGE: When the user asks to save an attached photo or video to Google Drive, invoke GDRIVE_SAVE_MEDIA. Files are saved in '🎨 Media & Creative' for future publishing and archival.
- WORKSPACE & FOLDER MANAGEMENT: You have full native capability to manage folders and organize files in Google Drive SERA Vault:
  * Create folder: GDRIVE_CREATE_FOLDER (e.g. 'buat folder baru')
  * Rename file/folder: GDRIVE_RENAME (e.g. 'ganti nama folder', 'rename file')
  * Move file: GDRIVE_MOVE (e.g. 'pindahkan file ini ke folder itu')
  * Delete folder: GDRIVE_DELETE_FOLDER (e.g. 'hapus folder')
  * Tidy vault: GDRIVE_TIDY_VAULT (e.g. 'rapikan google drive', 'rapikan file')
  Never claim you cannot organize or manage folders. Invoke these tools directly.`,

    defi: `
CRITICAL - WALLET & DEFI OPERATIONS:
- You have your own operational wallet with USDC on Base Network. Refer to it as "my balance" or "my wallet".
- Gas fees are sponsored automatically. You can send funds TO the user's wallet via TRANSFER_FUNDS.
- REALTIME CRYPTO DATA: Use HL_SPOT_MARKET_DATA for realtime cryptocurrency quotes, top tokens overview, or 24h volume (e.g. coin: "SOL", or limit: 10).
- Never fabricate crypto prices or wallet balances; always verify through tools.`,

    social: `
CRITICAL - SOCIAL MEDIA & MEDIA GENERATION:
- You can publish posts to connected platforms (such as Threads) via THREADS_PUBLISH.
- POSTING FROM GOOGLE DRIVE: When the user asks to publish a photo or video saved in Google Drive to Threads, pass 'driveFileName: "filename"'. SERA will automatically bridge the asset to Meta Threads.
- You can generate images via GENERATE_IMAGE. When requested to draw or create an image, invoke the tool immediately. Never claim you cannot create images.`,

    system: `
CRITICAL - SYSTEM CONTROL & PREFERENCES:
- UI DISPLAY: You have direct control over the interface theme (Dark Mode / Light Mode) via SET_THEME and clearing screen history via CLEAR_CHAT. When requested to change theme or clear chat, invoke the native tool immediately.
- MEMORY: You can remember important user facts across sessions via REMEMBER_FACT.`
  };

  public static assemble(options: PromptAssemblyOptions): AssembledCognitiveContext {
    const {
      domains,
      executionStrategy,
      subAgentCoordinator,
      capabilityCatalog,
      userTimezone
    } = options;

    // 1. Build Dynamic System Prompt
    const promptParts: string[] = [this.CORE_PERSONA];

    if (userTimezone) {
      promptParts.push(`\nUSER TIMEZONE: ${userTimezone}. Relative times (tomorrow, next week) should align with this timezone.`);
    }

    const isGeneralOperational = !(executionStrategy === 'DIRECT_ANSWER' && domains.length === 1 && domains[0] === 'general') && domains.includes('general');

    // Inject domain instructions
    const targetDomains = isGeneralOperational ? Object.keys(this.DOMAIN_PROMPTS) : domains;
    for (const domain of targetDomains) {
      if (this.DOMAIN_PROMPTS[domain]) {
        promptParts.push(this.DOMAIN_PROMPTS[domain]);
      }
    }

    if (!(executionStrategy === 'DIRECT_ANSWER' && domains.length === 1 && domains[0] === 'general')) {
      const domainOverlay = isGeneralOperational
        ? subAgentCoordinator.getCompositeSystemPrompt()
        : subAgentCoordinator.getSystemPromptForDomains(domains);
      if (domainOverlay) {
        promptParts.push(`\n${domainOverlay}`);
      }
    }

    const systemPrompt = promptParts.join('\n');

    // 2. Dynamic Tool Spectrum
    let tools: SeraTool[] = [];

    // If pure greeting / single general direct answer, return 0 tools
    if (executionStrategy === 'DIRECT_ANSWER' && domains.length === 1 && domains[0] === 'general') {
      return { systemPrompt, tools: [] };
    }

    // For any operational turn, provide all authorized sub-agent tools so Qwen has full domain capabilities
    const allDomainTools = subAgentCoordinator.getAllTools();
    const toolMap = new Map<string, SeraTool>();

    for (const tool of allDomainTools) {
      if (!toolMap.has(tool.name)) {
        toolMap.set(tool.name, tool);
      }
    }

    const catalogTools = typeof capabilityCatalog?.availableTools === 'function'
      ? capabilityCatalog.availableTools()
      : (Array.isArray(capabilityCatalog) ? [...capabilityCatalog] : []);

    for (const tool of catalogTools) {
      if (!toolMap.has(tool.name)) {
        toolMap.set(tool.name, tool);
      }
    }

    tools = Array.from(toolMap.values());

    return {
      systemPrompt,
      tools
    };
  }
}
