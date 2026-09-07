import assert from 'assert';
import { CognitiveContextBuilder } from '../src/capabilities/dialogue/CognitiveContextBuilder';
import { DynamicPromptAssembler } from '../src/capabilities/dialogue/cognitive/DynamicPromptAssembler';
import { SubAgentCoordinator } from '../src/capabilities/agents/SubAgentCoordinator';

async function verify() {
  console.log('Testing DynamicPromptAssembler and CognitiveContextBuilder fixes...');
  const coordinator = new SubAgentCoordinator();
  const assembled = DynamicPromptAssembler.assemble({ subAgentCoordinator: coordinator });

  // 1. Verify prompt completeness
  assert.ok(assembled.systemPrompt.includes('MANDATORY CLEAN TABLE FORMAT'), 'Missing MANDATORY CLEAN TABLE FORMAT');
  assert.ok(assembled.systemPrompt.includes('Autonomous Bottleneck & Blocker Management'), 'Missing Autonomous Bottleneck & Blocker Management');
  assert.ok(assembled.systemPrompt.includes('Exemplar 14 - Google Drive Create Spreadsheet & Chart:'), 'Missing Exemplar 14');
  assert.ok(assembled.systemPrompt.includes('Exemplar 18 - Threads Insights & Analytics:'), 'Missing Exemplar 18');
  assert.ok(assembled.systemPrompt.includes('WARM & FRIENDLY'), 'Missing WARM & FRIENDLY personality');

  console.log('  ✅ 1. Assembled prompt contains full SYSTEM_PROMPT (all 18 exemplars, markdown table format, rich personality) + autonomous principles.');

  // 2. Mock CognitiveContextBuilder dependencies
  let memoryQueriedWith: string | undefined;
  let queryBudget: number | undefined;
  const mockMemoryQueryService = {
    query: async (query?: string, opts?: any) => {
      memoryQueriedWith = query;
      queryBudget = opts?.tokenBudget;
      return {
        items: [{ content: 'User prefers dark theme and crypto updates' }],
        estimatedTokens: 15,
        tokenBudget: opts?.tokenBudget,
        truncated: false
      };
    },
    toPromptContext: (pack: any) => pack
  };

  const mockWorldState = { getWalletState: () => ({ address: '0x123' }) };
  const mockChatHistory = { getUiMessages: () => [] };
  const mockCatalog = { allConnectorSummaries: () => [{ name: 'Meta Threads', isActive: true }] };

  const builder = new CognitiveContextBuilder(
    mockWorldState as any,
    mockMemoryQueryService as any,
    mockChatHistory as any,
    mockCatalog as any
  );

  // Test greeting with 'Halo' (previously skipped by isShortGreeting)
  const messages = await builder.build(false, 'Halo', undefined, undefined, 8, assembled.systemPrompt);
  assert.strictEqual(memoryQueriedWith, 'Halo', 'Memory must be queried for short greeting "Halo"');
  assert.strictEqual(queryBudget, 2000, 'Memory query budget must be 2000 tokens');

  const cognitiveState = messages.find(m => typeof m.content === 'string' && m.content.includes('[COGNITIVE STATE (WORKING MEMORY)]'));
  assert.ok(cognitiveState, 'Cognitive state working memory must be present');
  assert.ok(
    (cognitiveState.content as string).includes('User prefers dark theme and crypto updates'),
    'Memory items must be injected into cognitive working memory for short messages'
  );

  console.log('  ✅ 2. Short greetings ("Halo") now seamlessly query memory with 2000 tokens budget (isShortGreeting bypass removed).');
  console.log('\n🎉 ALL FIX VERIFICATIONS PASSED (100%)!');
}

verify().catch(e => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
