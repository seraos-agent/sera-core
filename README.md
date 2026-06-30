# SERA Core (Synthesizing & Evolving Rational Agent)

SERA Core is the runtime foundation of a learning-centric, universal autonomous agent. 

### What is SERA? (In Simple Terms)
Most AI agents today are just LLMs wrapped in a loop (e.g., "Read prompt -> Call Tool -> Repeat"). **SERA is different.** 
SERA is an entire **Operating System for an AI**. Just like humans have a subconscious mind that manages memory, handles conflicting desires, and feels "stress", SERA has a **Cognitive Kernel**. 

Before SERA ever takes a physical action (like trading crypto or sending a Slack message), it processes its world through a structured mind:
- It maintains long-term, immutable **Memories**.
- It maps out its **Goals** and detects if they are in conflict (Tension).
- It strictly separates **Facts** (e.g., an on-chain blockchain transaction) from **Claims** (e.g., a user saying "I sent you money" on Telegram).

This repository contains the raw "Brain" (Phases 1-7). We are currently building the "Body and Senses" (Phase 8+).

---

## The SERA Philosophy

The architecture of SERA is governed by several unyielding philosophical tenets:

1. **Separation of Mind and Body**: The Cognitive Kernel (Phase 1-7) evaluates state, tension, and goals in absolute isolation from execution. The Execution Ecosystem (Phase 8+) acts upon the world. The mind does not assume the world is perfect; it expects noise, failures, and asynchrony.
2. **Motivation Physics**: Goals do not conflict because of semantic labels. They conflict because of pressure on shared resources, attention, and execution pathways. SERA models motivation as a physical topology (Graph, Tension, Drift) rather than abstract logic.
3. **Epistemic Boundaries**: An unverified claim (e.g., a Telegram message) is not a fact. SERA strictly separates `Factual Observations` (Ground Truth) from `Social Signals` (Claims), preventing epistemic contamination.
4. **Interpretation Is Not Recommendation**: The system may describe systemic issues (e.g., "Tension is concentrated here"), but the interpretative layer is forbidden from prescribing causal actions.

---

## Architectural Layers

SERA is built in distinct, decoupled layers:

### 1. The Memory System
A multi-modal storage layer (`EPISODIC`, `SEMANTIC`, `PROCEDURAL`, `RELATIONAL`) bounded by epistemic statuses (`HYPOTHESIS`, `CONFIRMED`). Memory is the absolute source of truth for the agent's historical state.

### 2. Reflection & Governance
A higher-order thinking system that observes the agent's actions, identifies systemic patterns, proposes adaptations, and enforces governance without directly mutating runtime state.

### 3. Cognitive Kernel (Motivation Physics)
The heart of SERA's intent, comprised of five foundational engines:
- **Awareness (Phase 7.0)**: Individual goal profiles and lifecycle tracking.
- **Structure (Phase 7.1)**: Goal Relationship Graphs mapping the topology of intent.
- **Tension (Phase 7.2)**: Measuring operational friction and pressure between goals.
- **Drift (Phase 7.3)**: Detecting temporal shifts in systemic focus and structure.
- **Interpretation (Phase 7.4)**: Extracting semantic meaning from physical structures (Centralization, Fragmentation).
- **Self-Model (Phase 7.5)**: A unified, temporal snapshot of the system's cognitive state ("The Mirror").

### 4. World Perception & Execution (The Body) - *In Progress*
A robust sensory framework designed to handle the chaos of the real world:
- `WorldState` Synchronization
- `Observation` Pipelines with strict Epistemic Weights
- Connector Registries (Blockchain, Browser, Communication)
- Priority Queues and Idempotent Mutation Pipelines

---

## Development Status

| Phase | Description | Status |
|---|---|---|
| **Phase 1-6** | Memory, Planner, Reflection, Governance, Adaptation | ✅ **FROZEN** |
| **Phase 7.0-7.5**| Cognitive Kernel (Motivation Physics & Meaning Layer) | ✅ **FROZEN** |
| **Phase 8.0+** | World Perception Architecture & Capability Registry | 🚧 **ACTIVE** |
| **Phase 9.0+** | Distributed Agency & Collective Intelligence | ⏳ Queued |

Currently, the Cognitive Kernel is officially closed. Development is pivoting to **Phase 8 (World Perception Architecture)** to build the sensory and execution ecosystem required to connect SERA's mature mind to the physical world.

---

## Technology Stack

- **Runtime Layer**: TypeScript (Node.js). Responsible for orchestration, memory operations, structural modeling, and sensory pipelines.
- **Intelligence Layer (Future)**: Python. Responsible for deep LLM reasoning, semantic extraction, and reinforcement learning.

SERA Core strictly communicates across language boundaries via structured APIs or queues.

---

## Strict Architectural Constraints

The following concepts **MUST NOT** be introduced into SERA Core:
- Domain-specific entities (`Product`, `Order`, `Customer`, `Store`, `Token`, `Blockchain`)
- E-commerce or Financial-specific abstractions

SERA Core contains only universal agent primitives (`Belief`, `Goal`, `Observation`, `Tension`). Domain-specific capabilities belong in higher layers (e.g., `Capabilities` or `Connectors`), never in the core runtime.

---

*SERA — Relationships must become structure before they become meaning.*
