# Phase 3 Plan: Add the Dynamic Coordinator

**Status:** Complete

**Prerequisite:** [Phase 2 — Build the Execution and Trace Foundation](phase-2.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#7-phase-3-add-the-dynamic-coordinator)

## Objective and scope

Add the execution-scoped control plane that invokes independently registered
capabilities and commits the `NextStep` returned by each invocation. Phase 3
makes routing dynamic, records a causal account of invocations and transitions,
and bounds execution without adding any scenario-specific capability logic.

The coordinator operates on canonical executions already present in an
`ExecutionStore`. It remains additive: the daemon and legacy `runPandaLoop`
continue to use the existing seven-state scaffold until the later integration
and removal phases.

## Starting state

Phase 2 introduced independent canonical execution state and append-only,
per-execution trace histories. It did not provide a capability registry,
interpret `NextStep`, or protect a running invocation from stale execution
updates.

The legacy transition engine still owns one process-wide state and the graph
package still requests a predetermined route. Those paths are compatibility
behavior, not inputs to the Phase 3 coordinator.

## Non-goals

- Implementing Perception, Analysis, Network, Decision, or Action behavior.
- Encoding the golden filesystem route in the coordinator.
- Adding the Phase 5 policy gate or enabling any real external effect.
- Wiring the coordinator into the daemon, SDK, dashboard, or legacy graph.
- Resolving `payloadRef` through an artifact repository.
- Adding durable scheduling, automatic wait-event matching, retries, replay,
  or restart recovery.
- Removing legacy sessions, state names, or `runPandaLoop`.

## Implementation tasks and affected files

1. Add `packages/core/src/coordinator.ts` with:
   - capability invocation and result contracts;
   - the `CapabilityRegistry` port and in-memory implementation;
   - typed registry and coordinator errors; and
   - the execution-scoped `ExecutionCoordinator`.
2. Register, list, invoke, and independently unregister canonical capability
   implementations while rejecting duplicates and non-canonical names.
3. Invoke the execution's active capability and pass its output directly to
   the target selected by the returned `NextStep`.
4. Support self-transitions, non-adjacent transitions, wait/resume, and all
   three terminal outcomes without a coordinator-owned route table.
5. Append separate requested and committed or rejected transition records,
   plus invocation, wait, failure, and termination records, to the Phase 2
   trace store.
6. Reject stale invocation results before they can overwrite newer execution
   state.
7. Convert thrown invocations and invalid results into structured failures;
   enforce cancellation, execution deadlines, and a configurable invocation
   limit.
8. Re-export the Phase 3 API from `@panda/core`, add focused tests, and update
   the plan, progress record, documentation index, onboarding guide, and root
   package summary.

## Coordinator decisions

### Registry and capability boundary

Each implementation registers against exactly one of the five canonical
capabilities. Duplicate registration is rejected instead of silently replacing
a running implementation. Registration returns an ownership-safe cleanup
function that removes only that same implementation.

Capabilities receive an immutable execution context, the current input, and an
abort signal. They return a product and proposed `NextStep`; they do not invoke
another implementation directly. The result product becomes the next
capability's input when an `invoke` transition commits.

### Execution state and wait behavior

The caller creates the canonical execution and selects its initial active
capability. The coordinator changes only that execution. `invoke` selects the
target and keeps it running, `wait` retains the source capability so a later
resume can re-enter it, and `terminate` clears the active capability and stores
the terminal outcome.

Each invocation receives a new ID and context. Invocation history is rebuilt
from the stored trace when a waiting execution resumes, so context remains
execution-scoped across separate coordinator calls without adding mutable
process-wide state.

### Transition and causal trace semantics

An invocation has started and completed trace records. A valid proposal then
creates a canonical `TransitionRequest` in a `transition.requested` trace. The
coordinator appends a separate canonical `TransitionRecord` as either
`transition.committed` or `transition.rejected`.

Each trace record directly causes the next material record: invocation start,
invocation completion, transition request, transition result, and the next
invocation, wait, failure, or termination. This preserves one traversable chain
while keeping request and fact identities distinct.

### Bounds, failures, and concurrency

The default invocation budget is 100 and can be lowered per coordinator. If a
capability requests another invocation after exhausting the budget, that
transition is rejected and the execution fails explicitly. A passed deadline
produces a timeout failure; an aborted signal produces a cancelled execution.
The signal is also passed into a running capability, and coordination does not
wait indefinitely for an implementation that ignores it.

Thrown invocation errors and malformed next steps become canonical `Failure`
payloads followed by termination records. Unknown targets are recorded as
rejected transitions before failure. No failure is represented as success.

The coordinator snapshots execution state before invoking a capability and
compares the material state again before commit. A stale result receives a
rejected transition record and a typed `STALE_EXECUTION` error; it never
overwrites the newer execution. One coordinator instance also rejects two
simultaneous runs for the same execution while allowing different executions
to progress independently.

## Acceptance criteria

- The public core API exports a capability registry and execution coordinator.
- Test implementations can select any registered target, including themselves
  and non-adjacent capabilities.
- Capability products flow to the dynamically selected target.
- `invoke`, `wait`, resume, and `terminate` update only the selected execution.
- Every valid transition has distinct requested and committed or rejected
  trace records, and every invocation is visible in the causal trace.
- Unknown targets, duplicate or invalid registrations, thrown invocations, and
  malformed next steps fail explicitly.
- Stale results cannot replace newer execution state.
- Deadline, cancellation, and invocation-limit bounds terminate predictably.
- The legacy application path and all prior tests remain unchanged.

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

- Scenario logic in the coordinator would recreate a fixed pipeline. Routing
  decisions come only from capability results.
- A capability can ignore cancellation and continue computation after the
  coordinator stops awaiting it. The coordinator prevents late state or trace
  commits; cooperative implementations should stop work through the supplied
  abort signal.
- An in-memory compare followed by update is not a durable database compare-and-
  swap. The stale check protects this Phase 3 runtime; a durable store must
  provide atomic concurrency semantics later.
- Waiting does not yet subscribe to or validate a `resumeOn` event. The field is
  retained in the trace, and a later scheduler owns automatic resumption.

### Assumptions

- Capability inputs and outputs are structured-clone-compatible trace data.
- The execution's `activeCapability` selects the first invocation.
- A capability output is the next invocation input for Phase 3; artifact
  references and payload lookup remain later runtime work.
- Terminal invocation failures stop the execution until a later phase defines
  explicit failure-routing policies.

## Completion record

### Completed work

- Added and publicly exported capability invocation/result contracts, the
  `CapabilityRegistry` port, `InMemoryCapabilityRegistry`, and
  `ExecutionCoordinator`.
- Added dynamic output-driven routing with self, non-adjacent, wait/resume, and
  terminal transitions.
- Added invocation, requested transition, committed or rejected transition,
  wait, failure, and termination traces with continuous causation.
- Added runtime bounds and stale-result protection without changing the legacy
  application path.
- Added eight focused Phase 3 tests with four nested failure/boundary cases,
  while retaining all Phase 1, Phase 2, and legacy tests.

### Validation

- `pnpm --filter @panda/core test` — passed; 22 tests passed, comprising the
  Phase 3 coordinator cases, six execution-store tests, and four legacy runtime
  tests.
- `pnpm build` — passed for all workspace projects.
- `pnpm typecheck` — passed for all workspace projects.
- `pnpm test` — passed; 5 shared contract tests and 22 core tests passed, with
  all remaining package scripts successful.
- `git diff --check` — passed.
- Local Markdown link/path inspection — passed; 88 local links across 36
  Markdown files checked.
- Format/lint commands — unavailable because none are configured.

The dashboard build emitted the existing Node experimental warning while
loading the TypeScript Tailwind configuration through CommonJS; the build
completed successfully.

### Remaining work

No Phase 3 work remains. Phase 4 must implement the deterministic five
capabilities that produce scenario-specific canonical products and select
routes through this coordinator.
