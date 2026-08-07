---
sidebar_position: 5
---

# Verifiable Compute

Verifiable Compute ensures that every action taken by SERA OS can be **audited and proven correct**. This is critical for a system where an AI agent handles real financial transactions and autonomous decisions.

## Why Verifiability Matters

In traditional software, you trust the server to behave correctly. With autonomous AI agents, this trust model breaks down:

- An LLM could hallucinate a transaction amount.
- A bug could cause funds to be sent to the wrong address.
- A compromised server could alter the agent's behavior.

SERA addresses these risks through multiple layers of verifiable compute.

## Execution Trace Store

Every action SERA performs is recorded as an immutable `ExecutionTrace`:

```typescript
interface ExecutionTrace {
  id: string;
  goalId: string;
  steps: ExecutionStepResult[];
  startedAt: number;
  completedAt: number;
  outcome: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILURE';
  constitutionDecision: ConstitutionDecision;
}
```

The `ExecutionTraceStore` maintains a complete, append-only log of all execution traces. This log serves as the primary audit trail.

## Constitution Decisions

Every proposed action is evaluated by the `ConstitutionEngine` before execution. The result of this evaluation is recorded alongside the trace:

```typescript
interface ConstitutionDecision {
  status: 'ALLOWED' | 'REQUIRES_CONFIRMATION' | 'DENIED';
  reason: string;
  ruleId?: string;
  findings: ConstitutionFinding[];
}
```

This means you can answer questions like:
- *"Why was this transaction allowed?"* → Because Rule X evaluated it as ALLOWED.
- *"Why was this action blocked?"* → Because Rule Y flagged it as DENIED with reason Z.

## Observation Quality Metrics

SERA's WorldState doesn't just store values it stores **quality metadata** about every observation:

```typescript
interface ObservationQuality {
  updatedAt: number;     // When was this data last refreshed?
  source: string;        // Where did this data come from?
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  confidence: number;    // 0.0 to 1.0
}
```

This allows downstream consumers to assess whether the data they're acting on is reliable:
- A wallet balance updated 2 seconds ago with `confidence: 1.0` is trustworthy.
- A balance from 10 minutes ago with `confidence: 0.3` should trigger a refresh before any transaction.

## Reflection & Calibration

The `ExecutionReflectionEngine` performs post-execution analysis:

1. **Did the outcome match the prediction?** The `CalibrationEvaluationEngine` compares predicted outcomes with actual results to measure the agent's prediction accuracy.
2. **Was the strategy appropriate?** The `AdaptationPlanner` proposes changes to strategy profiles based on reflection data.
3. **Is the belief system coherent?** The `CoherenceMonitor` detects contradictions.

```
Execution Complete
       │
       ▼
┌──────────────────────┐
│  ReflectionEngine    │  Analyzes outcome vs. prediction
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  CalibrationEngine   │  Measures prediction accuracy
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  AdaptationPlanner   │  Proposes strategy changes
└──────────────────────┘
```

## Governance Outcome Tracking

The `GovernanceOutcomeTracker` monitors the long-term effectiveness of governance decisions:

- Are rules too permissive? (Actions that were ALLOWED but resulted in failures)
- Are rules too restrictive? (Actions that were DENIED but would have succeeded)

This feedback loop allows the system to evolve its constitutional rules over time but **only through explicit governance proposals**, never through autonomous rule changes.

## Cognitive Telemetry

:::caution
Cognitive Telemetry measures the **internal health and evolution** of SERA. It is **not** a measure of user activity, nor a replacement for reasoning. Metrics provide evidence for reflection, not direct control over decisions.
:::

SERA tracks internal cognitive metrics such as:

| Metric | Description |
|--------|-------------|
| Belief Coherence Score | How internally consistent are the agent's beliefs? |
| Calibration Accuracy | How well do predictions match outcomes? |
| Strategy Adaptation Rate | How frequently does the agent adjust its behavior? |
| Rule Effectiveness | Are constitutional rules producing desired outcomes? |

These metrics feed into the Reflection and Adaptation cycle, enabling SERA to improve over time while maintaining strict policy boundaries.
