# Phase 2 Plan: Build the Execution and Trace Foundation

**Status:** Complete

**Prerequisite:** [Phase 1 — Introduce Canonical Contracts Additively](phase-1.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#6-phase-2-build-the-execution-and-trace-foundation)

## Objective and scope

Add the execution-scoped persistence boundary required by the future dynamic
coordinator. Phase 2 stores independent canonical executions and their causal
trace histories in memory, assigns stable per-execution order, and rejects
invalid causal relationships without changing the legacy application path.

The implementation is intentionally process-local. It establishes the port and
semantics that later runtime, API, SDK, and dashboard phases consume; it does
not claim restart recovery or durable delivery.

## Starting state

Phase 1 added `PandaExecution` and `TraceRecord` contracts with common
execution, goal, correlation, causation, producer, schema, and timestamp
identity. Trace sequence remained optional because the shared contract layer
does not own persistence or ordering.

Before Phase 2, the core package had only the legacy session store and a
process-wide state transition engine. It could not retain canonical execution
state, isolate trace histories, assign sequence numbers, or validate causal
links.

## Non-goals

- Wiring the store into the daemon, SDK, dashboard, or legacy `runPandaLoop`.
- Adding the Phase 3 capability registry or dynamic coordinator.
- Storing goals separately or implementing goal lifecycle commands.
- Adding policy evaluation, real connector effects, or effect verification.
- Adding a database, restart recovery, replay, or exactly-once behavior.
- Removing or changing legacy sessions, state names, or runtime behavior.

## Implementation tasks and affected files

1. Add `packages/core/src/execution-store.ts` with:
   - the replaceable `ExecutionStore` port;
   - `StoredTraceRecord`, which makes assigned sequence identity explicit;
   - typed store error codes; and
   - the process-local `InMemoryExecutionStore` implementation.
2. Support create, retrieve, list, and update operations for independent
   canonical executions.
3. Append and retrieve traces by execution ID, assigning sequences from 1 in
   append order independently for every execution.
4. Reject unknown executions, duplicate execution and trace identities,
   caller-supplied sequence numbers, missing causal records, and causal links
   into another execution.
5. Snapshot values on store ingress and egress so later caller mutation cannot
   rewrite retained execution state or trace history.
6. Re-export the new port and implementation from `@panda/core` without
   changing current runtime callers.
7. Add focused tests and update the implementation plan, progress record,
   documentation index, and developer onboarding guide.

## Store decisions

### Port and package boundary

The storage port lives in `@panda/core`, which already depends on the stable
canonical contracts in `@panda/shared`. Applications can consume the port from
the core package, while later durable implementations can conform without
changing shared domain records.

`createExecution`, `updateExecution`, and `appendTrace` return stored snapshots.
This makes assigned values observable immediately and still prevents callers
from holding mutable references into the store.

### Execution identity and isolation

The store keys execution state and trace arrays by `executionId`. Updating one
execution replaces only its stored snapshot and cannot change another
execution's status or active capability. The execution record `id` is stable
across updates; attempts to replace it are rejected as identity mismatches.

Listing preserves creation order for deterministic in-memory behavior. A
missing `getExecution` returns `undefined`, while operations that require an
existing execution fail explicitly. In particular, `getTrace` distinguishes an
unknown execution from a known execution with an empty trace.

### Trace order, causation, and immutability

Only the store assigns trace sequence numbers. Numbering begins at 1 and grows
monotonically within each execution, so interleaved work cannot share a global
counter or perturb another execution's ordering.

Every supplied `causationId` must identify an already appended trace record.
The store distinguishes an unknown cause from a known trace in another
execution and rejects both. Causal roots omit `causationId`; later records can
therefore be traversed backwards from the latest trace to a root signal or
observation without treating timestamps or sequence as causal evidence.

There is no trace update or delete operation. Duplicate IDs and preassigned
sequences are rejected, and structured snapshots isolate retained history from
mutation of either input objects or returned values.

## Acceptance criteria

- The public core API exports an `ExecutionStore` port and in-memory
  implementation.
- Executions can be created, retrieved, listed, and updated independently.
- Interleaved traces receive monotonic sequences starting at 1 per execution.
- A causal chain is traversable from its latest record to its root.
- Missing execution and causation identities fail explicitly.
- Cross-execution causation, duplicate trace identity, and caller-assigned
  sequence values are rejected.
- Trace history remains append-only and isolated from caller mutation.
- The current application path and all legacy behavior remain unchanged.

## Validation plan

- Run the focused `@panda/core` tests.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Run `git diff --check` and inspect the complete diff and changed-file list.
- Inspect local Markdown links and paths.
- Confirm `.env`, generated wallets, and build outputs remain ignored and
  uncommitted.
- Confirm no configured format or lint command exists before reporting those
  checks as unavailable.

## Risks and assumptions

### Risks

- Returning retained objects directly would allow consumers to rewrite
  append-only history. Ingress and egress snapshots prevent shared references.
- A process-wide sequence counter would couple otherwise independent
  executions. Each trace array owns its own append-derived counter.
- Accepting a causation ID before its record exists would permit forward or
  unverifiable links. Causal records must already be present.
- An empty array for an unknown execution would hide identity mistakes.
  `getTrace` therefore rejects unknown executions.

### Assumptions

- Canonical store values are structured-clone-compatible data records.
- Trace IDs are stable across a store instance and globally unique within it.
- In-memory creation order is sufficient for Phase 2 listing; persistent query
  ordering and pagination belong to later implementations.
- More advanced optimistic concurrency and durable versioning remain later
  runtime concerns.

## Completion record

### Completed work

- Added and publicly exported the `ExecutionStore` port,
  `InMemoryExecutionStore`, `StoredTraceRecord`, and typed store errors.
- Added independent execution CRUD and isolated trace storage.
- Added store-owned per-execution sequence assignment and causal validation.
- Protected retained execution and trace values with structured snapshots.
- Added six focused Phase 2 tests while retaining all Phase 1 and legacy tests.
- Updated the plan, progress record, documentation index, and onboarding guide.

### Validation

- `pnpm --filter @panda/core test` — passed; 6 execution-store tests and 4
  legacy core runtime tests passed.
- `pnpm build` — passed for all workspace projects.
- `pnpm typecheck` — passed for all workspace projects.
- `pnpm test` — passed; 5 shared contract tests, 6 execution-store tests, and 4
  legacy core runtime tests passed, with all remaining package scripts
  successful.
- `git diff --check` — passed.
- Local Markdown link/path inspection — passed; 77 local links across 33
  Markdown files checked.
- Format/lint commands — unavailable because none are configured.

### Remaining work

No Phase 2 work remains. Phase 3 must add the capability registry and
execution-scoped dynamic coordinator, consume proposed `NextStep` values,
record requested and committed transitions, and enforce execution bounds.
