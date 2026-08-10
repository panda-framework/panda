# Phase 3 Plan: Add the Dynamic Coordinator

**Status:** Ready for implementation

**Prerequisite:** [Phase 2 — Build the Execution and Trace Foundation](phase-2.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#7-phase-3-add-the-dynamic-coordinator)

## Objective and scope

Add the execution-scoped coordination boundary that invokes independently
registered PANDA capabilities and commits the `NextStep` proposed by each
result. Phase 3 must support self-transitions, non-adjacent transitions,
waiting, resumption, and termination without embedding a scenario route or a
mandatory capability order.

The coordinator consumes the canonical contracts introduced in Phase 1 and
persists execution state and causal trace records through the Phase 2
`ExecutionStore`. It also establishes bounded failure behavior for invalid
results, unavailable capabilities, stale state, invocation errors, deadlines,
cancellation, and runaway transition sequences.

This phase provides orchestration mechanics only. Concrete deterministic
capability behavior begins in Phase 4, policy evaluation begins in Phase 5,
and external effects remain disabled until Phase 6.

## Starting state

`@panda/shared` exports the five canonical capabilities, execution context,
`NextStep`, transition, failure, and trace contracts. `@panda/core` exports a
process-local `ExecutionStore` that isolates executions, assigns trace
sequences, validates causation, and protects retained values with snapshots.

The executable application still uses legacy sessions and the predetermined
`runPandaLoop`. No registry can resolve a canonical capability implementation,
no runtime component consumes a capability-proposed next step, and no
canonical execution can advance, wait, resume, or terminate through recorded
dynamic transitions.

## Non-goals

- Implementing Perception, Analysis, Network, Decision, or Action domain
  behavior for the v0.1 filesystem scenario.
- Adding transition or action policy evaluation; transition records leave the
  optional policy summary absent until Phase 5.
- Executing connectors, writing files, verifying effects, or updating goal
  achievement.
- Wiring canonical executions into the daemon, SDK, CLI, dashboard, or legacy
  `runPandaLoop`.
- Adding durable persistence, restart recovery, distributed coordination,
  message brokers, retries, backoff, or exactly-once behavior.
- Removing or changing legacy state names, sessions, connectors, or runtime
  behavior.
- Defining a universal capability order or requiring every execution to visit
  every capability.

## Implementation tasks and affected files

1. Add `packages/core/src/coordinator.ts` with the capability invocation,
   result, implementation, registry, coordination input/result, option, and
   typed error contracts.
2. Add a replaceable `CapabilityRegistry` port and process-local
   implementation that:
   - accepts exactly one implementation for each canonical capability;
   - validates capability names at the registration boundary;
   - supports registration, removal, discovery, listing, and invocation; and
   - reports duplicate, invalid, and missing capabilities explicitly.
3. Add an `ExecutionCoordinator` that:
   - loads an existing non-terminal execution from `ExecutionStore`;
   - uses its `activeCapability` as the first target;
   - creates immutable execution context for every invocation;
   - invokes the selected registered implementation;
   - accepts and validates its result and proposed `NextStep`; and
   - repeats only when an `invoke` step commits successfully.
4. Implement all three next-step outcomes:
   - `invoke` commits the requested capability, updates execution state, and
     passes the previous capability output forward as the next opaque input;
   - `wait` records the resume condition, retains the active capability, marks
     the execution waiting, and returns control to the caller; and
   - `terminate` records the declared outcome, clears the active capability,
     and makes execution state terminal.
5. Record causally linked traces for invocation start and completion,
   transition request and commitment or rejection, structured failure, wait,
   and termination.
6. Convert capability exceptions and malformed results into structured
   execution failures without crashing unrelated executions.
7. Enforce a positive invocation limit, execution deadline, caller
   cancellation signal, same-execution single-run ownership, and stale-state
   detection before committing returned work.
8. Export the new ports, implementation, result types, and typed errors from
   `@panda/core` without changing current application callers.
9. Add focused coordinator tests and update the implementation plan, progress
   record, documentation index, and developer onboarding guide after the exit
   gate passes.

## Coordinator decisions

### Package and dependency boundary

The coordinator and registry live in `@panda/core`. They consume canonical
records from `@panda/shared` and persistence only through `ExecutionStore`.
They do not import application packages, the legacy graph runner, concrete
capabilities, connectors, or policy implementations.

Capability implementations expose one canonical capability name and an
`invoke` operation. An invocation receives immutable execution context, an
opaque input value, and an `AbortSignal`; its result contains an opaque output
and a proposed `NextStep`. The coordinator interprets routing fields but does
not interpret domain products.

### Registry ownership and lifecycle

The Phase 3 registry is process-local and explicitly populated by its caller.
Registration rejects non-canonical names and duplicate ownership rather than
silently replacing an implementation. Removing a registration affects later
resolution only; plugin loading, implementation priority, health-aware
selection, and distributed discovery remain later runtime concerns.

The registry is a replaceable port so a future runtime may add discovery and
lifecycle without changing capability or coordinator contracts.

### Execution entry and resumption

An execution must exist before coordination starts and must select an
`activeCapability`. The coordinator rejects unknown and already-terminal
executions. It changes a pending or waiting execution to running only after
validating its entry state and configured bounds.

A wait ends the current coordination run. Resumption is an explicit later call
for the same execution with new input and an optional expected state marker.
The retained active capability is invoked again, and prior invocation IDs are
made available through execution context. Phase 3 does not subscribe to the
`resumeOn` value or invent a scheduler that resumes executions automatically.

### Dynamic invocation and data flow

Routing comes only from a capability result. For an `invoke` next step, the
coordinator may target any registered canonical capability, including the
source capability. It forwards the completed capability's output as the next
invocation input while treating both values as opaque, structured-clone-safe
data.

The optional `payloadRef` remains a semantic reference for later product and
persistence integration. Phase 3 does not add a second payload repository or
resolve arbitrary references. Scenario-specific routes and product semantics
belong to Phase 4 capability implementations.

### Transition and trace semantics

Every completed invocation proposes exactly one next step. The coordinator
records a `TransitionRequest`, rechecks current execution state and target
availability, and then records a committed or rejected `TransitionRecord`.
The execution is updated only after commitment.

Trace causation follows the runtime decision chain:

```text
capability.started
  -> capability.completed
  -> transition.requested
  -> transition.committed | transition.rejected
  -> next invocation | wait | failure | termination
```

Invocation records identify invocation ID, capability, context, phase, and the
relevant input, output, or next step. Records retain execution, goal,
correlation, causation, producer, schema, and timestamp identity through the
canonical envelope. Trace sequence assignment remains owned by
`ExecutionStore`.

### Failures and execution bounds

The coordinator distinguishes caller misuse and coordination conflicts from
failures that occur inside an accepted execution:

- unknown, terminal, concurrently coordinated, or stale executions produce
  typed coordinator errors;
- an unavailable target, missing active capability, malformed capability
  result, or thrown invocation becomes a structured failure and failed
  execution;
- cancellation records a cancellation failure and terminates the execution as
  cancelled;
- an expired deadline or reached invocation limit records a bounded runtime
  failure and terminates the execution as failed.

The invocation limit bounds one continuous coordination run; a committed wait
ends that run. A later resume receives a new bounded run while the complete
invocation history remains inspectable in the execution trace. Deadline and
cancellation checks occur before work and at invocation boundaries. The
`AbortSignal` communicates cancellation to a capability, but Phase 3 cannot
guarantee that arbitrary implementation code cooperates after cancellation.

### Concurrency and stale state

Different executions may coordinate concurrently because execution state and
traces are independently keyed. One coordinator instance permits only one
active run for a given execution ID. Before accepting a capability result, it
re-reads the execution and rejects the transition if relevant state changed
during the invocation.

Callers may also provide an expected update marker when starting or resuming a
run. Durable revision numbers, locks across processes, leases, and optimistic
database transactions are deferred; Phase 3 documents and tests the
process-local guarantee it can actually provide.

## Acceptance criteria

- The public core API exports replaceable capability registry and execution
  coordinator boundaries plus process-local implementations.
- Registration accepts only the five canonical capabilities and rejects
  duplicate, invalid, and unavailable implementations explicitly.
- Test capabilities can select themselves or any other registered capability;
  no fixed route or adjacency table exists in coordinator code.
- Capability input, output, execution context, and invocation history are
  propagated without the coordinator interpreting domain semantics.
- `invoke`, `wait`, resumption, and all terminal outcomes update execution
  state correctly.
- Each invocation and transition is recorded with a complete, traversable
  causal chain; rejected transitions, failures, waits, and terminations remain
  observable.
- Unknown targets, missing active capability, thrown invocations, malformed
  results, stale state, and concurrent same-execution runs fail explicitly.
- Invocation limits, deadlines, and cancellation stop coordination with the
  correct structured outcome.
- Two different executions can progress without sharing active capability,
  invocation count, context, status, or trace history.
- The daemon, SDK, dashboard, legacy graph runner, and simulated connectors
  retain their existing behavior.

## Validation plan

- Add registry tests for canonical registration, duplicate registration,
  invalid names, removal, listing, invocation, and missing implementations.
- Add coordinator tests for self-transition, non-adjacent transition, output
  handoff, wait, resume, succeeded/failed/cancelled termination, and causal
  trace traversal.
- Add failure tests for missing active capability, unknown target, thrown
  invocation, malformed next step, stale state, concurrent same-execution
  coordination, invocation limit, expired deadline, cancellation before start,
  and cancellation during invocation.
- Add an isolation test that interleaves two executions through one registry
  and store.
- Run `pnpm --filter @panda/core test`.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Run `git diff --check` and inspect the complete diff and changed-file list.
- Inspect local Markdown links and paths.
- Confirm `.env`, generated wallets, build outputs, and unrelated working-tree
  changes remain uncommitted.
- Confirm no configured format or lint command exists before reporting those
  checks as unavailable.

## Risks and assumptions

### Risks

- Interpreting capability products in the coordinator would couple routing to
  the v0.1 scenario. Only `NextStep` is coordinator control data.
- Updating execution state before recording a committed transition could make
  traces disagree with runtime state. Commitment precedes the state update.
- A thrown capability could escape the execution boundary and disrupt other
  work. Invocation errors become structured failures scoped to one execution.
- A stale result could overwrite cancellation or another update. State is
  checked again before transition commitment.
- Waiting without an explicit return boundary could continue an autonomous
  loop without new information. `wait` always returns control to the caller.
- Cancellation cannot forcibly stop non-cooperative JavaScript or a future
  external effect. Phase 3 performs no external effects; later action phases
  must combine cancellation with timeouts, policy, idempotency, and effect
  reconciliation.
- Persisting arbitrary invocation payloads may retain sensitive or excessively
  large data. Phase 3 tests use bounded non-secret values; redaction, payload
  references, hashing, and retention controls remain required runtime work.

### Assumptions

- Capability inputs, outputs, context values, and trace payloads are bounded,
  structured-clone-safe data.
- A capability returns one result and one next step per invocation.
- `ExecutionStore` remains the authority for execution snapshots, trace order,
  and causation validation.
- A process-local registry and same-process concurrency guard are sufficient
  for Phase 3 acceptance.
- Callers explicitly create executions, select the initial capability, and
  resume waiting work; application integration arrives in Phase 8.
- Policy-free transition commitment is temporary and does not authorize an
  external effect.

## Completion record

Pending implementation and successful completion of the Phase 3 exit gate.
