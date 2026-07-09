import { EventEmitter } from 'events';
import { MemoryStore } from '../src/memory/MemoryStore';
import { MemoryIngress } from '../src/core/memory/MemoryIngress';
import { GovernanceOutcomeTracker } from '../src/core/governance/GovernanceOutcomeTracker';
import { GovernanceReflectionEngine } from '../src/core/governance/GovernanceReflectionEngine';
import { CalibrationEvaluationEngine } from '../src/core/cognition/CalibrationEvaluationEngine';
import { GovernanceCalibrationEngine } from '../src/core/governance/GovernanceCalibrationEngine';
import { MetaGovernanceReview } from '../src/core/governance/MetaGovernanceReview';
import { MetricsAggregator } from '../src/core/telemetry/MetricsAggregator';
import { InMemoryMetricsStore } from '../src/core/telemetry/MetricsStore';
import { MemorySource } from '../src/core/memory/MemorySource';
import { MemoryProposal, MemoryOperation } from '../src/core/memory/MemoryProposal';
import { EvidenceType } from '../src/core/memory/MemoryEvidence';

async function runSimulations() {
  console.log('===========================================================');
  console.log('   PHASE 5.5: COGNITIVE SIMULATION & FAILURE RECOVERY');
  console.log('===========================================================');

  const eventBus = new EventEmitter();
  const metricsStore = new InMemoryMetricsStore();
  const metricsAggregator = new MetricsAggregator(eventBus, metricsStore);
  
  const memoryStore = new MemoryStore(eventBus);
  const memoryIngress = new MemoryIngress(eventBus, memoryStore);
  
  const calibrationEvaluationEngine = new CalibrationEvaluationEngine(memoryStore);
  const governanceCalibrationEngine = new GovernanceCalibrationEngine(memoryStore);
  const governanceOutcomeTracker = new GovernanceOutcomeTracker(memoryStore, eventBus);
  const governanceReflectionEngine = new GovernanceReflectionEngine(memoryStore, eventBus);
  const metaGovernanceReview = new MetaGovernanceReview(eventBus);

  let simulatedTime = Date.now();
  const originalDateNow = Date.now;
  Date.now = () => simulatedTime;

  function clearMemory() {
    (memoryStore as any).beliefs.clear();
    (memoryStore as any).categoryIndex.clear();
    (memoryStore as any).keyIndex.clear();
  }

  function injectCalibrationSequence(intentType: string, category: string, count: number, startError: number, errorStep: number) {
    for (let i = 0; i < count; i++) {
      simulatedTime += 1000;
      const error = startError + (errorStep * i);
      const data = {
        intentType,
        category,
        calibrationState: 'OVERCONFIDENT',
        avgSuccessError: error,
        timestamp: simulatedTime
      };
      memoryStore.updateBelief({
        id: `calib-${simulatedTime}-${Math.random().toString(36).substring(2,7)}`,
        category: 'CALIBRATION',
        content: JSON.stringify(data),
        epistemicStatus: 'CONFIRMED',
        confidence: 1.0,
        evidenceIds: [],
        contradictionIds: [],
        createdAt: simulatedTime,
        updatedAt: simulatedTime
      });
    }
  }

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // ---------------------------------------------------------
  // SIMULATION 1: KEPUTUSAN BENAR (CORRECT DECISION)
  // ---------------------------------------------------------
  console.log('\n>>> SIMULATION 1: KEPUTUSAN BENAR (CORRECT DECISION) <<<');
  clearMemory();
  injectCalibrationSequence('INTENT_1', 'Swap', 5, -0.1, -0.05);
  
  let recs = calibrationEvaluationEngine.evaluate();
  let rec = recs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
  if (rec) {
    governanceCalibrationEngine.calibrate([rec]);
    metaGovernanceReview.submitRecommendation(rec);
    metaGovernanceReview.recordDecision(rec.id, 'APPROVED', 'Looks good');
    
    simulatedTime += 10000;
    injectCalibrationSequence('INTENT_1', 'Swap', 3, -0.05, 0.02); // gets closer to 0
    governanceOutcomeTracker.evaluate();
  }
  await delay(50);
  
  // ---------------------------------------------------------
  // SIMULATION 2: KEPUTUSAN SALAH (WRONG DECISION)
  // ---------------------------------------------------------
  console.log('\n>>> SIMULATION 2: KEPUTUSAN SALAH (WRONG DECISION) <<<');
  clearMemory();
  
  // Run 5 wrong decisions to build a pattern
  for (let cycle = 1; cycle <= 5; cycle++) {
    injectCalibrationSequence('INTENT_WRONG', 'Lending', 5, -0.1, -0.05);
    (calibrationEvaluationEngine as any).recommendations = []; // reset for test
    let wrongRecs = calibrationEvaluationEngine.evaluate();
    let wrongRec = wrongRecs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
    if (wrongRec) {
      metaGovernanceReview.submitRecommendation(wrongRec);
      metaGovernanceReview.recordDecision(wrongRec.id, 'APPROVED', 'Seems okay');
      
      simulatedTime += 10000;
      // It actually gets WORSE (error goes from -0.3 to -0.4, -0.5)
      injectCalibrationSequence('INTENT_WRONG', 'Lending', 3, -0.4, -0.05);
      governanceOutcomeTracker.evaluate();
    }
    await delay(20);
  }
  governanceReflectionEngine.evaluate();
  await delay(20);

  // Future decision detects this wrong pattern
  injectCalibrationSequence('INTENT_WRONG', 'Lending', 5, -0.2, -0.05);
  (calibrationEvaluationEngine as any).recommendations = [];
  let futureWrongRecs = calibrationEvaluationEngine.evaluate();
  let futureWrongRec = futureWrongRecs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
  if (futureWrongRec) {
    governanceCalibrationEngine.calibrate([futureWrongRec]);
  }

  // ---------------------------------------------------------
  // SIMULATION 3: GOVERNANCE DENIAL
  // ---------------------------------------------------------
  console.log('\n>>> SIMULATION 3: GOVERNANCE DENIAL <<<');
  clearMemory();
  injectCalibrationSequence('INTENT_DENY', 'Staking', 5, -0.1, -0.05);
  (calibrationEvaluationEngine as any).recommendations = [];
  recs = calibrationEvaluationEngine.evaluate();
  rec = recs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
  if (rec) {
    metaGovernanceReview.submitRecommendation(rec);
    // Human explicitly rejects
    metaGovernanceReview.recordDecision(rec.id, 'REJECTED', 'Too risky right now');
  }
  await delay(50);

  // ---------------------------------------------------------
  // SIMULATION 4: MEMORY INVALIDATION (SUPERSEDED)
  // ---------------------------------------------------------
  console.log('\n>>> SIMULATION 4: MEMORY INVALIDATION (SUPERSEDED) <<<');
  clearMemory();
  
  // 1. User says wallet has 10 ETH
  let proposal1: MemoryProposal = {
    operation: MemoryOperation.CREATE,
    key: 'wallet.balance',
    value: '10 ETH',
    source: MemorySource.USER_STATEMENT,
    confidence: 0.5,
    category: 'SEMANTIC',
    evidence: { type: EvidenceType.USER_MESSAGE, referenceId: 'sim-4-1', timestamp: simulatedTime }
  };
  memoryStore.proposeBelief(proposal1);
  await delay(20);

  // 2. Blockchain says wallet has 0 ETH
  let proposal2: MemoryProposal = {
    operation: MemoryOperation.UPDATE,
    key: 'wallet.balance',
    value: '0 ETH',
    source: MemorySource.BLOCKCHAIN_OBSERVATION,
    confidence: 1.0,
    category: 'SEMANTIC',
    evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: 'sim-4-2', timestamp: simulatedTime }
  };
  memoryStore.proposeBelief(proposal2);
  await delay(50);

  let activeBelief = memoryStore.getBeliefByKey('wallet.balance');
  console.log(`[Simulation 4] Active belief for wallet.balance: ${activeBelief?.content}`);

  // ---------------------------------------------------------
  // SIMULATION 5: CONFLICTING BELIEFS
  // ---------------------------------------------------------
  console.log('\n>>> SIMULATION 5: CONFLICTING BELIEFS <<<');
  clearMemory();
  
  let conflict1: MemoryProposal = {
    operation: MemoryOperation.CREATE,
    key: 'system.health',
    value: 'OK',
    // Using BLOCKCHAIN_OBSERVATION for SYSTEM_OBSERVED level
    source: MemorySource.BLOCKCHAIN_OBSERVATION,
    confidence: 0.9,
    category: 'SEMANTIC',
    evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: 'sim-5-1', timestamp: simulatedTime }
  };
  memoryStore.proposeBelief(conflict1);
  await delay(20);

  let conflict2: MemoryProposal = {
    operation: MemoryOperation.UPDATE,
    key: 'system.health',
    value: 'DEGRADED',
    source: MemorySource.BLOCKCHAIN_OBSERVATION, // Equal weight to conflict1
    confidence: 0.9,
    category: 'SEMANTIC',
    evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: 'sim-5-2', timestamp: simulatedTime }
  };
  memoryStore.proposeBelief(conflict2);
  await delay(50);

  let finalBelief = memoryStore.getBeliefByKey('system.health');
  console.log(`[Simulation 5] Belief status after conflict: ${finalBelief?.status}`);

  console.log('\n===========================================================');
  console.log('   FINAL COGNITIVE TELEMETRY REPORT');
  console.log('===========================================================');
  const metrics = metricsStore.getMetrics();
  console.log(`Memory: Verified=${metrics.memory.verified} | Superseded=${metrics.memory.superseded} | Invalidated=${metrics.memory.invalidated}`);
  console.log(`Governance: Reviewed=${metrics.governance.actionsReviewed} | Allowed=${metrics.governance.allowed} | Denied=${metrics.governance.denied} | FalsePositives=${metrics.governance.falsePositive}`);
  console.log(`Reflection: Patterns=${metrics.reflection.patternsLearned} | Wrong=${metrics.reflection.wrongPatterns}`);
  console.log('===========================================================');

  Date.now = originalDateNow;
}

runSimulations().catch(console.error);
