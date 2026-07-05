# SERA

> “Relationships must become structure before they become meaning.”

SERA is an operating system for an autonomous AI agent.
It is a self-governing cognitive runtime designed to reason, remember, plan, and act with architectural discipline.

## What is SERA

Most AI agents today operate as simple loops:

`Read prompt → Call tools → Repeat`

SERA takes a fundamentally different approach.

Before interacting with the external world, it constructs an internal representation of reality through a structured cognitive system. This system separates memory, reasoning, governance, and execution into distinct layers connected through an event-driven architecture.

The result is not reactive behavior, but structured cognition.

## Core Philosophy

SERA is built on four foundational principles.

### Separation of Mind and Execution
Reasoning is fully isolated from execution. The system evaluates state, uncertainty, and goals without assuming the world is stable or correct. Noise, delay, and failure are treated as inherent conditions.

### Motivation as System Physics
Goals are not independent units. They exist in a shared system where constraints create tension. Motivation emerges from relationships between goals, resources, and execution pathways. This is modeled as structure rather than logic.

### Epistemic Boundaries
Information is not inherently truth. Observations such as messages, events, or external signals are classified and validated before becoming part of the system’s decision-making process.

### Interpretation Without Prescription
The system may analyze and describe structural patterns within its state, but interpretation is never directly converted into action. Reasoning and execution remain explicitly separated.

## Architecture

SERA is composed of decoupled layers connected through a typed event system.

### Memory System
SERA maintains multiple forms of memory:
- **Episodic memory** for experiences
- **Semantic memory** for learned knowledge
- **Procedural memory** for behaviors
- **Relational memory** for entity relationships

Each memory entry is bound to epistemic states such as hypothesis or confirmed truth, ensuring traceable evolution of knowledge.

### Cognitive Kernel
The Cognitive Kernel is the reasoning core of SERA. It models system behavior through Motivation Physics.
- **Awareness** manages goal lifecycle and visibility.
- **Structure** defines relationships between goals.
- **Tension** measures friction across competing objectives.
- **Drift** detects shifts in system focus over time.
- **Interpretation** extracts meaning from structural state.
- **Self Model** maintains a unified temporal representation of the system.

### Reflection and Governance
Reflection operates as a meta-layer that observes system behavior over time. It identifies patterns, evaluates coherence, and proposes structural improvements. It does not directly modify runtime state.

### Capabilities Layer
Capabilities act as interfaces between the cognitive system and the external world.
- The **Dialogue Engine** translates natural language into structured system events.
- The **LLM Adapter** provides a modular interface to language models.
- The **Agentic Wallet** enables controlled on-chain execution under explicit permission boundaries.

### Sensory Server
The Sensory Server is a lightweight communication bridge between the user interface and the cognitive system. It contains no reasoning logic.

`UI (React) → WebSocket → Sensory Layer → Event Bus → Capabilities → Cognitive Kernel`

## Development Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1–6 | Memory, Planner, Reflection, Governance, Adaptation | Completed |
| Phase 7.0–7.5 | Cognitive Kernel and Motivation Physics | Completed |
| Phase 8.0 | World State Synchronization | Completed |
| Phase 8.1 | Agentic Wallet Integration | Completed |
| Phase 8.2 | Identity and Spend Permission System | Completed |
| Phase 9.0 | Frontend Agent Interface | In Progress |
| Phase 9.1 | Capability Layer Expansion | In Progress |
| Phase 10+ | External System Integration | Planned |

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
│   │   ├── cognition/
│   │   ├── goals/
│   │   ├── intents/
│   │   ├── events/
│   │   └── memory, governance, and planning modules
│   ├── runtime/
│   ├── server/
│   └── demos/
├── sera-frontend/
└── .env
```

## Architectural Constraints

The core system must remain domain-agnostic.

The following are **not allowed** inside core or runtime:
- Domain-specific entities such as products, tokens, or users
- Business or financial logic
- Direct external API integrations

The core system only operates on universal primitives such as:
`belief`, `goal`, `observation`, `intent`, `plan`, and `event`.

All domain-specific logic must exist inside isolated capability modules.

## Running Locally

Requirements: Node.js 18 or higher

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

Open:
http://localhost:5173

---

### Closing Statement
*SERA is designed to think before it acts, not react after it receives input.*
