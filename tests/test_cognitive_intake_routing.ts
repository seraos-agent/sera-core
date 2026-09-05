import { CognitiveIntake } from '../src/capabilities/dialogue/cognitive/CognitiveIntake';

async function runTests() {
  console.log('--- Testing CognitiveIntake Routing & Strategy ---');
  const intake = new CognitiveIntake();

  // Test 1: Bug confirmation with "kirim ke dev" -> MUST be DIRECT_ANSWER, MUST NOT trigger tool execution
  const test1 = await intake.evaluate({
    userMessage: 'Boleh, temuan bug yang nanti saya kirim ke dev'
  });
  console.log('Test 1 ("Boleh, temuan bug yang nanti saya kirim ke dev"):', {
    intent: test1.intent,
    strategy: test1.executionStrategy,
    thought: test1.userFacingThought
  });
  if (test1.executionStrategy !== 'DIRECT_ANSWER') {
    throw new Error(`FAILED: Test 1 should be DIRECT_ANSWER, got ${test1.executionStrategy}`);
  }
  console.log('✅ Test 1 PASSED');

  // Test 2: Actual DeFi transfer -> MUST be REQUIRE_TOOL_EXECUTION
  const test2 = await intake.evaluate({
    userMessage: 'Kirim 0.5 SOL ke 7xKX...'
  });
  console.log('Test 2 ("Kirim 0.5 SOL ke 7xKX..."):', {
    intent: test2.intent,
    strategy: test2.executionStrategy,
    thought: test2.userFacingThought
  });
  if (test2.executionStrategy !== 'REQUIRE_TOOL_EXECUTION') {
    throw new Error(`FAILED: Test 2 should be REQUIRE_TOOL_EXECUTION, got ${test2.executionStrategy}`);
  }
  console.log('✅ Test 2 PASSED');

  // Test 3: Create spreadsheet -> MUST be REQUIRE_TOOL_EXECUTION
  const test3 = await intake.evaluate({
    userMessage: 'Buatkan sheet rekap anggaran bulanan'
  });
  console.log('Test 3 ("Buatkan sheet rekap anggaran bulanan"):', {
    intent: test3.intent,
    strategy: test3.executionStrategy,
    thought: test3.userFacingThought
  });
  if (test3.executionStrategy !== 'REQUIRE_TOOL_EXECUTION') {
    throw new Error(`FAILED: Test 3 should be REQUIRE_TOOL_EXECUTION, got ${test3.executionStrategy}`);
  }
  console.log('✅ Test 3 PASSED');

  // Test 4: Multilingual universal availability (Option A) -> All domains available
  if (!test3.domains.includes('productivity') || !test3.domains.includes('defi')) {
    throw new Error('FAILED: Option A requires all subagents to be available');
  }
  console.log('✅ Test 4 (Option A Universal Availability) PASSED');

  console.log('\n🎉 ALL 4 COGNITIVE INTAKE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
