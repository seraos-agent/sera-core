import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter } from 'events';
import { IWorkingMemory } from '../src/core/memory/IWorkingMemory';
import { WorkingMemory } from '../src/memory/WorkingMemory';
import { MemoryIngress } from '../src/core/memory/MemoryIngress';
import { GovernanceOutcomeTracker } from '../src/core/governance/GovernanceOutcomeTracker';
import { GovernanceReflectionEngine } from '../src/core/governance/GovernanceReflectionEngine';
import { CalibrationEvaluationEngine } from '../src/core/cognition/CalibrationEvaluationEngine';
import { GovernanceCalibrationEngine } from '../src/core/governance/GovernanceCalibrationEngine';
import { MetaGovernanceReview } from '../src/core/governance/MetaGovernanceReview';

describe('Cognitive Loop E2E', () => {
  let eventBus: EventEmitter;
  let memoryStore: IWorkingMemory;
  let memoryIngress: MemoryIngress;
  let calibrationEvaluationEngine: CalibrationEvaluationEngine;
  let governanceCalibrationEngine: GovernanceCalibrationEngine;
  let governanceOutcomeTracker: GovernanceOutcomeTracker;
  let governanceReflectionEngine: GovernanceReflectionEngine;
  let metaGovernanceReview: MetaGovernanceReview;

  let simulatedTime = Date.now();
  const originalDateNow = Date.now;

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
    memoryStore = new WorkingMemory(eventBus);
    memoryIngress = new MemoryIngress(eventBus, memoryStore as any);
    
    calibrationEvaluationEngine = new CalibrationEvaluationEngine(memoryStore as any);
    governanceCalibrationEngine = new GovernanceCalibrationEngine(memoryStore as any);
    governanceOutcomeTracker = new GovernanceOutcomeTracker(memoryStore as any, eventBus);
    governanceReflectionEngine = new GovernanceReflectionEngine(memoryStore as any, eventBus);
    metaGovernanceReview = new MetaGovernanceReview(eventBus);

    Date.now = () => simulatedTime;

    (memoryStore as any).beliefs.clear();
    (memoryStore as any).categoryIndex.clear();
    (memoryStore as any).keyIndex.clear();
  });

  afterAll(() => {
    Date.now = originalDateNow;
  });

  it('simulates 5 governance cycles to build institutional pattern', async () => {
    for (let i = 1; i <= 5; i++) {
      injectCalibrationSequence('TEST_INTENT', 'Swap', 5, -0.1, -0.05);
      
      const recs = calibrationEvaluationEngine.evaluate();
      const newRec = recs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
      
      expect(newRec).toBeDefined();
      
      if (newRec) {
        governanceCalibrationEngine.calibrate([newRec]);
        metaGovernanceReview.submitRecommendation(newRec);
        metaGovernanceReview.recordDecision(newRec.id, 'APPROVED', 'Human approved this test action');
        
        simulatedTime += 10000; 
        injectCalibrationSequence('TEST_INTENT', 'Swap', 3, -0.05, +0.02);
        
        governanceOutcomeTracker.evaluate();
      }
      
      await new Promise(r => setTimeout(r, 100)); 
    }
  });

  it('reflects on outcomes to formulate a pattern', async () => {
    governanceReflectionEngine.evaluate();
    await new Promise(r => setTimeout(r, 100)); 
    
    const patterns = memoryStore.getBeliefsByCategory('GOVERNANCE_PATTERN_RECORD');
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('utilizes learned pattern in future decisions', () => {
    simulatedTime += 50000;
    injectCalibrationSequence('TEST_INTENT', 'Swap', 5, -0.2, -0.05);
    
    (calibrationEvaluationEngine as any).recommendations = [];
    
    const futureRecs = calibrationEvaluationEngine.evaluate();
    const futureRec = futureRecs.find(r => r.status === 'PENDING_GOVERNANCE_REVIEW');
    
    expect(futureRec).toBeDefined();
    
    if (futureRec) {
      governanceCalibrationEngine.calibrate([futureRec]);
      expect(futureRec.institutionalPrecedent).toBeDefined();
    }
  });
});
