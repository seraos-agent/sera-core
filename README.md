# SERA — Synthesizing & Evolving Rational Agent

> *"Relationships must become structure before they become meaning."*

SERA is not an AI chatbot. SERA is an **Operating System for an AI** — a self-governing cognitive runtime that reasons, remembers, plans, and acts with architectural discipline.

---

## What is SERA?

Most AI agents today are just LLMs wrapped in a loop:

```
Read Prompt → Call Tool → Repeat
```

SERA is fundamentally different. Before taking any action in the world, SERA processes its reality through a structured **Cognitive Kernel** — a layered mind that manages memory, detects goal conflicts, enforces governance, and separates verified facts from unverified claims.

Think of it as the difference between a **reflex** and **deliberate thought**.

---

## Core Philosophy

SERA's architecture is governed by four unyielding principles:

**1. Separation of Mind and Body**
The Cognitive Kernel evaluates state, tension, and goals in complete isolation from execution. The mind never assumes the world is perfect — it anticipates noise, failures, and asynchrony.

**2. Motivation Physics**
Goals do not conflict because of labels. They conflict because of pressure on shared resources, attention, and execution pathways. SERA models motivation as a physical topology (Graph, Tension, Drift) — not abstract logic.

**3. Epistemic Boundaries**
An unverified claim (e.g., a Telegram message saying "I sent you money") is not a fact. SERA strictly separates `Factual Observations` from `Social Signals`, preventing epistemic contamination of its decision-making.

**4. Interpretation Is Not Prescription**
The system may describe systemic patterns (e.g., "Tension is concentrated at this goal cluster"), but the interpretive layer is constitutionally forbidden from prescribing causal actions.

---

## Architecture

SERA is built in distinct, decoupled layers that communicate via a typed Event Bus.

### Layer 1 — Memory System
Multi-modal storage (`EPISODIC`, `SEMANTIC`, `PROCEDURAL`, `RELATIONAL`) bounded by epistemic statuses (`HYPOTHESIS` → `CONFIRMED`). Memory is the agent's absolute source of historical truth.

### Layer 2 — Cognitive Kernel (Motivation Physics)
The reasoning heart of SERA, comprising five foundational engines:

| Engine | Phase | Role |
|--------|-------|------|
| **Awareness** | 7.0 | Individual goal profiles and lifecycle tracking |
| **Structure** | 7.1 | Goal Relationship Graphs — topology of intent |
| **Tension** | 7.2 | Measuring operational friction between goals |
| **Drift** | 7.3 | Detecting temporal shifts in systemic focus |
| **Interpretation** | 7.4 | Extracting semantic meaning from physical structures |
| **Self-Model** | 7.5 | Unified temporal snapshot of cognitive state ("The Mirror") |

### Layer 3 — Reflection & Governance
A higher-order thinking system that observes the agent's actions, identifies systemic patterns, proposes adaptations, and enforces governance — without directly mutating runtime state.

### Layer 4 — Capabilities (The Senses & Hands)
Modular connectors that give SERA the ability to perceive and act in the real world:

| Capability | Role |
|------------|------|
| `dialogue/DialogueEngine` | Natural language interface — processes user intent, emits SERA Events |
| `llm/QwenAdapter` | LLM Connector — isolated API bridge to Qwen (swappable) |
| `wallet/AgenticWallet` | On-chain execution with Spend Permission guardrails |

### Layer 5 — Sensory Server (The Skin)
A lightweight Socket.io server that acts purely as a **translation bridge** between external UIs and the internal SERA Event Bus. No cognitive logic lives here.

```
UI (React) ←— WebSocket —→ Server (Sensory) ←— Event Bus —→ Capabilities ←→ Cognitive Kernel
```

---

## Development Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1–6 | Memory, Planner, Reflection, Governance, Adaptation | ✅ Frozen |
| Phase 7.0–7.5 | Cognitive Kernel — Motivation Physics & Meaning Layer | ✅ Frozen |
| Phase 8.0 | WorldState Synchronization & Atomic Persistence | ✅ Done |
| Phase 8.1 | Real Agentic Wallet (CDP v2 Integration) | ✅ Done |
| Phase 8.2 | Owner Identity & On-Chain Spend Permission Guard | ✅ Done |
| Phase 9.0 | Frontend UI — Chat-first Agentic Interface | 🚧 Active |
| Phase 9.1 | Modular Capability Layer — LLM & Dialogue Engine | 🚧 Active |
| Phase 10+ | Full Runtime Integration & Real-world Connectors | ⏳ Queued |

---

## Technology Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| **Core Runtime** | TypeScript / Node.js | Type safety, async-native, unified codebase |
| **Frontend** | React + Vite (TypeScript) | Fast, component-based, connects via Socket.io |
| **Real-time Transport** | Socket.io (WebSocket) | Bidirectional streaming between UI and Core |
| **LLM** | Qwen Plus (DashScope) | Swappable via `QwenAdapter` — not hardwired |
| **Blockchain** | Base Sepolia / Base Mainnet via Viem + CDP SDK | Production-grade on-chain execution |

---

## Project Structure

```
sera-core/
├── src/
│   ├── capabilities/          # External connectors (LLM, Wallet, Dialogue)
│   │   ├── dialogue/          # DialogueEngine — user intent processing
│   │   ├── llm/               # QwenAdapter — LLM API connector
│   │   └── wallet/            # Agentic Wallet & Spend Permission
│   ├── core/                  # The Cognitive Kernel
│   │   ├── cognition/         # Meta-evaluation, Coherence, Adaptation
│   │   ├── goals/             # Goal Engine & lifecycle
│   │   ├── intents/           # Intent Engine & Proposal Pipeline
│   │   ├── events/            # Shared Event Bus types
│   │   └── ...                # Memory, Planner, Reflection, Governance
│   ├── runtime/               # Runtime orchestration (Runtime.ts)
│   ├── server/                # Sensory Layer — Socket.io bridge (no logic)
│   └── demos/                 # Phase demonstration scripts
├── sera-frontend/             # React UI — chat-first interface
└── .env                       # API keys & environment config
```

---

## Strict Architectural Constraints

The following **must never** be introduced into `src/core/` or `src/runtime/`:

- Domain-specific entities (`Product`, `Order`, `Token`, `Blockchain`, `User`)
- Business logic or financial abstractions
- Direct LLM calls or external API dependencies

`src/core/` contains only universal agent primitives: `Belief`, `Goal`, `Observation`, `Tension`, `Intent`, `Plan`. All domain-specific functionality belongs in `src/capabilities/` as isolated connectors.

---

## Running Locally

**Prerequisites:** Node.js 18+, a `.env` file with your keys.

```bash
# 1. Install backend dependencies
npm install

# 2. Start the SERA Core Server (port 3001)
npm run start:server

# 3. In a separate terminal — start the Frontend (port 5173)
cd sera-frontend
npm install
npm run dev
```

Open `http://localhost:5173` and start talking to SERA.

---

*Built with discipline. Designed to think before it acts.*
