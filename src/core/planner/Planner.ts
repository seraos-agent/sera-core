import { Goal, IntentInvalidationError } from '../goals/types';
import { Plan, PlanStep } from './types';
import { StrategyProfile } from '../strategy/types';
import { TemporalContext } from '../temporal/types';

export class Planner {
  generatePlan(goal: Goal, worldState: any, memoryStore: any, strategy: StrategyProfile, tc?: TemporalContext): Plan {
    console.log(`\n[Planner] Generating Plan for Goal: ${goal.id} under Strategy: ${strategy.name}`);
    
    const now = tc ? tc.physicalTime : Date.now();

    // Phase 3.4: Intent Preservation
    if (goal.intentContract) {
      for (const [field, expectedValue] of Object.entries(goal.intentContract.assumptions)) {
        const actualValue = worldState.data ? worldState.data[field] : worldState[field];
        
        // Simple numeric comparison (e.g. expected maxBTCPrice)
        if (field.startsWith('max') && typeof actualValue === 'number' && typeof expectedValue === 'number') {
           if (actualValue > expectedValue) {
             throw new IntentInvalidationError({
               type: 'ASSUMPTION_BREACH',
               field,
               expected: `<= ${expectedValue}`,
               actual: actualValue,
               timestamp: now
             });
           }
        }
        
        // Add other simple equality checks if needed
        else if (actualValue !== undefined && actualValue !== expectedValue && !field.startsWith('max')) {
           throw new IntentInvalidationError({
               type: 'ASSUMPTION_BREACH',
               field,
               expected: expectedValue,
               actual: actualValue,
               timestamp: now
             });
        }
      }
    }

    // We will do a simple static mapping of Goal -> Plan
    // But we will inject Experience-Informed logic using Beliefs.

    const steps: PlanStep[] = [];
    
    // Check if the goal requests a specific tool
    let intendedTool = goal.targetState?.toolId || 'mock-read-tool';
    
    // EXPERIENCE-INFORMED PLANNING:
    // The Planner consults semantic beliefs before committing to a step.
    const semanticBeliefs = memoryStore.getBeliefsByCategory('SEMANTIC');
    const toolFailureBeliefs = semanticBeliefs.filter((b: any) => 
      b.epistemicStatus === 'CONFIRMED' && 
      typeof b.content === 'string' &&
      b.content.includes(intendedTool) && 
      b.content.includes('failed consistently')
    );

    if (toolFailureBeliefs.length > 0) {
      console.log(`[Planner] [EXPERIENCE-INFORMED] Warning: Found CONFIRMED belief that intended tool '${intendedTool}' fails consistently.`);
      console.log(`[Planner] [EXPERIENCE-INFORMED] Altering plan to use safe fallback tool 'mock-read-tool'.`);
      intendedTool = 'mock-read-tool';
    }

    // Step 1: Pre-execution validation
    steps.push({
      id: `step-${now}-1`,
      description: 'Validate goal feasibility and environment',
      action: 'validate_environment',
      payload: {},
      status: 'PENDING'
    });

    // Step 2: Main execution
    steps.push({
      id: `step-${now}-2`,
      description: `Execute primary intent using tool ${intendedTool}`,
      action: 'execute_work_item',
      payload: { toolId: intendedTool },
      status: 'PENDING'
    });

    // Step 3: Verification
    steps.push({
      id: `step-${now}-3`,
      description: 'Verify execution results against goal target state',
      action: 'verify_results',
      payload: {},
      status: 'PENDING'
    });

    // STRATEGY ENFORCEMENT:
    // If the strategy limits us, we mathematically truncate or re-formulate.
    // For this demonstration, if maxStepsPerPlan < 3, we drop verification to save resources.
    let finalSteps = steps;
    if (strategy.planningConstraints.maxStepsPerPlan < steps.length) {
      console.log(`[Planner] [STRATEGY-ENFORCED] Strategy limits plan to ${strategy.planningConstraints.maxStepsPerPlan} steps. Reformulating...`);
      finalSteps = steps.slice(0, strategy.planningConstraints.maxStepsPerPlan);
    }

    const plan: Plan = {
      id: `plan-${now}`,
      goalId: goal.id,
      status: 'PROPOSED',
      steps: finalSteps,
      createdAt: now
    };
    
    console.log(`[Planner] Plan generated with ${finalSteps.length} steps.`);
    return plan;
  }
}
