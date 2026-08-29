---
sidebar_position: 1
---

# Introduction to SERA OS

Welcome to the **SERA OS** documentation.

SERA (Systematic Execution & Reasoning Agent) is a universal AI agent engine designed to be **secure**, **autonomous**, and **verifiable**. Unlike standard text-generation chatbots, SERA evaluates real-world state, formulates actionable plans, and securely executes workflows on behalf of the user — all while maintaining strict constitutional guardrails.

## Why SERA?

Modern AI assistants can generate text, but they cannot *act* in the real world. SERA bridges this gap by combining:

- **Cognitive reasoning** with **real execution capabilities** (wallet transactions, market data, communications).
- **Policy-enforced autonomy** that prevents rogue agent behavior.
- **Verifiable execution traces** so every action the agent takes can be audited.

## Architecture Overview

SERA OS is organized into layered components, each with a clear responsibility:

```
┌─────────────────────────────────────────┐
│              Server Layer               │
│   (Socket.IO, HTTP, CLI Adapters)       │
├─────────────────────────────────────────┤
│              Runtime Layer              │
│   Runtime · GoalBridge · Coordinators   │
├─────────────────────────────────────────┤
│              Core Engine                │
│   WorldState · Planner · DialogueEngine │
│   IntentEngine · ConstitutionEngine     │
│   GoalEngine · Reflection · Telemetry  │
├─────────────────────────────────────────┤
│           Capabilities Layer            │
│   Wallet · Hyperliquid                   │
│   Communication · Google Drive · MCP    │
└─────────────────────────────────────────┘
```

### Key Principle: Runtime is the Composition Root

The `Runtime` class (`src/runtime/Runtime.ts`) is the single place where all engines are instantiated and wired together. The server layer (`src/server/index.ts`) is only a boundary adapter it does not own any business logic.

```typescript
// Runtime.ts — The Composition Root
export class Runtime {
  public worldStateService!: WorldStateService;
  public dialogueEngine!: DialogueEngine;
  public proposalManager!: ProposalManager;
  // ... all engines are properties of Runtime
}
```

### Key Principle: WorldState Owns Reality

The `WorldStateService` is the **single source of truth** for the entire environment. Cognitive components (Dialogue, Planner, Reflection) only *query* reality they never own it or cache it independently.

```typescript
// WorldState receives reality through events, not direct queries
eventBus.on(EventTypes.DOMAIN_WALLET_STATE, (event) => {
  this.state.wallet = {
    address: event.payload.address,
    balance: parseFloat(event.payload.balance),
    quality: {
      updatedAt: Date.now(),
      source: 'EventBus/DOMAIN_WALLET_STATE',
      freshness: 'FRESH',
      confidence: 1.0
    }
  };
});
```

## Core Pillars

| Pillar | Description | Learn More |
|--------|-------------|------------|
| **Agent Engine** | The cognitive core: reasoning, planning, and execution orchestration. | [Agent Engine →](./engine) |
| **MPC Wallet** | Secure on-chain execution via custody providers and spend permission guards. | [MPC Wallet →](./mpc) |
| **Action Workflows** | Standardized templates for multi-step task execution. | [Workflows →](./workflows) |
| **Verifiable Compute** | Cryptographic proof that agents executed the intended logic. | [Verifiable Compute →](./compute) |

## Quick Start

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/seraos-agent/sera-core.git
   cd sera-core
   npm install
   ```

2. Start the core server:
   ```bash
   npm run start:server
   ```

3. Start the SERA Reception (user interface):
   ```bash
   npm run start:reception
   ```

4. Open your browser to `http://localhost:3002` and start interacting with SERA.
