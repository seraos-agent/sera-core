import { describe, expect, it } from 'vitest';
import { ExecutionProfileBuilder } from '../src/capabilities/dialogue/ExecutionProfileBuilder';
import { SubAgentCoordinator } from '../src/capabilities/agents/SubAgentCoordinator';
import { DynamicPromptAssembler } from '../src/capabilities/dialogue/cognitive/DynamicPromptAssembler';
import { CORE_SYSTEM_PROMPT } from '../src/capabilities/dialogue/prompts/coreSystemPrompt';
import { ModelOrchestrator } from '../src/core/llm/ModelOrchestrator';
import { ModelRegistry } from '../src/core/llm/ModelRegistry';
import { ILLMAdapter, ModelCapability, ExecutionProfile } from '../src/core/llm/types';

describe('Anti-Hallucination Sprint 1: Physics Calibration & Grounding Baseline', () => {
  it('ExecutionProfileBuilder calibrates deterministic sampling for Execution, Vision, and Coding tiers', () => {
    const execProfile = ExecutionProfileBuilder.forTier('Execution').build();
    expect(execProfile.constraints.temperature).toBe(0.1);
    expect(execProfile.constraints.top_p).toBe(0.1);

    const visionProfile = ExecutionProfileBuilder.forTier('Vision').build();
    expect(visionProfile.constraints.temperature).toBe(0.1);
    expect(visionProfile.constraints.top_p).toBe(0.1);

    const codingProfile = ExecutionProfileBuilder.forTier('Coding').build();
    expect(codingProfile.constraints.temperature).toBe(0.1);
    expect(codingProfile.constraints.top_p).toBe(0.1);

    const reasonProfile = ExecutionProfileBuilder.forTier('Reasoning').build();
    expect(reasonProfile.constraints.temperature).toBe(0.15);
    expect(reasonProfile.constraints.top_p).toBe(0.2);

    const socialProfile = ExecutionProfileBuilder.forTier('Social').build();
    expect(socialProfile.constraints.temperature).toBe(0.6);
    expect(socialProfile.constraints.top_p).toBe(0.8);
  });

  it('ModelOrchestrator forwards calibrated temperature and top_p to the adapter', async () => {
    let capturedOptions: any = null;

    const mockAdapter: ILLMAdapter = {
      getCapability: (): ModelCapability => ({
        provider: 'MockProvider',
        model: 'mock-model',
        tiers: ['Execution', 'Social'],
        supportsVision: false,
        supportsStreaming: false,
        supportsJSON: true,
        supportsFunctionCalling: true,
        supportsThinking: false,
        maxContext: 8192,
        priceInput: 0,
        priceOutput: 0,
        latencyClass: 'Fast'
      }),
      generate: async (messages, tools, signal, options) => {
        capturedOptions = options;
        return {
          text: 'Verified response',
          toolCalls: []
        };
      }
    };

    const registry = new ModelRegistry([mockAdapter]);
    const mockPolicy = {
      rankModels: () => [mockAdapter],
      selectModel: () => mockAdapter
    };

    const orchestrator = new ModelOrchestrator(registry, mockPolicy);
    const profile = ExecutionProfileBuilder.forTier('Execution').build();

    await orchestrator.generate(profile, [{ role: 'user', content: 'Execute transfer' }]);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions.temperature).toBe(0.1);
    expect(capturedOptions.top_p).toBe(0.1);
  });

  it('DynamicPromptAssembler retains sensory baseline tools even on DIRECT_ANSWER / casual turns', () => {
    const coordinator = new SubAgentCoordinator();
    const assembled = DynamicPromptAssembler.assemble({
      domains: ['general'],
      executionStrategy: 'DIRECT_ANSWER',
      subAgentCoordinator: coordinator
    });

    const toolNames = assembled.tools.map(t => t.name);

    // Sensory tools must be present so agent is never blind:
    expect(toolNames).toContain('WEB_SEARCH');
    expect(toolNames).toContain('CHECK_WALLET_BALANCE');
    expect(toolNames).toContain('THREADS_GET_POSTS');
    expect(toolNames).toContain('THREADS_GET_INSIGHTS');

    // Mutation tools must NOT be present on casual turns:
    expect(toolNames).not.toContain('TRANSFER_FUNDS');
    expect(toolNames).not.toContain('GDRIVE_CREATE_SPREADSHEET');
    expect(toolNames).not.toContain('THREADS_PUBLISH');
  });

  it('CORE_SYSTEM_PROMPT contains Axiom 4 of Factual Grounding & Zero Data Fabrication', () => {
    expect(CORE_SYSTEM_PROMPT).toContain('4. AXIOM OF FACTUAL GROUNDING & ZERO DATA FABRICATION:');
    expect(CORE_SYSTEM_PROMPT).toContain('STRICTLY FORBIDDEN from inventing fictional posts');
    expect(CORE_SYSTEM_PROMPT).toContain('Radical Transparency Standard');
  });
});
