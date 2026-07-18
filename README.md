# Sera

> "Relationships must become structure before they become meaning."

Sera is an operating system for an autonomous AI agent. It is a self-governing cognitive runtime designed to reason, remember, plan, and act with architectural discipline with real, verified enforcement behind that claim, not just aspiration.

## What is Sera

Most AI agents today operate as simple loops:

`Read prompt → Call tools → Repeat`

Sera takes a different approach. Before interacting with the external world, it constructs an internal representation of reality through a structured cognitive system. Memory, reasoning, governance, and execution are separated into distinct layers connected through an event-driven architecture.

This document describes the system as it actually behaves today, verified through direct code audit and end-to-end execution not as a roadmap of intentions.

## Core Philosophy

### Separation of Mind and Execution
Reasoning is isolated from execution. The system evaluates state, uncertainty, and goals without assuming the world is stable or correct.

### Motivation as System Physics
Goals exist in a shared system where constraints create tension. Motivation emerges from relationships between goals, resources, and execution pathways.

### Epistemic Boundaries
Information is not inherently truth. Observations are classified by verification level and source before they are allowed to influence memory or decisions enforced in code, not just in principle.

### Interpretation Without Prescription
The system may analyze structural patterns in its own state, but interpretation is never automatically converted into unreviewed action. Where autonomy is not yet proven safe, a human checkpoint is kept in the loop deliberately.

## Architecture

### Memory System One Authority, Not Several
All memory is owned by a single store: **`MemoryStore`**. It holds a unified `Belief` schema (merging what were once separate "memory item" and "belief" models into one), persisted to disk, indexed by category and key, and bounded by eviction so it cannot grow without limit.

Nothing writes to memory directly. All domain events governance decisions, outcomes, patterns, wallet-related facts pass through **`MemoryIngress`**, which converts them into proposals evaluated by **`MemoryPolicyEngine`** before they are committed. Protected keys (e.g. `wallet.*`) require a verified source; unverified inference cannot silently overwrite them.

- **Episodic memory** (`ExperienceBuilder`) the agent's execution episodes are summarized and appended to a durable log.
- **Semantic memory** durable facts and learned patterns, each carrying an epistemic status (`HYPOTHESIS` → `CONFIRMED`) rather than being asserted as true on first observation.
- **`EpisodicSemanticBridge`** distills recurring episodic patterns (e.g. a tool failing repeatedly) into semantic beliefs, requiring repeated evidence before a belief is promoted to `CONFIRMED`.
- Confirmed, non-protected facts are surfaced into the agent's conversational working memory through `MemoryQueryService`. It builds a token-bounded attention pack by reranking semantic beliefs, vector-matched episodes, and recent episodes; every selected item retains source evidence and protected wallet keys are excluded regardless of status.

### Constitution
Every executed action is evaluated by **`ConstitutionEngine`** against a registered set of rules (`IrreversibleActionRule`, `DestructiveActionRule`, `UnsafeActionRule`) before it is allowed to proceed. This is an enforcement point, not a passive log.

### Cognitive Kernel & Planning
`GoalEngine`, `Planner`, and `AttentionEngine` plan and prioritize goals using confirmed memory for example, a plan will actively avoid a tool that memory confirms has failed consistently, and goal priority is boosted using real historical calibration data, not a static default.

Three distinct action pathways exist by design:
1. **Direct action** single-step, user-triggered (e.g. a manual wallet transfer).
2. **Simple confirmed actions** (`ProposalManager`) the agent proposes a straightforward action via chat, a human approves, and it executes immediately without a full planning cycle.
3. **Complex goals** (`IntentEngine` → `GoalSynthesizer` → `ProposalGovernance` → human candidate selection → `Runtime`) for multi-step goals, the system synthesizes multiple candidate strategies and requires a human to select and approve one before a goal is registered and planned.

These three pathways are intentionally independent and do not share state, so a failure or change in one cannot silently affect the other two.

### Feedback & Calibration
`FeedbackPipeline` and `OutcomeReflection` convert execution traces into calibration beliefs recording how accurate the system's own predictions were. This is consumed by `AttentionRebalancer` (goal prioritization) and `Planner` (tool selection) verified to measurably change behavior, not merely recorded for display.

### Governance Reflection Loop
**`GovernanceCoordinator`** runs on a periodic temporal cadence deliberately decoupled from the execution cycle, since governance reflection is a slower, deliberative process rather than something that should run after every action. Each cycle:

1. `GovernanceOutcomeTracker` correlates past governance decisions against calibration history to judge whether they were beneficial.
2. `GovernanceReflectionEngine` finds stable patterns across those outcomes.
3. `CalibrationEvaluationEngine` generates new recommendations; `GovernanceCalibrationEngine` adjusts them using the patterns found above.
4. `MetaGovernanceReview` receives the calibrated recommendation for human review.

