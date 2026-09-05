import { describe, expect, it } from 'vitest';
import { SubAgentCoordinator } from '../src/capabilities/agents/SubAgentCoordinator';
import { DynamicPromptAssembler } from '../src/capabilities/dialogue/cognitive/DynamicPromptAssembler';
import { CognitiveIntake } from '../src/capabilities/dialogue/cognitive/CognitiveIntake';
import { IntentClassifier } from '../src/capabilities/dialogue/IntentClassifier';

describe('Modular Cognitive Pipeline (Option A Architecture)', () => {
  it('SubAgentCoordinator filters tools strictly by domain and suppresses tools for pure conversation', () => {
    const coordinator = new SubAgentCoordinator();

    // 1. Pure conversation (domain: general) should yield 0 tools to prevent token bloat
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
  });

  it('DynamicPromptAssembler assembles focused prompts and tools without static prompt bloat', () => {
    const coordinator = new SubAgentCoordinator();

    // Pure conversational greeting
    const greetingContext = DynamicPromptAssembler.assemble({
      domains: ['general'],
      executionStrategy: 'DIRECT_ANSWER',
      subAgentCoordinator: coordinator
    });
    expect(greetingContext.tools.length).toBe(0);
    expect(greetingContext.systemPrompt).toContain('SERA');
    expect(greetingContext.systemPrompt).not.toContain('GOOGLE DRIVE & SPREADSHEETS');
    expect(greetingContext.systemPrompt).not.toContain('WALLET & DEFI OPERATIONS');

    // Spreadsheet task
    const sheetContext = DynamicPromptAssembler.assemble({
      domains: ['productivity'],
      executionStrategy: 'REQUIRE_TOOL_EXECUTION',
      subAgentCoordinator: coordinator
    });
    expect(sheetContext.tools.length).toBeGreaterThan(0);
    expect(sheetContext.systemPrompt).toContain('GOOGLE DRIVE & SPREADSHEETS');
    expect(sheetContext.systemPrompt).not.toContain('WALLET & DEFI OPERATIONS');
  });

  it('CognitiveIntake produces safe fallback results when model inference is unavailable', () => {
    const mockOrchestrator: any = {};
    const intake = new CognitiveIntake(mockOrchestrator);

    const greetingFallback = intake.createFallbackResult('timeout', 'Halo Sera');
    expect(greetingFallback.intent).toBe('GREETING');
    expect(greetingFallback.domains).toContain('general');
    expect(greetingFallback.executionStrategy).toBe('DIRECT_ANSWER');
    expect(greetingFallback.stepBudget).toBe(1);

    const sheetFallback = intake.createFallbackResult('timeout', 'Tolong buatkan spreadsheet pengeluaran kantor');
    expect(sheetFallback.domains).toContain('productivity');
    expect(sheetFallback.executionStrategy).toBe('REQUIRE_TOOL_EXECUTION');
    expect(sheetFallback.stepBudget).toBe(5);
  });

  it('IntentClassifier legacy adapter maintains backwards compatibility', async () => {
    const classifier = new IntentClassifier();
    const res = await classifier.classify('Tolong buatkan spreadsheet');
    expect(res.intent).toBe('NONE');
    expect(res.distilledIntent.targetDomain).toBe('SPREADSHEET');
    expect(res.distilledIntent.cognitiveAnchor).toBeDefined();
  });
});
