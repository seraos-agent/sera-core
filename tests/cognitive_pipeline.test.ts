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
  });
});