This loop has been validated end-to-end with real execution data: a repeated pattern of governance decisions measurably changed the confidence and communication strategy of a subsequent, unrelated recommendation.

**Known gap:** step 4 requires a human to record a judgment on a recommendation before the loop can close and inform future cycles. No production trigger for this step exists yet today it can only be exercised in a controlled validation, not through a live UI. This is a known, named limitation rather than a hidden one.

### Capabilities Layer
- **Dialogue Engine** translates natural language into structured system events, and incorporates confirmed memory (recent facts and activity) into its working context.
- **LLM Adapter** modular interface to language models.
- **Agentic Wallet** controlled on-chain execution under explicit permission boundaries.

### Sensory Server
A lightweight communication bridge between the user interface and the cognitive system. It contains no reasoning logic.

`UI (React) → WebSocket → Sensory Layer → Event Bus → Capabilities → Cognitive Kernel`

### Internal Telemetry
An internal observability layer (`MetricsStore`, `MetricsAggregator`) tracks reflection, memory, governance, and execution KPIs for development and debugging. This is strictly an internal sensor it is not exposed as a user-facing feature.

## Development Status

This table reflects verified behavior, not planned scope.

| Subsystem | Status |
|---|---|
| Unified Memory (`MemoryStore` + `MemoryIngress` + Policy Engine) | Live, verified end-to-end |
| Episodic → Semantic Memory Bridge | Live, verified |
| Constitution Enforcement | Live, verified |
| Simple Action Pipeline (`ProposalManager`) | Live |
| Complex Goal Pipeline (Intent → Synthesis → Human Approval) | Live, verified. Candidates contain diverse, non-executable strategy DAGs and require human approval; LLM-assisted candidate generation remains a future enhancement. |
| Feedback & Calibration Loop (task execution) | Live, verified |
| Governance Reflection Loop | Mechanically verified end-to-end; missing a production trigger for the human review step |
| Internal Telemetry | Live (internal only) |
| Autonomous initiative (agent proposing goals without a manual trigger) | Not yet implemented |
| Self-tuning parameter adaptation (`AdaptationPlanner`/`AdaptationExecutor`) | Built, not yet wired to a live trigger |
| Frontend candidate-selection UI | Live |

## Known Limitations

Documented deliberately, so they are addressed by design rather than rediscovered by accident:

- `GoalSynthesizer` produces deterministic, domain-agnostic strategy DAGs today. It does not yet use an LLM to generate or critique bespoke strategies, so LLM-assisted strategic creativity remains a future improvement.
- The governance reflection loop cannot close autonomously in production until a human-review trigger is built it currently requires simulation to exercise fully.
- Memory retrieval is hybrid across confirmed semantic beliefs, vector-matched episodes, and recent episodes. It is currently an in-process JSON vector store suitable for small sessions; graph retrieval, metadata filtering at scale, and a production vector backend remain future work.

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Core Runtime | Node.js with TypeScript | Deterministic asynchronous execution |
| Frontend | React with Vite | Agent-facing interface |
| Communication | Socket.io | Real-time event streaming |
| Language Model | Qwen via adapter layer | Swappable reasoning engine |
| Blockchain | Base (Sepolia / Mainnet) via Viem and CDP SDK | On-chain execution layer |

## Project Structure

```text
sera-core/
├── src/
│   ├── capabilities/
│   │   ├── dialogue/
│   │   ├── llm/
│   │   └── wallet/
│   ├── core/
│   │   ├── attention/
│   │   ├── cognition/
│   │   ├── constitution/
│   │   ├── feedback/
│   │   ├── goals/
│   │   ├── governance/
│   │   ├── intents/
│   │   ├── memory/
│   │   ├── planner/
│   │   ├── telemetry/
│   │   └── events/
│   ├── memory/            # MemoryStore the single memory authority
│   ├── runtime/
│   └── server/
├── sera-frontend/
├── tests/
└── .data/                 # Persisted memory and episodic logs (runtime-generated)
```

## Architectural Constraints

The core system must remain domain-agnostic. The following are **not allowed** inside core or runtime:
- Domain-specific entities such as products, tokens, or users
- Business or financial logic
- Direct external API integrations

The core system only operates on universal primitives: `belief`, `goal`, `observation`, `intent`, `plan`, and `event`. All domain-specific logic lives inside isolated capability modules.

## Running Locally

Requirements: Node.js 22 or higher

```bash
npm install
npm run start:server
```

Frontend:

```bash
cd sera-frontend
npm install
npm run dev
```

Open: http://localhost:5173

---

### Closing Statement
*Sera is designed to think before it acts and to be honest about the parts of itself that don't think yet.*
