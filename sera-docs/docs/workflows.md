---
sidebar_position: 4
---

# Action Workflows

Action Workflows are the execution backbone of SERA OS. Instead of relying on the LLM to write low-level code on the fly, SERA uses **structured workflow definitions** to ensure safety, determinism, and auditability.

## How Workflows Work

Every user request follows a structured pipeline from natural language to real execution:

```
"Send 10 USDC to 0xABC..."
        │
        ▼
┌─────────────────┐
│  DialogueEngine  │  Classifies intent
└─────────────────┘
        │
        ▼
┌─────────────────┐
│   IntentEngine   │  Creates structured Intent
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  GoalSynthesizer │  Converts Intent → Goal
└─────────────────┘
        │
        ▼
┌─────────────────┐
│     Planner      │  Generates PlanSteps
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ ConstitutionEngine│  Policy validation
└─────────────────┘
        │
        ▼
┌─────────────────┐
│   GoalBridge     │  Real-world execution
└─────────────────┘
        │
        ▼
    GOAL_RESULT event
```

## Plan Structure

The `Planner` generates a `Plan` composed of sequential `PlanStep` objects:

```typescript
interface PlanStep {
  id: string;            // e.g., "step-1"
  description: string;   // Human-readable description
  action: string;        // Tool name: CHECK_WALLET_BALANCE, TRANSFER_FUNDS, etc.
  payload: object;       // Parameters for the tool
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

interface Plan {
  goalId: string;
  steps: PlanStep[];
  strategy: StrategyProfile;
}
```

## Available Actions

SERA currently supports these built-in workflow actions:

| Action | Description | Capability |
|--------|-------------|------------|
| `CHECK_WALLET_BALANCE` | Query wallet balance on any supported chain | Wallet |
| `TRANSFER_FUNDS` | Send tokens to a destination address | Wallet |
| `EVALUATE_CONDITION` | Evaluate a logical condition against WorldState | Core |
| `EXECUTE_UI_COMMAND` | Trigger a frontend UI action | Communication |
| `MARKET_DATA_QUERY` | Fetch market data from Hyperliquid | Hyperliquid |
| `PAPER_TRADE` | Execute simulated trades | Paper Trading |
| `POLYMARKET_QUERY` | Query prediction market data | Polymarket |

## LLM-Powered Dynamic Planning

When a goal cannot be mapped to a single action, the Planner delegates to the LLM to generate a multi-step plan:

```typescript
const prompt = `Generate a JSON array of execution steps for: "${goal.description}".
Available tools: CHECK_WALLET_BALANCE, TRANSFER_FUNDS, EVALUATE_CONDITION.
Each step must have: id, description, action, payload, status.

CRITICAL: For TRANSFER_FUNDS, "payload.amount" MUST be exactly "all" 
or a strict number. DO NOT output "all_available_funds".`;
```

The LLM generates the plan, but execution is still governed by the `ConstitutionEngine` the LLM cannot bypass spend limits or policy rules.

## Experience-Informed Planning

The Planner consults Working Memory before generating plans. If a tool has failed consistently in the past, the Planner uses an alternative:

```typescript
const toolFailureBeliefs = semanticBeliefs.filter((b) => 
  b.epistemicStatus === 'CONFIRMED' && 
  b.content.includes(intendedTool) && 
  b.content.includes('failed consistently')
);

if (toolFailureBeliefs.length > 0) {
  console.log(`Warning: Tool '${intendedTool}' fails consistently. Falling back.`);
  intendedTool = 'mock-read-tool';
}
```

This means SERA **learns from its own failures** and avoids repeating mistakes.

## Execution Traces

Every workflow execution produces an `ExecutionTrace` — a complete audit log of what happened:

```typescript
interface ExecutionTrace {
  goalId: string;
  steps: ExecutionStepResult[];
  startedAt: number;
  completedAt: number;
  outcome: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILURE';
}
```

These traces are stored in the `ExecutionTraceStore` and can be reviewed by the `ReflectionEngine` for post-execution analysis.
