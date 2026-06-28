# SERA Core

SERA Core is the runtime foundation of SERA, a learning-centric universal agent.

Unlike traditional software systems that are defined by fixed capabilities, SERA is defined by its ability to learn, adapt, and acquire new capabilities through knowledge, tools, memory, and experience.

SERA Core provides the universal runtime abstractions that allow future capabilities to emerge without coupling the system to any specific domain.

---

# Vision

SERA is designed as a universal agent.

Commerce, finance, smart home, productivity, research, and future domains are not hardcoded modules.

They are capabilities that can be acquired over time.

The architecture is intentionally domain-agnostic.

---

# Core Principles

## World State

SERA maintains an internal understanding of reality.

World State represents what SERA currently believes to be true.

---

## Goals

Goals represent desired outcomes.

Goals drive behavior.

---

## Events

Events represent changes in reality.

Everything that happens in the system becomes an event.

---

## Work Items

Work Items are executable units of work.

They are the bridge between goals and actions.

---

## Memory

Memory stores historical experience and outcomes.

Future learning systems will use memory to improve decision making.

---

## Runtime

The Runtime coordinates execution and state transitions.

Current runtime loop:

Goal
→ Work Item
→ Execute
→ Event
→ World State Update
→ Memory Entry

---

# Architecture

src/

core/

* world-state/
* goals/
* events/
* work-items/

runtime/

memory/

reflection/

delegation/

connectors/

tools/

---

# Current Status

## Phase 1 — Foundation Runtime ✅

Implemented:

* World State
* Goals
* Events
* Work Items
* Runtime
* Memory

Validated through an end-to-end runtime demonstration.

---

## Phase 2 — Planner (Next)

Goal
→ Planner
→ Work Items
→ Runtime

The Planner will be responsible for decomposing goals into executable work items.

---

## Future Phases

Phase 3

* Agent Runtime
* Coordination

Phase 4

* Reflection
* Learning

Phase 5

* Evolution

---

# Technology Direction

## Runtime Layer

TypeScript (Node.js)

Responsible for:

* Runtime orchestration
* State management
* Events
* Work Items
* Connectors
* System execution

---

## Intelligence Layer (Future)

Python

Responsible for:

* Reflection
* Learning
* Research
* Evaluation
* Reasoning
* Knowledge extraction

SERA Core must remain independent from any specific intelligence implementation.

Communication should happen through APIs, queues, or service boundaries.

---

# Architectural Constraints

The following concepts must not be introduced into SERA Core:

* Product
* Order
* Customer
* Store
* Seller
* Buyer
* Marketplace
* Commerce-specific abstractions

SERA Core only contains universal agent abstractions.

Domain-specific capabilities belong in higher layers, not in the core runtime.

---

# Repository Purpose

This repository contains the foundational runtime architecture of SERA.

It is the base upon which future intelligence, learning systems, and domain capabilities will be built.
