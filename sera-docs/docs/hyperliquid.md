---
sidebar_position: 4
---

# Hyperliquid Spot Trading Engine

The **Hyperliquid Spot Trading Engine** is SERA OS's dedicated on-chain trading execution layer. It bridges everyday Web2 users with the high-performance decentralized orderbook (CLOB) on Hyperliquid Layer 1, enabling conversational asset purchases, limit orders, real-time market data analysis, and portfolio tracking with zero blockchain complexity.

---

## Web2 to Web3 Onboarding Philosophy

A core pillar of SERA OS is **Total Web3 Abstraction**. Mainstream users and Web2 natives should never be forced to navigate blockchain friction, wallet seed phrases, RPC configurations, gas estimations, bridge protocols, or decentralized exchange mechanics.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            The User Experience                              │
│  "Buy 15 USDC of HYPE"   •   "What's Bitcoin at?"   •   "Show my Portfolio" │
│  (Zero blockchain jargon, no seed phrases, no gas tokens, instant execution)│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SERA OS Agent Layer                              │
│       • Dialogue & Intent Reasoning          • EIP-712 Agent Key Signing    │
│       • Human-in-the-Loop Proposal Cards     • Real-Time Portfolio Ledger   │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │                             │
        ┌───────────────▼───────────────┐     ┌───────▼───────────────────────┐
        │     Base Network (Layer 2)    │     │      Hyperliquid Layer 1      │
        │   User Account Infrastructure │     │    High-Speed Trading Engine  │
        │ • Primary operational wallet  │     │ • 20,000 TPS on-chain CLOB    │
        │ • USDC custody & P2P transfers│     │ • Sub-second matching engine  │
        │ • Seamless fiat on/off ramps  │     │ • Zero gas fees per trade     │
        └───────────────────────────────┘     └───────────────────────────────┘
```

### 1. Base Network as the "User Home"
- **Account Infrastructure:** The user's primary balance resides on Base in USDC. This provides low-cost P2P transfers, simple balance tracking, and easy onramping from traditional banking.
- **Single Currency Simplicity:** Users only need to think in terms of USD/USDC. They never have to buy or hold native gas tokens (like ETH or HYPE) just to interact.

### 2. Hyperliquid as the "Trading Engine"
- **Institutional-Grade Orderbook:** When trading, SERA routes orders to Hyperliquid's Central Limit Order Book (CLOB). Unlike traditional AMM DEX pools that suffer from high slippage and frontrunning, Hyperliquid provides deep liquidity and instant order matching.
- **Zero Gas Trading:** Placing, updating, and cancelling limit orders on Hyperliquid incurs **zero gas fees**, allowing SERA to execute high-precision strategies without draining user funds on network fees.

### 3. Transparent Liquidity Coordination
- When a user asks to purchase a token, SERA inspects the user's balances, verifies available liquidity, calculates transparent service fees, and signs the order using a dedicated **non-withdrawal Agent Key**.
- The user is shielded from technical terminology: SERA communicates with clear, human financial concepts (*"Price"*, *"Total Bought"*, *"Portfolio Value"*).

---

## Architecture Overview

SERA abstracts away orderbook mechanics, slippage calculations, EIP-712 cryptographic signatures, and cross-chain liquidity movement behind an intuitive conversational interface:

```
┌────────────────────────────────────────────────────────┐
│               Natural Language User Chat               │
│          "Buy 15 USDC of HYPE" | "Check ETH Price"      │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    DialogueEngine                      │
│        Intent Classification & Pre-Proposal Validation │
└───────────────────────────┬────────────────────────────┘
                            │ (SPAWN_GOAL Event)
┌───────────────────────────▼────────────────────────────┐
│                      GoalBridge                        │
│                 Runtime Execution Router               │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
┌─────────────▼───────────────┐ ┌─────────▼──────────────┐
│  HyperliquidSpotCapability  │ │   AutoBridgeService    │
│  • Quoting & Fee Engine     │ │   • Base USDC Balance  │
│  • Order State Lifecycle    │ │   • Liquidity Sync     │
│  • Portfolio Aggregation    │ └────────────────────────┘
└─────────────┬───────────────┘
              │
