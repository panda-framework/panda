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
- Versioned file-backed local state with restart validation and explicit safe
  termination of interrupted active work; optional in-memory mode remains.
- Dynamic, capability-selected coordination with transition and effect policy.
- Deterministic v0.1 capabilities for the bounded filesystem acceptance case.
- Responsibility-specific filesystem Action connector and independent effect
  observer.
- Fastify daemon with canonical execution HTTP endpoints and a WebSocket trace
  stream at `/events`.
- Optional static bearer authentication that binds API work to one service
  principal, exact CORS origin controls, and a non-loopback exposure guard.
- Typed SDK for health, execution create/list/detail, and trace reads.
- React/Vite/Tailwind dashboard for creating and inspecting executions, Goals,
  record-derived answers, and causal timelines.
- Commander-based CLI for initialization, local processes, health, and version.
- Executable shared, core, SDK, daemon, and dashboard-helper tests.

Memory is represented as persistence supporting the capabilities. Planning,
understanding, and reflection may be techniques inside Analysis or Decision;
they are not capability or global runtime-state identities.

## Local service direction

The daemon is a long-lived local Node.js process. Its default adapters retain
Goals, Executions, and traces as versioned atomic JSON snapshots below
`.panda/state`. Terminal and waiting work survives restart. Active work whose
Goal is already terminal is finalized; other active work is failed explicitly.
Neither path replays Action. The in-memory adapters remain available for
intentionally ephemeral operation, and a database or broker can replace either
adapter without changing canonical contracts.

The daemon defaults to unauthenticated loopback development as the explicit
`panda-local` principal. Static bearer mode protects execution and WebSocket
resources and binds new Goals and effects to one configured service principal.
The process refuses unauthenticated non-loopback exposure. The sole real effect
writes UTF-8 content to a relative path inside a per-execution sandbox after
principal-aware policy authorization.

## Deferred

- Production databases, backups, multi-writer persistence, and exactly-once
  effect recovery
- Multi-principal authorization, credential lifecycle, TLS, and production
  network hardening
- General planning, durable retries, and automatic wait resumption
- LLM or model-provider integration
- Additional Action connectors and real Network transports
- Plugin marketplace and MCP support
- Docker or cloud deployment and synchronization
- Multiple agents, vector memory, and mobile applications
