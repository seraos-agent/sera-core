import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { GoalSynthesizer } from '../src/core/intents/GoalSynthesizer';
import { Intent, RepresentationGap } from '../src/core/intents/types';
import { SwarmCoordinator } from '../src/core/swarm/SwarmCoordinator';
import { IntentCoordinator } from '../src/runtime/coordinators/IntentCoordinator';
import { IntentStore } from '../src/core/intents/IntentStore';
import { IntentEngine } from '../src/core/intents/IntentEngine';
import { GoalEngine } from '../src/core/goals/GoalEngine';
import { ProposalStore } from '../src/core/intents/ProposalStore';
import { ProposalGovernance } from '../src/core/intents/ProposalGovernance';

const intent: Intent = {
  id: 'intent-swarm', description: 'Evaluate a safe release strategy.', status: 'ALIVE', terminality: 'DISCRETE', createdAt: 1
};
const gap: RepresentationGap = { intentId: intent.id, reason: 'NO_ACTIVE_REPRESENTATION', detectedAt: 2 };

describe('SwarmCoordinator', () => {
  it('runs independent strategy branches in parallel and returns a proposal-only blackboard', async () => {
    const strategy = new GoalSynthesizer().generateProposal(intent, gap, {}).candidates.find(candidate => candidate.category === 'EXPLORATORY')!.strategy;
    let active = 0;
    let maxActive = 0;
    const completed: string[] = [];
    const events: string[] = [];
    const eventBus = new EventEmitter();
    eventBus.on('swarm.task.completed', () => events.push('completed'));

    const worker = async ({ task, blackboard }: { task: { id: string }; blackboard: readonly unknown[] }) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active--;
      completed.push(task.id);
      return { taskId: task.id, dependenciesObserved: blackboard.length };
    };
    const coordinator = new SwarmCoordinator({
      RESEARCHER: worker,
      PLANNER: worker,
      CRITIC: worker,
      SYNTHESIZER: worker
    }, undefined, eventBus);

    const result = await coordinator.run(strategy, { runId: 'swarm-test', maxConcurrency: 3 });

    expect(result.status).toBe('COMPLETED');
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.tasks.every(task => task.status === 'COMPLETED')).toBe(true);
    expect(result.blackboard).toHaveLength(strategy.steps.length);
    expect(result.blackboard.every(entry => entry.value && typeof entry.value === 'object')).toBe(true);
    expect(maxActive).toBeGreaterThanOrEqual(2);
    expect(completed.at(-1)).toBe('prepare-options');
    expect(events).toHaveLength(strategy.steps.length);
  });

  it('rejects executable strategies before any worker runs', async () => {
    const strategy = new GoalSynthesizer().generateProposal(intent, gap, {}).candidates[0].strategy;
    strategy.requiredCapabilities = ['TRANSFER_FUNDS'];
    const coordinator = new SwarmCoordinator({ RESEARCHER: () => ({}) });

    await expect(coordinator.run(strategy)).rejects.toThrow('rejected by governance');
  });

  it('blocks dependent work when an upstream specialist fails', async () => {
    const strategy = new GoalSynthesizer().generateProposal(intent, gap, {}).candidates[0].strategy;
    let plannerCalls = 0;
    const coordinator = new SwarmCoordinator({
      RESEARCHER: () => { throw new Error('observation unavailable'); },
      PLANNER: () => { plannerCalls++; return {}; },
      SYNTHESIZER: () => ({})
    });

    const result = await coordinator.run(strategy, { runId: 'swarm-failure-test' });

    expect(result.status).toBe('PARTIAL');
    expect(result.tasks.find(task => task.taskId === 'observe-state')?.status).toBe('FAILED');
    expect(result.tasks.filter(task => task.taskId !== 'observe-state').every(task => task.status === 'BLOCKED')).toBe(true);
    expect(plannerCalls).toBe(0);
  });

  it('attaches swarm reviews only when the explicit planning flag is enabled', async () => {
    const previousComplexAutonomy = process.env.ENABLE_COMPLEX_AUTONOMY;
    const previousSwarmPlanning = process.env.ENABLE_SWARM_PLANNING;
    process.env.ENABLE_COMPLEX_AUTONOMY = 'true';
    process.env.ENABLE_SWARM_PLANNING = 'true';

    try {
      const intentStore = new IntentStore();
      const goalEngine = new GoalEngine();
      intentStore.registerIntent({ ...intent, id: 'intent-swarm-opt-in' });
      const coordinator = new IntentCoordinator(
        new IntentEngine(intentStore, goalEngine),
        intentStore,
        new ProposalStore(),
        new GoalSynthesizer(),
        new ProposalGovernance(),
        undefined,
        new EventEmitter(),
        undefined,
        undefined,
        new SwarmCoordinator({
          RESEARCHER: () => ({}), PLANNER: () => ({}), CRITIC: () => ({}), SYNTHESIZER: () => ({})
        })
      );

      await coordinator.runCycle({ physicalTime: 10, cognitiveCycleId: 1 }, { temporal: {} });
      const proposal = (coordinator as any).proposalStore.getActiveProposalForIntent('intent-swarm-opt-in');

      expect(proposal.candidates.every((candidate: any) => candidate.swarmReview?.status === 'COMPLETED')).toBe(true);
      expect(proposal.candidates.every((candidate: any) => candidate.swarmReview?.requiresHumanApproval === true)).toBe(true);
    } finally {
      if (previousComplexAutonomy === undefined) delete process.env.ENABLE_COMPLEX_AUTONOMY;
      else process.env.ENABLE_COMPLEX_AUTONOMY = previousComplexAutonomy;
      if (previousSwarmPlanning === undefined) delete process.env.ENABLE_SWARM_PLANNING;
      else process.env.ENABLE_SWARM_PLANNING = previousSwarmPlanning;
    }
  });
});
