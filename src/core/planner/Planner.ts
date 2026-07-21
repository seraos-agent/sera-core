import { Goal, IntentInvalidationError } from '../goals/types';
import { Plan, PlanStep } from './types';
import { StrategyProfile } from '../strategy/types';
import { TemporalContext } from '../temporal/types';

export class Planner {
  constructor(private readonly llm?: any, private readonly eventBus?: any) {}

  async generatePlan(goal: Goal, worldState: any, memoryStore: any, strategy: StrategyProfile, tc?: TemporalContext): Promise<Plan> {
    console.log(`\n[Planner] Generating Plan for Goal: ${goal.id} under Strategy: ${strategy.name}`);
    
    const now = tc ? tc.physicalTime : Date.now();

    // Phase 3.4: Intent Preservation
    if (goal.intentContract) {
      for (const [field, expectedValue] of Object.entries(goal.intentContract.assumptions)) {
        const actualValue = worldState.data ? worldState.data[field] : worldState[field];
        
        if (field.startsWith('max') && typeof actualValue === 'number' && typeof expectedValue === 'number') {
           if (actualValue > expectedValue) {
             throw new IntentInvalidationError({ type: 'ASSUMPTION_BREACH', field, expected: `<= ${expectedValue}`, actual: actualValue, timestamp: now });
           }
        } else if (actualValue !== undefined && actualValue !== expectedValue && !field.startsWith('max')) {
           throw new IntentInvalidationError({ type: 'ASSUMPTION_BREACH', field, expected: expectedValue, actual: actualValue, timestamp: now });
        }
      }
    }

    let steps: PlanStep[] = [];
    let intendedTool = goal.targetState?.toolId || 'mock-read-tool';

    const semanticBeliefs = memoryStore.getBeliefsByCategory('SEMANTIC');
    const toolFailureBeliefs = semanticBeliefs.filter((b: any) => 
      b.epistemicStatus === 'CONFIRMED' && 
      typeof b.content === 'string' &&
      b.content.includes(intendedTool) && 
      b.content.includes('failed consistently')
    );

    if (toolFailureBeliefs.length > 0) {
      console.log(`[Planner] [EXPERIENCE-INFORMED] Warning: Found CONFIRMED belief that intended tool '${intendedTool}' fails consistently. Falling back.`);
      intendedTool = 'mock-read-tool';
    }

    if (this.llm && goal.description) {
      console.log(`[Planner] Requesting dynamic plan from LLM for description: ${goal.description}`);
      try {
        const prompt = `You are a strict Planner agent. Generate a JSON array of execution steps for the following goal: "${goal.description}".
Available tools/actions you can use for the "action" field: CHECK_WALLET_BALANCE, TRANSFER_FUNDS, EVALUATE_CONDITION, EXECUTE_UI_COMMAND.
Each step in the JSON array must have:
- "id": string (e.g. "step-1")
- "description": string
- "action": string (the tool name)
- "payload": object (parameters for the tool)
- "status": "PENDING"

CRITICAL: For TRANSFER_FUNDS, "payload.amount" MUST be exactly the string "all" or a strict number (e.g. 0.1). DO NOT output "all_available_funds".

Return ONLY valid JSON array. Do not wrap in markdown \`\`\`json blocks. Just the array.`;

        const llmResponse = await this.llm.generate([{ role: 'user', content: prompt }]);
        let content = llmResponse.text || '';
        // Clean markdown if present
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          steps = parsed.map((s, idx) => {
            // Strict sanitization for known tools
            if (s.action === 'TRANSFER_FUNDS' && s.payload) {
              if (s.payload.amount === 'all_available_funds' || s.payload.amount === 'auto_deduct_from_balance') {
                s.payload.amount = 'all';
              } else if (typeof s.payload.amount === 'string' && s.payload.amount !== 'all') {
                const num = parseFloat(s.payload.amount);
                if (!isNaN(num)) s.payload.amount = num;
              }
            }
            return { ...s, id: `step-${now}-${idx+1}`, status: 'PENDING' };
          });
        }
      } catch (err) {
        console.error(`[Planner] LLM failed to generate plan:`, err);
      }
    }

    // Fallback to static plan if LLM failed or wasn't provided
    if (steps.length === 0) {
      steps.push({ id: `step-${now}-1`, description: 'Validate goal feasibility and environment', action: 'validate_environment', payload: {}, status: 'PENDING' });
      steps.push({ id: `step-${now}-2`, description: `Execute primary intent using tool ${intendedTool}`, action: 'execute_work_item', payload: { toolId: intendedTool }, status: 'PENDING' });
      steps.push({ id: `step-${now}-3`, description: 'Verify execution results against goal target state', action: 'verify_results', payload: {}, status: 'PENDING' });
    }

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
    
    if (this.eventBus) {
      const stepText = finalSteps.map((s, i) => `${i + 1}. ${s.description}`).join('\n');
      this.eventBus.emit('dialogue.agent.speak', {
        id: `evt-plan-${now}`,
        type: 'dialogue.agent.speak',
        source: 'Planner',
        timestamp: Date.now(),
        payload: {
          text: `Menyusun rencana taktis:\n${stepText}`
        }
      });
    }

    return plan;
  }
}
