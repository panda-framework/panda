# PANDA Repository Scaffold

The repository began from `PANDA_Initial_Scaffolding_Specification.docx`. The
original session and seven-state demonstration were transitional scaffolding;
Phase 10 removed them after the canonical v0.1 application path was complete.
This document records the scaffold that exists now.

## Implemented

- pnpm workspace with `apps/*`, `packages/*`, and `examples/*`.
- Strict TypeScript build and typecheck pipeline.
- Five canonical capabilities: Perception, Analysis, Network, Decision, and
  Action.
- Execution-scoped Goal and Execution stores with append-only causal traces.
- Dynamic, capability-selected coordination with transition and effect policy.
- Deterministic v0.1 capabilities for the bounded filesystem acceptance case.
- Responsibility-specific filesystem Action connector and independent effect
  observer.
- Fastify daemon with canonical execution HTTP endpoints and a WebSocket trace
  stream at `/events`.
- Typed SDK for health, execution create/list/detail, and trace reads.
- React/Vite/Tailwind dashboard for creating and inspecting executions, Goals,
  record-derived answers, and causal timelines.
- Commander-based CLI for initialization, local processes, health, and version.
- Executable shared, core, SDK, daemon, and dashboard-helper tests.

Memory is represented as persistence supporting the capabilities. Planning,
understanding, and reflection may be techniques inside Analysis or Decision;
they are not capability or global runtime-state identities.

## Local service direction

The daemon is a long-lived local Node.js process. Its current stores are
in-memory and all executions and traces are lost on restart. A future durable
adapter can replace those stores without changing the canonical execution
contracts.

The daemon is unauthenticated and intended only for a loopback development
environment. The sole v0.1 real effect writes UTF-8 content to a relative path
inside a per-execution sandbox after policy authorization.

## Deferred

- Durable persistence and restart recovery
- Authentication and production network exposure
- General planning, durable retries, and automatic wait resumption
- LLM or model-provider integration
- Additional Action connectors and real Network transports
- Plugin marketplace and MCP support
- Docker or cloud deployment and synchronization
- Multiple agents, vector memory, and mobile applications
