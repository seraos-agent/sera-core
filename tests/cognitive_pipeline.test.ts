import { describe, expect, it } from 'vitest';
import { SubAgentCoordinator } from '../src/capabilities/agents/SubAgentCoordinator';
import { DynamicPromptAssembler } from '../src/capabilities/dialogue/cognitive/DynamicPromptAssembler';
import { IntentClassifier } from '../src/capabilities/dialogue/IntentClassifier';

describe('Modular Cognitive Pipeline (Liberated Agent Architecture)', () => {
  it('SubAgentCoordinator filters tools strictly by domain and aggregates all ecosystem tools', () => {
    const coordinator = new SubAgentCoordinator();

    // 1. Pure conversation (domain: general) should yield 0 domain-specific tools
    const generalTools = coordinator.getToolsForDomains(['general']);
    expect(generalTools.length).toBe(0);

    // 2. Productivity domain should yield only Google Drive / Spreadsheet tools
    const productivityTools = coordinator.getToolsForDomains(['productivity']);
    expect(productivityTools.length).toBeGreaterThan(0);
    const productivityNames = productivityTools.map(t => t.name);
    expect(productivityNames).toContain('GDRIVE_CREATE_SPREADSHEET');
    expect(productivityNames).not.toContain('TRANSFER_FUNDS');
    expect(productivityNames).not.toContain('THREADS_PUBLISH');

    // 3. DeFi domain should yield only Web3/Crypto tools
    const defiTools = coordinator.getToolsForDomains(['defi']);
    expect(defiTools.length).toBeGreaterThan(0);
    const defiNames = defiTools.map(t => t.name);
    expect(defiNames).toContain('TRANSFER_FUNDS');
    expect(defiNames).toContain('HL_SPOT_MARKET_DATA');
    expect(defiNames).not.toContain('GDRIVE_CREATE_SPREADSHEET');

    // 4. Combined domains should union relevant tools cleanly without duplicates
    const combined = coordinator.getToolsForDomains(['productivity', 'defi']);
    expect(combined.length).toBe(productivityTools.length + defiTools.length);

    // 5. Total active ecosystem tools aggregated cleanly
    const allTools = coordinator.getAllTools();
    expect(allTools.length).toBeGreaterThanOrEqual(10);
  });

  it('DynamicPromptAssembler always provides full authorized tool spectrum to empower autonomous agency', () => {
    const coordinator = new SubAgentCoordinator();

    // Unchained agent: all authorized tools are provided even on greeting or conversational turns
    const context = DynamicPromptAssembler.assemble({
      subAgentCoordinator: coordinator
    });
    expect(context.tools.length).toBeGreaterThanOrEqual(10);
    expect(context.systemPrompt).toContain('SERA');
    expect(context.systemPrompt).toContain('GOOGLE DRIVE & SPREADSHEETS');
    expect(context.systemPrompt).toContain('WALLET & DEFI OPERATIONS');
    expect(context.systemPrompt).toContain('SOCIAL MEDIA & META THREADS CAPABILITIES');
  });

  it('IntentClassifier legacy adapter maintains backwards compatibility', async () => {
    const classifier = new IntentClassifier();
    const res = await classifier.classify('Tolong buatkan spreadsheet');
    expect(res.intent).toBe('NONE');
    expect(res.distilledIntent.targetDomain).toBe('SPREADSHEET');
    expect(res.distilledIntent.cognitiveAnchor).toBeDefined();
    expect(res.distilledIntent.activeDomains).toContain('productivity');
  });

  it('IntentClassifier routes casual greeting, search, defi, and multi-domain requests accurately', async () => {
    const classifier = new IntentClassifier();

    // 1. Casual chat -> general domain, DIRECT_ANSWER strategy
    const casualRes = await classifier.classify('Hey Sera lagi apa?');
    expect(casualRes.distilledIntent.targetDomain).toBe('CONVERSATION');
    expect(casualRes.distilledIntent.executionStrategy).toBe('DIRECT_ANSWER');
    expect(casualRes.distilledIntent.activeDomains).toEqual(['general']);

    // 2. Search / Warung -> social domain (for WEB_SEARCH), REQUIRE_TOOL_EXECUTION
    const searchRes = await classifier.classify('Cari warung terdekat');
    expect(searchRes.distilledIntent.targetDomain).toBe('KNOWLEDGE');
    expect(searchRes.distilledIntent.executionStrategy).toBe('REQUIRE_TOOL_EXECUTION');
    expect(searchRes.distilledIntent.activeDomains).toContain('social');
    expect(searchRes.distilledIntent.activeDomains).not.toContain('defi');

    // 3. DeFi request -> defi domain, REQUIRE_TOOL_EXECUTION
    const defiRes = await classifier.classify('Cek harga BTC hari ini');
    expect(defiRes.distilledIntent.targetDomain).toBe('FINANCE');
    expect(defiRes.distilledIntent.executionStrategy).toBe('REQUIRE_TOOL_EXECUTION');
    expect(defiRes.distilledIntent.activeDomains).toEqual(['defi']);

    // 4. Multi-domain -> multi-step analysis, multiple active domains
    const multiRes = await classifier.classify('Cek harga SOL lalu buatkan spreadsheet laporan');
    expect(multiRes.distilledIntent.executionStrategy).toBe('MULTI_STEP_ANALYSIS');
    expect(multiRes.distilledIntent.activeDomains).toContain('defi');
    expect(multiRes.distilledIntent.activeDomains).toContain('productivity');
  });

  it('DynamicPromptAssembler applies domain-scoped pruning and zero-tool gating', () => {
    const coordinator = new SubAgentCoordinator();

    // 1. Casual turn (DIRECT_ANSWER): 0 tools and lean persona (no 18 tool exemplars)
    const casualContext = DynamicPromptAssembler.assemble({
      domains: ['general'],
      executionStrategy: 'DIRECT_ANSWER',
      subAgentCoordinator: coordinator
    });
    expect(casualContext.tools.length).toBe(0);
    expect(casualContext.systemPrompt).toContain('SERA');
    expect(casualContext.systemPrompt).not.toContain('CRITICAL - FEW-SHOT TOOL CALL EXEMPLARS');

    // 2. Scoped DeFi turn: Only DeFi tools injected (no spreadsheet or threads tools)
    const defiContext = DynamicPromptAssembler.assemble({
      domains: ['defi'],
      executionStrategy: 'REQUIRE_TOOL_EXECUTION',
      subAgentCoordinator: coordinator
    });
    const defiToolNames = defiContext.tools.map(t => t.name);
    expect(defiToolNames).toContain('HL_SPOT_MARKET_DATA');
    expect(defiToolNames).toContain('TRANSFER_FUNDS');
    expect(defiToolNames).not.toContain('GDRIVE_CREATE_SPREADSHEET');
    expect(defiToolNames).not.toContain('THREADS_PUBLISH');

    // 3. Scoped Search turn: Only SocialMediaAgent tools injected (WEB_SEARCH), no DeFi tools
    const searchContext = DynamicPromptAssembler.assemble({
      domains: ['social'],
      executionStrategy: 'REQUIRE_TOOL_EXECUTION',
      subAgentCoordinator: coordinator
    });
    const searchToolNames = searchContext.tools.map(t => t.name);
    expect(searchToolNames).toContain('WEB_SEARCH');
    expect(searchToolNames).not.toContain('HL_SPOT_MARKET_DATA');
    expect(searchToolNames).not.toContain('GDRIVE_CREATE_SPREADSHEET');
  });
});