┌─────────────▼──────────────────────────────────────────┐
│                  HyperliquidClient                     │
│  • Info API (Public Market Data, Orderbooks, State)    │
│  • Exchange API (EIP-712 Cryptographic Agent Signing)  │
└─────────────────────────────┬──────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────┐
│              Hyperliquid Layer 1 (CLOB)                │
│     20,000 TPS • Sub-second Matching • Zero Gas Fee    │
└────────────────────────────────────────────────────────┘
```

---

## Core Components

The Hyperliquid integration is modularized under `src/capabilities/hyperliquid/`:

### 1. `HyperliquidClient`
Low-level typed adapter interfacing directly with Hyperliquid's official endpoints:
- **Info Endpoints (Read-only, no authentication):** Queries `spotMeta`, `allMids`, `spotClearinghouseState`, and `openOrders`.
- **Exchange Endpoints (EIP-712 authenticated):** Submits signed actions (`order`, `cancel`) using a dedicated agent key.
- **Environment Auto-Switching:** Supports testnet (`api.hyperliquid-testnet.xyz`) and production mainnet (`api.hyperliquid.xyz`).

### 2. `HyperliquidTokenRegistry`
Dynamic token discovery and caching engine:
- Ingests `spotMeta` on startup and dynamically maps token symbols, canonical pairs, tick sizes, and lot-size decimal precisions (`szDecimals`, `weiDecimals`).
- Maps human symbols (`HYPE`, `PURR`, `ETH`, `BTC`, `SOL`) to Hyperliquid's internal asset index formula (`10000 + pair_index`).
- Features a self-invalidating 5-minute TTL cache to ensure real-time awareness of new token listings.

### 3. `HyperliquidSpotCapability`
The high-level domain engine that powers SERA's financial reasoning:
- **Order Execution:** Validates notional size (minimum $10 USDC), calculates slippage bounds, routes market orders (Immediate-or-Cancel / `Ioc`) or limit orders (Good-til-Cancelled / `Gtc`).
- **Fee Integration:** Computes transparent protocol take rates using `GasAbstractionService`.
- **Portfolio Aggregation:** Pulls active balances across all spot assets and computes real-time USD valuation.

### 4. `AutoBridgeService`
Liquidity coordinator between SERA's primary Base Network USDC custody and the Hyperliquid Layer 1 clearinghouse:
- Inspects available USDC on Hyperliquid before trade submission.
- Handles automated bridging notifications and liquidity rebalancing.

---

## AI Capability Catalog (Tool Definitions)

SERA exposes 5 specialized native tools to the LLM orchestrator:

| Tool Identifier | Description | Permission Level |
| :--- | :--- | :--- |
| `HL_SPOT_MARKET_DATA` | Fetches real-time mid price, best bid/ask spread, 24h trading volume, and 24h percentage change directly from the live orderbook. | **Autonomous (Read)** |
| `HL_SPOT_ORDER` | Formulates and places spot market or limit orders on Hyperliquid. | **Human-in-the-Loop (Requires Approval)** |
| `HL_SPOT_CANCEL` | Cancels resting limit orders by token symbol and order ID. | **Human-in-the-Loop (Requires Approval)** |
| `HL_SPOT_PORTFOLIO` | Aggregates all user-owned token balances with current USD values. | **Autonomous (Read)** |
| `HL_SPOT_OPEN_ORDERS` | Retrieves active resting orders waiting for execution on the book. | **Autonomous (Read)** |

---

## Non-Custodial Agent Security Model

SERA is engineered with institutional-grade security boundaries:

```
┌────────────────────────────────────────────────────────┐
│                   Master User Account                  │
│       Owns funds • Exclusive withdrawal authority      │
└───────────────────────────┬────────────────────────────┘
                            │ Authorizes (Approve Agent)
┌───────────────────────────▼────────────────────────────┐
│               SERA Agent API Wallet (Key)              │
│       • Can Place Orders                               │
│       • Can Cancel Orders                              │
│       ❌ WITHDRAWALS ARE CRYPTOGRAPHICALLY IMPOSSIBLE  │
└────────────────────────────────────────────────────────┘
```

1. **Restricted Agent Delegation:**
   SERA uses an authorized **Agent Key** (via Hyperliquid's `approveAgent` mechanism). This ephemeral key can only place and cancel trades; it is cryptographically prohibited by the Hyperliquid L1 consensus from executing withdrawals or transfers.
2. **Human-in-the-Loop Proposal Cards:**
   Every financial state transition requires explicit user consent. When a user requests a purchase or sale, SERA compiles a detailed proposal card:
   - Asset & Target Amount
   - Real-time Market Quote
   - Fee Breakdown (0.20% Volume Take Rate + Gas Surcharge)
   - Slippage Tolerance
   Execution only proceeds when the user clicks **Approve**.

---

## Example Interactions

### 1. Real-Time Price Discovery
> **User:** *"What is the current price of HYPE?"*  
> **SERA:**  
> **HYPE (Hyperliquid):**  
> • **Price:** $22.45 USDC  
> • **24h Change:** 📈 +3.25%  
> • **24h Volume:** $18,420,150  

### 2. Spot Market Purchase
> **User:** *"Buy 15 USDC worth of HYPE"*  
> **SERA:** *(Presents Proposal Card)*  
> • **Action:** Buy ~0.668 HYPE  
> • **Execution:** Hyperliquid Spot Market  
> • **Estimated Fill:** $22.45 / HYPE  
> • **Service Fee:** $0.08 USDC  
> *[ Approve ] [ Reject ]*  
> 
> *(User approves)*  
> **SERA:** *"✅ Purchased ~0.668 HYPE for $15.00. Fee: $0.08."*

### 3. Portfolio Tracking
> **User:** *"Show my crypto portfolio"*  
> **SERA:**  
> 💼 **Your Portfolio:**  
> • **USDC:** 85.00 ($85.00)  
> • **HYPE:** 1.40 ($31.43)  
> • **PURR:** 50.00 ($12.50)  
> 
> **Total Value:** **$128.93**

---

## Developer Configuration

To configure Hyperliquid spot trading in your SERA Core runtime, provide the following environment variables:

```env
# Hyperliquid Environment Settings
HYPERLIQUID_MAINNET="true"                      # "true" for production, "false" for testnet
HYPERLIQUID_MASTER_ADDRESS="0x..."             # Master EVM account address
HYPERLIQUID_AGENT_PRIVATE_KEY="0x..."          # Authorized Agent private key
HYPERLIQUID_AGENT_ADDRESS="0x..."              # Authorized Agent public address
HL_MIN_ORDER_USDC="10.0"                       # Minimum notional order size (protocol minimum: $10)
```
