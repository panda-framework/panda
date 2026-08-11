# Phase 10 Plan: Remove the Legacy Execution Model

**Status:** Complete (2026-08-10)

**Prerequisite:** [Phase 9 — Add the Trace Dashboard](phase-9.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#14-phase-10-remove-the-legacy-execution-model)

## Objective and scope

Remove the obsolete seven-state/session/loop scaffold now that the daemon, SDK,
and dashboard all use the canonical five-capability execution coordinator. The
repository must expose one production execution model: first-class Goals and
Executions, capability-selected `NextStep` routing, policy-gated Actions,
independently observed effects, and causal traces.

Memory remains a persistence concern supporting capabilities. Understanding
and reflection remain Analysis techniques, while planning remains a technique
within Analysis or Decision. None may remain as capability or runtime-state
identities.

## Starting state

The production daemon no longer imports the graph package and `/runs` only
aliases the canonical service, but compatibility code remains public:

- `@panda/graph` exports `runPandaLoop` and a predetermined transition route;
- `@panda/shared` exports `PandaStateName`, sessions, run contracts, and legacy
  observation/action shapes;
- `@panda/core` exports a global observation bus, scheduler, simulated
  connectors, session store, `StateTransitionEngine`, `ObservationMemory`, and
  `PandaRuntime`;
- the SDK still exposes session reads and deprecated `run()`;
- the daemon still accepts `/runs`;
- the basic example and scaffolding documentation still teach the old model.

## Non-goals

- Removing the five canonical capabilities or their dynamic transition model.
- Removing Goals, execution context, trace records, policy, connectors, effect
  observation, or verification.
- Adding durable storage, general planning, retry, authentication, or new
  effect types.
- Rewriting historical phase completion records that accurately describe the
  migration state at the time.
- Release hardening and the final end-to-end matrix; that is Phase 11.

## Implementation tasks and affected files

1. Delete the graph workspace package and its fixed `runPandaLoop` route.
2. Reduce the core public entry point to canonical stores, coordinator, policy,
   Action connector, effect observer, deterministic capabilities, and daemon
   host/port configuration.
3. Delete legacy runtime tests with the runtime they uniquely exercised; retain
   canonical coverage in focused modules.
4. Remove `PandaStateName`, sessions/messages/run contracts, legacy
   observations/actions, transition payloads, and their constructors from the
   shared public entry point.
5. Remove the retained-legacy assertion from shared contract tests and keep the
   five canonical capability assertion.
6. Remove session SDK methods, deprecated `run()`, and legacy type re-exports.
7. Remove `/runs` and its legacy/canonical compatibility schemas and test from
   the daemon so `/executions` is the sole creation endpoint.
8. Update the basic example to create a canonical execution and retrieve its
   stored trace through typed SDK methods.
9. Refresh the root README, onboarding guide, scaffolding record, package map,
   API reference, configuration reference, and conceptual migration status.
10. Refresh the pnpm lockfile and confirm the graph importer is absent.
11. Search production source and examples for the retired package, loop,
    session/current-state contracts, seven-state identifiers, and legacy routes.
12. Run clean build, typecheck, unit/integration/dashboard tests, and the
    canonical example against a live isolated daemon.

## Removal decisions

### Package boundary

The graph package has no graph abstraction after Phase 8; its only value is the
retired fixed loop. Deleting it is clearer than renaming an empty compatibility
layer. Dynamic routing remains owned by `ExecutionCoordinator` and canonical
transition records in `@panda/core` and `@panda/shared`.

### Shared contract boundary

The unversioned legacy observation/action/session types are not aliases for the
canonical contracts: they omit execution/goal identity, provenance, causation,
schema version, authorization, and effect semantics. They are removed rather
than renamed. Consumers use `Signal`, `Observation`, `ActionRequest`, `Outcome`,
`Goal`, `PandaExecution`, and `StoredPandaTraceRecord`.

### Core boundary

The global observation bus and state engine model one runtime-wide current
state and are not part of the canonical application. They are removed together
with their simulated connectors and memory heuristic. Memory itself remains an
architectural persistence responsibility represented by execution/Goal stores
and future replaceable durable adapters, not a capability identity.

### Compatibility routes

`POST /runs` is deleted rather than kept deprecated because the SDK and
dashboard have migrated and Phase 10 is the planned removal gate. A caller must
use `POST /executions`; unknown `/runs` requests receive Fastify's `404`.

## Acceptance criteria

- No production workspace package named `@panda/graph` remains.
- Production source and examples contain no `runPandaLoop`, `PandaStateName`,
  `PandaSession`, `currentState`, `StateTransitionEngine`, `PandaRuntime`,
  session API, or `/runs` creation route.
- The only capability identity values are perception, analysis, network,
  decision, and action.
- Memory, planning, understanding, and reflection are documented only as
  persistence or techniques, not capabilities.
- Core and shared package exports contain only canonical execution contracts
  and utilities still used by production consumers.
- SDK and example code use typed execution create/list/detail/trace methods.
- Daemon tests prove `/executions` and assert `/runs` is absent.
- Clean install metadata, build, typecheck, test, daemon, dashboard, and example
  workflows pass after package removal.

## Validation plan

- Run focused shared, core, SDK, daemon, and dashboard tests.
- Run `pnpm install --lockfile-only`, `pnpm build`, `pnpm typecheck`, and
  `pnpm test` for the full remaining workspace.
- Run the updated example against a built daemon with an isolated temporary
  data directory and verify its terminal/trace output.
- Search production source and examples for every retired symbol, route, and
  seven-state identity.
- Run `git diff --check`, inspect all changed/deleted files, and validate local
  Markdown links.
- Confirm `.env`, generated wallets, `.panda`, temporary sandboxes, build
  outputs, and unrelated concurrent changes are absent from the commit.

## Risks and assumptions

### Risks

- Removing exported compatibility types is intentionally breaking. All in-repo
  consumers migrate in the same phase; v0.1 has no stability promise for the
  retired scaffold.
- Broad text searches can flag valid historical or architectural use of words
  such as planning. The hard gate applies to production capability identity and
  routing code, while docs may describe techniques or migration history.
- Removing a workspace can leave stale lockfile importer entries. The lockfile
  is regenerated and searched explicitly.

### Assumptions

- Phase 8 and Phase 9 completed every in-repo application migration required
  before compatibility removal.
- No external published consumer depends on these private monorepo packages.
- The root package remains private and packages are not independently released.
- Historical phase plans remain immutable evidence of earlier migration gates.

## Completion record

Phase 10 completed the legacy-model removal:

- deleted the `@panda/graph` workspace and its predetermined route;
- reduced shared and core public exports to the canonical execution model and
  retained utilities;
- removed the seven-state identity, session/global-state storage, simulated
  runtime primitives, legacy observation/action contracts, and their tests;
- removed session methods, legacy types, and `run()` from the SDK;
- removed the daemon `/runs` route and added a regression test for its `404`;
- made the basic SDK example create a canonical execution and retrieve its
  stored trace, with a root workspace dependency that makes it executable;
- refreshed the README, onboarding, scaffold, package/API maps, configuration,
  and conceptual migration record; and
- regenerated the lockfile with no graph workspace importer.

Validation completed:

- `pnpm install --frozen-lockfile` passed with the existing peer warning.
- `pnpm build` and `pnpm typecheck` passed for every remaining workspace.
- `pnpm test` passed: 5 shared, 62 core, 3 SDK, 5 daemon, and 5 dashboard
  executable tests; CLI typechecking also passed.
- A live isolated daemon plus `examples/basic-run.ts` produced a `succeeded`
  execution, `succeeded` terminal outcome, and 43 trace records.
- Production source/example searches found none of the retired routing,
  session, current-state, graph, or legacy runtime symbols. The sole `/runs`
  source reference is the daemon regression test proving the route is absent.
- `pnpm-lock.yaml` contains no graph importer, and the graph directory contains
  no remaining files.
- `git diff --check` and local-path validation across 43 Markdown files passed.
- No formatter or linter was run because the repository configures neither.

The dashboard build emitted the existing Node experimental warning for loading
the TypeScript Tailwind configuration through CommonJS; it completed
successfully. The live sandbox fixture was moved to the user Trash after
validation and can be recovered from `panda-phase10.I9AS6L` if needed.
