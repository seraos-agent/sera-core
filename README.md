<div align="center">

# SERA OS

**The Sovereign AI Agent Operating System**  
*Bridging everyday users to autonomous intelligence, Web3 finance, and verifiable privacy without technical friction.*

[![Tests](https://img.shields.io/badge/Tests-135%20passed%20(100%25)-10b981.svg?style=flat-square)](https://github.com/seraos-agent/sera-core)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933.svg?style=flat-square)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-v1.29-8b5cf6.svg?style=flat-square)](https://modelcontextprotocol.io/)
[![Base Network](https://img.shields.io/badge/Network-Base%20(EVM)-0052ff.svg?style=flat-square)](https://base.org)
[![Hyperliquid](https://img.shields.io/badge/DEX-Hyperliquid%20L1-00f0ff.svg?style=flat-square)](https://hyperliquid.xyz)

[Website](https://seraos.xyz) • [App](https://app.seraos.xyz) • [Docs](https://docs.seraos.xyz) • [MCP Server](https://mcp.seraos.xyz)

</div>

---

## Ecosystem

| Platform | Role / Purpose | URL |
|:---|:---|:---|
| **Landing Page** | Official homepage and feature overview | [seraos.xyz](https://seraos.xyz) |
| **Web Dashboard** | User interface for agent chat, vault management, and connectors | [app.seraos.xyz](https://app.seraos.xyz) |
| **Documentation** | Architectural specs, guides, and tool references | [docs.seraos.xyz](https://docs.seraos.xyz) |
| **MCP Server** | Streamable HTTP endpoint for Claude Desktop integration | [mcp.seraos.xyz](https://mcp.seraos.xyz) |

---

## The Vision: Technology Moves Fast. You Shouldn't Be Left Behind.

Artificial Intelligence and decentralized Web3 technologies are evolving at breakneck speed. Yet for 99% of people, adopting these breakthroughs creates overwhelming friction:

- **Complex Jargon & Anxiety**: Gas fees, private keys, slippage, RPC endpoints, and orderbooks make decentralized finance intimidating. One wrong click can lead to catastrophic loss of funds.
- **Privacy Erosion**: Most mainstream AI assistants trap user conversations, preferences, and data inside closed corporate silos.
- **Fragmented Tools**: AI models are isolated inside browser tabs, incapable of taking real-world actions across everyday apps like Google Drive, Meta Threads, or personal messaging.

**SERA OS solves this by acting as your personal, sovereign autonomous co-pilot:**

> **You talk in plain language. SERA handles the underlying infrastructure.**  
> Enjoy the privacy, convenience, and financial freedom of modern tech without needing to understand blockchain code or prompt engineering.

---

## Core Value Pillars

### 1. Privacy & True Data Sovereignty
Your data belongs to you, not an advertising algorithm. SERA exports memory snapshots, profile preferences, and weekly journals directly to your own private **Google Drive (`SERA Vault`)**. If you ever disconnect, your memory stays with you.

### 2. Zero-Jargon Simplicity
Say *"Send 20 USDC to Alex"* or *"Buy 50 dollars of Bitcoin on Hyperliquid"*. SERA sponsors gas fees, resolves network routes, and handles order execution automatically in the background.

### 3. Institutional-Grade Safety (Human-in-the-Loop)
SERA is governed by a hardcoded **`ConstitutionEngine`**. The agent can never perform financial transfers, spot trades, or destructive actions without presenting an interactive, one-click **Approval Card** (`[Approve] / [Reject]`) on your screen.

### 4. Universal Interoperability (MCP & Web2)
Access your agent everywhere: connect it to **Claude Desktop** via the official Model Context Protocol (`mcp.seraos.xyz`), chat while on the go via **Telegram**, publish autonomously to **Meta Threads**, or manage everything through the **Web Dashboard**.

---

## Feature Comparison: Traditional AI vs SERA OS

| Capability | Generic AI Chatbot / Naive ReAct Loop | SERA OS |
|:---|:---|:---|
| **Memory Retention** | Lost after session resets (amnesia) | **Durable Working Memory** + Weekly Google Drive consolidation |
| **Execution Safety** | Prompt-only guidelines (vulnerable to prompt injection) | **Deterministic `ConstitutionEngine`** with mandatory human approval gates |
| **Financial Capability** | Simulated text only / cannot hold or transfer funds | **Native Base Network Vault** (USDC/ETH) + **Hyperliquid Spot DEX** |
| **External Client Support**| Closed web chat only | **Universal MCP Server** (`mcp.seraos.xyz`) for Claude Desktop |
| **Data Ownership** | Trapped on corporate servers | **User-owned `SERA Vault`** in Google Drive with pre-purge 90-day archiving |
| **Outcome Reflection** | Stateless / repeats the same errors | **Self-calibrating reflection loop** that measures prediction accuracy |

---

## Architectural Workflow

```
                   User Instruction (Claude / Telegram / Web UI)
                                         │
                                         ▼
                             ┌───────────────────────┐
                             │    Dialogue Engine    │ ◄─── Contextual Recall from
                             └───────────┬───────────┘      Working Memory & Drive
                                         │
                                         ▼ (Generates Proposal)
                             ┌───────────────────────┐
                             │  ConstitutionEngine   │
                             └───────────┬───────────┘
                                         │
                   Is action irreversible or financially sensitive?
                                  ├── YES ──► Emit Interactive Proposal Card
                                  │           (Pauses execution until user approves)
                                  └── NO  ──► Direct Safe Execution
                                         │
                                         ▼
                             ┌───────────────────────┐
                             │      GoalBridge       │
                             └───────────┬───────────┘
                                         │
        ┌───────────────────┬────────────┴───────┬───────────────────┐
        ▼                   ▼                    ▼                   ▼
  Base Network         Hyperliquid          Google Drive        Meta Threads
 (USDC Transfer)      (Spot Trading)       (Vault Storage)      (Publishing)
        │                   │                    │                   │
        └───────────────────┴────────────┬───────┴───────────────────┘
                                         ▼
                             ┌───────────────────────┐
                             │   Reflection Engine   │
                             │ (Calibration & Error) │
                             └───────────────────────┘
```

---

## Integrated Capabilities

SERA connects its cognitive reasoning loop to an extensible catalog of capability connectors:

### Model Context Protocol (MCP) Server
- **Claude Desktop Integration**: Connect Claude Desktop to SERA via Streamable HTTP at `https://mcp.seraos.xyz`.
- **14 Built-In Tools**: Full suite of agent actions covering chat, memory management, vault transfers, Google Drive CRUD, Threads publishing, and temporal scheduling.
- **6-Digit OTP Pairing**: Connect external clients securely without exposing private keys or long-lived credentials.

### Google Drive (Second Brain)
- **Minimal Sandbox**: Scoped strictly to the user's `SERA Vault` folder via Google's `drive.file` scope.
- **Weekly Memory Consolidation**: Automated Sunday export of agent profile (`SERA_Profile.json`), long-term memory snapshots, and weekly journals.
- **Pre-Purge Retention Archive**: Automatically preserves expiring conversation data before the 90-day hygiene cleanup.
- **Media Bridge**: Directly references Drive image files when publishing to social platforms.

### Web3 & Financial Operations
- **Base Network Agent Vault**: Dedicated on-chain wallet managing USDC and ETH with built-in gas sponsoring.
- **Hyperliquid Spot Trading**: Real-time orderbook pricing (`HL_SPOT_MARKET_DATA`), spot buy/sell execution (`HL_SPOT_ORDER`), resting limit orders, and live portfolio tracking.
- **Proposal Cards**: High-risk financial operations pause execution until verified by human judgment.

### Social & Multi-Channel
- **Meta Threads**: Autonomous and approval-gated publishing with image attachment support.
- **Telegram Bot**: Conversational link to your personal SERA agent on mobile.
- **Inter-Agent Comm (XMT)**: Direct peer-to-peer communication between autonomous agents.

### Media & Intelligence
- **Media Studio**: Text-to-image generation powered by state-of-the-art visual diffusion models.
- **Web Intelligence**: Real-time internet search and synthesis powered by Brave Search API.
- **Background Scheduling**: 24/7 background task scheduler and cron triggers with safety limits.

---

## Project Structure

```text
sera-core/
├── src/
│   ├── capabilities/          # Modular capability connectors
│   │   ├── autonomy/          # Operating agreements & delegation policies
│   │   ├── communication/     # Inter-agent messaging
│   │   ├── dialogue/          # DialogueEngine, system prompts, context builder
│   │   ├── google-drive/      # Google Drive API v3 capability
│   │   ├── hyperliquid/       # Hyperliquid spot market client
│   │   ├── llm/               # Model adapters & dynamic routing
│   │   ├── mcp/               # Model Context Protocol proxy
│   │   ├── media/             # Image generation capability
│   │   ├── search/            # Brave Web Search integration
│   │   ├── threads/           # Meta Threads publishing adapter
│   │   └── wallet/            # Base EVM wallet & gas sponsoring
│   ├── core/                  # Domain-agnostic cognitive kernel
│   │   ├── attention/         # Attention pack reranking & token budgets
│   │   ├── constitution/      # Safety rules & action gates
│   │   ├── feedback/          # Outcome calibration & error analysis
│   │   ├── goals/             # Goal synthesis & DAG resolution
│   │   ├── governance/        # Meta-governance reflection & calibration
│   │   ├── integrations/      # Google Drive OAuth & memory consolidation
│   │   ├── intents/           # Intent taxonomy & extraction
│   │   ├── memory/            # MemoryIngress & policy enforcement
│   │   ├── planner/           # Multi-step action planning
│   │   └── telemetry/         # Internal cognitive telemetry
│   ├── mcp/                   # Standalone SeraMcpServer implementation
│   ├── memory/                # MemoryStore single authority
│   ├── runtime/               # Runtime composition root & lifecycle
│   └── server/                # Socket.IO gateway, Express routes, auth
├── sera-frontend/             # React + Vite web dashboard (app.seraos.xyz)
├── sera-docs/                 # Docusaurus documentation site (docs.seraos.xyz)
├── sera-landing/              # Public landing page (seraos.xyz)
├── tests/                     # 135 unit, integration, and simulation tests (100% pass)
├── cloudbuild.core.yaml       # Production Cloud Build pipeline
└── Dockerfile.core            # Multi-stage production container
```

---

## Technology Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| **Runtime & Core** | Node.js (>= 22.0.0), TypeScript 6, Express 5 | Deterministic async execution |
| **Cognitive Modeling**| Qwen-Plus / Qwen-Max, Model Context Protocol (MCP) SDK | Reasoning, synthesis, and tool protocols |
| **Web3 & Blockchain** | Base Network (Viem, CDP SDK), Hyperliquid L1 API | On-chain asset custody and spot trading |
| **Storage & Memory**  | Supabase (PostgreSQL), SQLite (`better-sqlite3`), Google Drive API v3 | Epistemic memory, credentials, and user vault |
| **Frontend**          | React 19, Vite 8, Reown AppKit, Lucide Icons | Responsive user dashboard |
| **Documentation**     | Docusaurus 3, Prism React Renderer | Technical documentation and guides |
| **Infrastructure**    | Google Cloud Run, Google Cloud Build, Vercel | Scalable serverless deployment |

---

## Developer Quickstart

### Prerequisites
- Node.js 22.0.0 or higher
- npm or pnpm

### 1. Installation

```bash
git clone https://github.com/seraos-agent/sera-core.git
cd sera-core
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Key configuration variables:
- `PORT`: Server port (default `3001` locally, `8080` in production)
- `SERA_AI_API_KEY`: Model provider key (Qwen / DashScope)
- `AGENT_PRIVATE_KEY`: Private key for the Base Network Agent Vault
- `BRAVE_SEARCH_API_KEY`: API key for real-time web search
- `GOOGLE_DRIVE_CLIENT_ID` & `GOOGLE_DRIVE_CLIENT_SECRET`: OAuth credentials for Google Drive
- `THREADS_APP_ID` & `THREADS_APP_SECRET`: Meta Developer App credentials

### 3. Starting the Server

```bash
npm run start:server
```

### 4. Starting the Frontend Dashboard

```bash
cd sera-frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Running the Test Suite

```bash
npx vitest run
```

---

## Programmatic MCP Integration

You can easily connect to SERA from any Node.js application using the official `@modelcontextprotocol/sdk`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const client = new Client(
  { name: "my-custom-app", version: "1.0.0" },
  { capabilities: {} }
);

// Connect via Streamable HTTP / SSE transport
await client.connect(new SSEClientTransport(new URL("https://mcp.seraos.xyz")));

// Query available capabilities
const tools = await client.listTools();
console.log(`Connected to SERA! Available tools: ${tools.tools.length}`);
```

---

## Production Deployment Protocol

In accordance with architectural standards:

- **Backend Runtime (`sera-core`)**:
  1. Build container image: `gcloud builds submit --config cloudbuild.core.yaml .`
  2. Deploy service: `gcloud run deploy sera-core --image asia-southeast1-docker.pkg.dev/sera-core/sera-core-images/sera-core-api:latest --region asia-southeast1 --quiet`
- **Frontend App (`sera-frontend`)**: Deployed to Vercel via `npm --prefix sera-frontend run build && npx vercel --prod --cwd sera-frontend`.
- **Documentation (`sera-docs`)**: Deployed to Vercel via `npm --prefix sera-docs run build && npx vercel --prod --cwd sera-docs`.

---

## Security & Responsible AI

- **Non-Custodial Key Isolation**: Sensitive keys are encrypted in isolated stores and never leaked into conversational contexts.
- **Minimal OAuth Privileges**: Third-party integrations (Google Drive, Threads) request only the minimum required scopes (`drive.file`).
- **Deterministic Action Gating**: AI intent classification is separated from execution. Even if an LLM is prompted maliciously, the `ConstitutionEngine` and `GoalBridge` reject unverified or unapproved actions.

---

## License

Copyright © 2026 SERA OS. All rights reserved.
