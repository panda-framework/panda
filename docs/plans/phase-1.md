# Phase 1 Plan: Introduce Canonical Contracts Additively

**Status:** Complete

**Prerequisite:** [Phase 0 — Freeze the v0.1 Contract](phase-0.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#5-phase-1-introduce-canonical-contracts-additively)

## Objective and scope

Introduce the canonical PANDA v0.1 TypeScript contracts in the shared package
without removing the legacy seven-state scaffold or changing the current
application path. The phase establishes stable, versioned identities and typed
records that the execution store and coordinator can use in Phases 2 and 3.

The new contracts describe the five independently selectable PANDA
capabilities, execution and goal context, capability products, action outcomes,
failures, proposed next steps, committed transitions, and trace envelopes.

## Starting state

Before this phase, `@panda/shared` exposed legacy sessions, seven state names,
messages, observations, actions, events, and small ID/time helpers. The current
`runPandaLoop` still requested a predetermined legacy state sequence. There was
no canonical execution or goal identity, versioned record envelope, typed
transition request, or causal trace record.

Phase 0 froze the observable v0.1 fixtures and required all material records to
carry execution, goal, correlation, causation, producer, schema, and time
identity. Phase 1 implements that record vocabulary only; it does not yet store,
coordinate, validate, or execute those records.

## Non-goals

- Removing `PandaStateName`, legacy sessions, or `runPandaLoop`.
- Changing daemon, SDK, CLI, dashboard, connector, or example behavior.
- Adding an execution store, coordinator, policy engine, or capability
  implementations.
- Assigning trace sequence numbers or validating same-execution causation.
- Performing a real filesystem effect.
- Claiming restart durability or adding external infrastructure.

## Implementation tasks and affected files

1. Add `packages/shared/src/contracts.ts` with:
   - the exact five-value `PandaCapability` contract;
   - `ExecutionContext`, `Goal`, and `PandaExecution`;
   - `Signal`, `Observation`, `Assessment`, `Decision`, `ActionRequest`,
     `Outcome`, and `Failure`;
   - `NextStep`, `TransitionRequest`, `TransitionRecord`, and `TraceRecord`;
   - supporting statuses, evidence, provenance, policy, and producer types; and
   - constructors for consistent identity, schema version, and timestamps.
2. Move the existing ID and timestamp helpers into
   `packages/shared/src/identifiers.ts` so both legacy and canonical factories
   share one implementation without an import cycle.
3. Re-export canonical and legacy contracts together from
   `packages/shared/src/index.ts`.
4. Add `packages/shared/src/contracts.test.ts` and make the shared package test
   script execute compiled Node tests.
5. Update the implementation plan, documentation index, onboarding guide, and
   progress record after the exit gate passes.

## Contract decisions

### Common record identity

Every material canonical record extends `CanonicalRecord` and carries:

- `id`;
- the literal v0.1 `schemaVersion`;
- `executionId`;
- `goalId`;
- `correlationId`;
- optional `causationId` for a causal root;
- a tagged capability, connector, or runtime `producer`; and
- an ISO timestamp.

For records inside an existing execution, constructors generate only the
record ID, schema version, and timestamp. The caller must supply execution,
goal, correlation, and producer identity so those relationships cannot be
silently invented. Goal and execution constructors establish their new domain
identity explicitly. Caller-provided IDs and timestamps are preserved for
replayable deterministic fixtures.

### Five capabilities and legacy compatibility

`PANDA_CAPABILITIES` is the runtime tuple `perception`, `analysis`, `network`,
`decision`, and `action`; `PandaCapability` is derived from that tuple. The
legacy `PandaStateName` remains exported unchanged for current callers. New
canonical contracts do not use the legacy understanding, memory, planning,
execution, or reflection state names.

### Typed products and outcomes

Signals and observations retain typed payloads and provenance. Assessments
retain evidence, assumptions, information needs, options, and a typed result.
Decisions retain the selected option, alternatives, decisive evidence and
constraints, rationale, and a typed `NextStep`. Action requests retain target,
connector, typed parameters, authorization reference, idempotency key, and
optional timeout.

Outcomes distinguish success, failure, rejection, cancellation, timeout,
indeterminate state, and partial completion. Effect state is tracked separately
so an attempted, partial, unknown, or completed effect cannot be collapsed into
the operation status. Failures remain structured, causal data with category,
operation, retryability, evidence, and known effect state.

### Execution, goal, transition, and trace boundaries

Initial goals and executions use their domain identity as their initial record
identity unless an explicit record ID is supplied. Transition requests preserve
the source invocation, trigger, reason, and proposed `NextStep`; committed or
rejected records add the applicable policy summary and result.

`TraceRecord.sequence` is intentionally optional in Phase 1. The Phase 2 store
owns per-execution monotonic sequence assignment and same-execution causation
validation.

## Acceptance criteria

- All Phase 1 named contracts are publicly exported by `@panda/shared`.
- The only canonical capability names are the five PANDA responsibilities.
- Material record constructors generate stable IDs, the v0.1 schema version,
  and valid timestamps while preserving explicit fixture values.
- Execution, goal, correlation, causation, and producer identity are retained
  across typed records.
- `NextStep` supports invoke, wait, and terminal outcomes without a fixed route.
- Outcomes and failures preserve indeterminate and partial-effect states.
- Existing production behavior builds and all legacy tests continue to pass.
- `PandaStateName` and the current application path remain unchanged.

## Validation plan

- Run the focused `@panda/shared` tests.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Run `git diff --check` and inspect the complete diff and changed-file list.
- Inspect local Markdown links and paths.
- Confirm `.env`, generated wallets, and build outputs remain ignored and
  uncommitted.
- Confirm no format or lint command is configured before reporting it as
  unavailable.

## Risks and assumptions

### Risks

- Canonical and legacy observations may be confused while both are exported.
  The canonical factory is named `createObservationRecord`; the legacy factory
  remains `createObservation` until Phase 10 migration.
- A broad generic payload could hide record-specific requirements. Required
  fields remain explicit on each named contract, while generics type only the
  domain result or payload.
- Assigning sequence or validating causation too early would put storage logic
  in the contract layer. Those responsibilities remain in Phase 2.

### Assumptions

- `0.1` is the schema literal for the frozen v0.1 contract family.
- ISO strings remain the portable timestamp representation used throughout the
  existing repository.
- The shared package is the stable dependency layer for contracts consumed by
  the runtime, SDK, and applications.

## Completion record

### Completed work

- Added all named Phase 1 canonical contracts and their supporting types.
- Added constructor coverage for record defaults, caller-supplied identity,
  typed payloads/results, and causal links.
- Kept every legacy export and runtime caller intact.
- Added five focused shared-package tests and retained the four legacy core
  runtime tests.
- Updated the plan, progress record, documentation index, and onboarding guide.

### Validation

- `git diff --check` — passed for the staged change.
- Local Markdown link/path inspection — passed across 30 Markdown files.
- `pnpm --filter @panda/shared test` — passed; 5 tests passed.
- `pnpm build` — passed for all workspace projects.
- `pnpm typecheck` — passed for all workspace projects.
- `pnpm test` — passed; 5 shared contract tests and 4 legacy core tests passed,
  with all remaining package test/type-check scripts successful.
- The dashboard build emitted its existing Node experimental warning while
  loading the TypeScript Tailwind configuration; the build completed.
- Format/lint commands — unavailable because none are configured.

### Remaining work

No Phase 1 work remains. Phase 2 must add the execution and trace store,
per-execution sequence assignment, same-execution causation validation,
append-only trace behavior, and concurrent execution isolation.
