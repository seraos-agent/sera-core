import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { CapabilityRoutingPolicy } from '../src/core/llm/CapabilityRoutingPolicy';
import { ModelOrchestrator } from '../src/core/llm/ModelOrchestrator';
import { ModelRegistry } from '../src/core/llm/ModelRegistry';
import { ILLMAdapter, ModelCapability } from '../src/core/llm/types';
import { EventTypes } from '../src/core/events/types';
import { MetricsAggregator } from '../src/core/telemetry/MetricsAggregator';
import { InMemoryMetricsStore } from '../src/core/telemetry/MetricsStore';

function capability(overrides: Partial<ModelCapability> = {}): ModelCapability {
  return {
    provider: 'Test',
    model: 'test-model',
    tiers: ['Execution'],
    supportsVision: false,
    supportsStreaming: true,
    supportsJSON: true,
    supportsFunctionCalling: true,
    supportsThinking: false,
    maxContext: 8_000,
    priceInput: 0.001,
    priceOutput: 0.002,
    latencyClass: 'UltraFast',
    ...overrides
  };
}

function adapter(cap: ModelCapability, generate = vi.fn(async () => ({
  text: `${cap.model} response`,
  usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 }
}))): ILLMAdapter {
  return { getCapability: () => cap, generate };
}

describe('CapabilityRoutingPolicy', () => {
  it('prefers the matching low-cost execution model and escalates for known long context', () => {
    const flash = adapter(capability({ model: 'flash', tiers: ['Execution'], maxContext: 8_000, priceInput: 0.001 }));
    const plus = adapter(capability({ model: 'plus', tiers: ['Reasoning'], supportsThinking: true, maxContext: 32_000, priceInput: 0.004, latencyClass: 'Fast' }));
    const policy = new CapabilityRoutingPolicy();

    expect(policy.selectModel({ tier: 'Execution', constraints: { maxCost: 'Lowest' } }, [flash, plus])?.getCapability().model).toBe('flash');
    expect(policy.selectModel({ tier: 'Execution', estimatedInputTokens: 12_000, constraints: { requiresLongContext: true } }, [flash, plus])?.getCapability().model).toBe('plus');
  });

  it('never returns an adapter that fails a hard capability requirement', () => {
    const noTools = adapter(capability({ supportsFunctionCalling: false }));
    const policy = new CapabilityRoutingPolicy();

    expect(policy.rankModels({ tier: 'Execution', constraints: { requiresTools: true } }, [noTools])).toEqual([]);
  });
});

describe('ModelOrchestrator', () => {
  it('falls back to the next eligible model and records telemetry through the existing metrics layer', async () => {
    const eventBus = new EventEmitter();
    const metricsStore = new InMemoryMetricsStore();
    new MetricsAggregator(eventBus, metricsStore);

    const unavailable = adapter(
      capability({ model: 'unavailable' }),
      vi.fn(async () => { throw new Error('provider unavailable'); })
    );
    const healthy = adapter(capability({ model: 'healthy', latencyClass: 'Fast' }));
    const orchestrator = new ModelOrchestrator(
      new ModelRegistry([unavailable, healthy]),
      new CapabilityRoutingPolicy(),
      eventBus
    );
    const completed = vi.fn();
    eventBus.on(EventTypes.LLM_MODEL_COMPLETED, completed);

    const result = await orchestrator.generate({ tier: 'Execution', constraints: {} }, [{ role: 'user', content: 'ping' }]);

    expect(result.text).toBe('healthy response');
    expect(completed).toHaveBeenCalledOnce();
    expect(completed.mock.calls[0][0].payload.fallbackUsed).toBe(true);
    expect(metricsStore.getMetrics().llm).toMatchObject({ requests: 1, failures: 1, fallbacks: 1 });
  });

  it('never falls back to a cheaper model that cannot satisfy a tool contract', async () => {
    const noTools = adapter(capability({ model: 'cheap-no-tools', supportsFunctionCalling: false, priceInput: 0.0001 }));
    const toolModel = adapter(capability({ model: 'tool-model', supportsFunctionCalling: true, priceInput: 0.01 }));
    const orchestrator = new ModelOrchestrator(new ModelRegistry([noTools, toolModel]), new CapabilityRoutingPolicy());

    const result = await orchestrator.generate(
      { tier: 'Execution', constraints: { requiresTools: true, maxCost: 'Lowest' } },
      [{ role: 'user', content: 'read market' }],
      [{ name: 'read_only_market' }]
    );

    expect(result.text).toBe('tool-model response');
    expect((noTools.generate as any)).not.toHaveBeenCalled();
    expect((toolModel.generate as any)).toHaveBeenCalledOnce();
  });
});
