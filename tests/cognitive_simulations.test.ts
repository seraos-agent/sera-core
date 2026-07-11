import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { IMemoryStore } from '../src/core/memory/IMemoryStore';
import { JsonMemoryStore } from '../src/memory/adapters/JsonMemoryStore';
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
import { MemoryStatus } from '../src/core/memory/MemoryItem';

describe('Cognitive Simulations', () => {
  let eventBus: EventEmitter;
  let metricsStore: InMemoryMetricsStore;
  let metricsAggregator: MetricsAggregator;
  let memoryStore: IMemoryStore;
  let memoryIngress: MemoryIngress;
  let calibrationEvaluationEngine: CalibrationEvaluationEngine;
  let governanceCalibrationEngine: GovernanceCalibrationEngine;
  let governanceOutcomeTracker: GovernanceOutcomeTracker;
  let governanceReflectionEngine: GovernanceReflectionEngine;
  let metaGovernanceReview: MetaGovernanceReview;

  let simulatedTime = Date.now();
  const originalDateNow = Date.now;

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

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

  beforeAll(() => {
    eventBus = new EventEmitter();
    metricsStore = new InMemoryMetricsStore();
    metricsAggregator = new MetricsAggregator(eventBus, metricsStore);
    memoryStore = new JsonMemoryStore(eventBus);
    memoryIngress = new MemoryIngress(eventBus, memoryStore as any);
    calibrationEvaluationEngine = new CalibrationEvaluationEngine(memoryStore as any);
    governanceCalibrationEngine = new GovernanceCalibrationEngine(memoryStore as any);
    governanceOutcomeTracker = new GovernanceOutcomeTracker(memoryStore as any, eventBus);
    governanceReflectionEngine = new GovernanceReflectionEngine(memoryStore as any, eventBus);
    metaGovernanceReview = new MetaGovernanceReview(eventBus);

    Date.now = () => simulatedTime;
  });

  afterAll(() => {
    Date.now = originalDateNow;
  });

  beforeEach(() => {
    clearMemory();
  });

  it('SIMULATION 1: Correct Decision', async () => {
    injectCalibrationSequence('INTENT_1', 'Swap', 5, -0.1, -0.05);
    
    let recs = calibrationEvaluationEngine.evaluate();
    let rec = recs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
    
    expect(rec).toBeDefined();
    if (rec) {
      governanceCalibrationEngine.calibrate([rec]);
      metaGovernanceReview.submitRecommendation(rec);
      metaGovernanceReview.recordDecision(rec.id, 'APPROVED', 'Looks good');
      
      simulatedTime += 10000;
      injectCalibrationSequence('INTENT_1', 'Swap', 3, -0.05, 0.02);
      governanceOutcomeTracker.evaluate();
    }
    await delay(10);
  });

  it('SIMULATION 2: Wrong Decision', async () => {
    for (let cycle = 1; cycle <= 5; cycle++) {
      injectCalibrationSequence('INTENT_WRONG', 'Lending', 5, -0.1, -0.05);
      (calibrationEvaluationEngine as any).recommendations = []; 
      let wrongRecs = calibrationEvaluationEngine.evaluate();
      let wrongRec = wrongRecs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
      
      if (wrongRec) {
        metaGovernanceReview.submitRecommendation(wrongRec);
        metaGovernanceReview.recordDecision(wrongRec.id, 'APPROVED', 'Seems okay');
        simulatedTime += 10000;
        injectCalibrationSequence('INTENT_WRONG', 'Lending', 3, -0.4, -0.05);
        governanceOutcomeTracker.evaluate();
      }
      await delay(10);
    }
    governanceReflectionEngine.evaluate();
    await delay(10);

    injectCalibrationSequence('INTENT_WRONG', 'Lending', 5, -0.2, -0.05);
    (calibrationEvaluationEngine as any).recommendations = [];
    let futureWrongRecs = calibrationEvaluationEngine.evaluate();
    let futureWrongRec = futureWrongRecs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
    
    expect(futureWrongRec).toBeDefined();
    if (futureWrongRec) {
      governanceCalibrationEngine.calibrate([futureWrongRec]);
    }
  });

  it('SIMULATION 3: Governance Denial', async () => {
    injectCalibrationSequence('INTENT_DENY', 'Staking', 5, -0.1, -0.05);
    (calibrationEvaluationEngine as any).recommendations = [];
    let recs = calibrationEvaluationEngine.evaluate();
    let rec = recs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
    
    expect(rec).toBeDefined();
    if (rec) {
      metaGovernanceReview.submitRecommendation(rec);
      metaGovernanceReview.recordDecision(rec.id, 'REJECTED', 'Too risky right now');
    }
    await delay(10);
  });

  it('SIMULATION 4: Memory Invalidation (Superseded)', async () => {
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
    await delay(10);

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
    await delay(10);

    let activeBelief = memoryStore.getBeliefByKey('wallet.balance');
    expect(activeBelief?.content).toContain('0 ETH');
  });

  it('SIMULATION 5: Conflicting Beliefs', async () => {
    let conflict1: MemoryProposal = {
      operation: MemoryOperation.CREATE,
      key: 'system.health',
      value: 'OK',
      source: MemorySource.BLOCKCHAIN_OBSERVATION,
      confidence: 0.9,
      category: 'SEMANTIC',
      evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: 'sim-5-1', timestamp: simulatedTime }
    };
    memoryStore.proposeBelief(conflict1);
    await delay(10);

    let conflict2: MemoryProposal = {
      operation: MemoryOperation.UPDATE,
      key: 'system.health',
      value: 'DEGRADED',
      source: MemorySource.BLOCKCHAIN_OBSERVATION, 
      confidence: 0.9,
      category: 'SEMANTIC',
      evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: 'sim-5-2', timestamp: simulatedTime }
    };
    memoryStore.proposeBelief(conflict2);
    await delay(10);

    let finalBelief = memoryStore.getBeliefByKey('system.health');
    expect(['DISPUTED', 'CONFLICT', 'PENDING']).toContain(finalBelief?.status || (finalBelief as any)?.epistemicStatus || 'PENDING');
  });
});
