# Phase 4 Plan: Implement Deterministic PANDA Capabilities

**Status:** Complete

**Prerequisite:** [Phase 3 — Add the Dynamic Coordinator](phase-3.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#8-phase-4-implement-deterministic-panda-capabilities)

## Objective and scope

Implement deterministic, model-independent versions of Perception, Analysis,
Network, Decision, and Action for the frozen v0.1 filesystem request. The
capabilities produce canonical records and select their own `NextStep` values,
allowing the Phase 3 coordinator to demonstrate different routes for complete,
incomplete, and invalid input without encoding scenario order.

Phase 4 stops at an effect candidate. Decision may create a typed
`filesystem.write` request, but it cannot claim policy authorization. Action
stages that request and waits for the Phase 5 policy gate; it does not invoke a
connector or touch the filesystem.

## Starting state

Phase 3 added an execution-scoped registry and dynamic coordinator. Test-only
capabilities could select arbitrary routes, but the core package had no
canonical implementation of any PANDA responsibility and no behavior for the
frozen `demo.file.requested` fixture.

The legacy application path and connector stubs remained separate from the
canonical execution path. That separation continues through Phase 4 because
daemon and SDK integration belongs to Phase 8, while authorization and real
effects belong to Phases 5 and 6.

## Non-goals

- Evaluating transition or effect policy.
- Treating path syntax as sandbox authorization or rejecting traversal,
  absolute paths, symlinks, unsupported effects, or oversized content.
- Invoking the filesystem connector or writing any file.
- Observing or verifying an environmental effect.
- Updating goal state or implementing a goal repository.
- Wiring canonical executions into the daemon, SDK, dashboard, graph package,
  or legacy `runPandaLoop` path.
- Automatically matching wait events or resuming a waiting execution.
- Requiring a model, LLM, network service, broker, or durable store.

## Implementation tasks and affected files

1. Add `packages/core/src/deterministic-capabilities.ts` with the five Phase 4
   implementations and the v0.1 demo-file types and constants.
2. Make Perception accept a canonical `Signal`, enforce execution identity,
   preserve source, occurrence/receipt time, provenance, and raw payload, and
   classify the observation as valid, incomplete, or invalid.
3. Make Analysis apply deterministic presence and type rules, retain evidence,
   assumptions, confidence, options, and information needs, then select
   Decision, wait, or explicit failure according to the evidence.
4. Make Decision create a canonical decision with relevant alternatives,
   decisive evidence, constraints, and rationale. Create an ActionRequest only
   for a ready assessment and leave `authorization` absent.
5. Make Action validate and expose the selected request, then wait for
   `policy.evaluated` without calling a connector.
6. Register an effect-free Network placeholder without routing the filesystem
   fixture through it.
7. Add atomic registration and cleanup for the complete five-capability set
   and re-export the Phase 4 API from `@panda/core`.
8. Add focused route, product, missing-information, invalid-input, Network,
   and no-effect tests.
9. Update the implementation plan, progress record, documentation index,
   developer onboarding guide, and root package summary.

## Capability decisions

### Perception validation and preservation

Perception requires a canonical signal whose execution, goal, and correlation
identity match the coordinator context. It recognizes the frozen
`demo.file.requested` type and checks only whether its payload is an object with
a non-empty string `path` and string `content`.

Missing properties produce an `incomplete` observation. Wrong types, an empty
path, a non-object payload, or an unsupported signal type produce an `invalid`
observation. Perception preserves the supplied payload exactly instead of
filling a missing value or coercing an invalid one. In either case, Analysis
receives the observation so the route remains a product decision rather than a
coordinator rule.

### Analysis readiness boundary

Analysis uses the rule identifier `panda.v0.1.demo-file-input-rules`. A ready
assessment includes the observed record as evidence, records the UTF-8
interpretation and deferred authorization as an assumption, and lists both a
filesystem candidate and safe non-action.

An incomplete assessment records each missing field as an information need and
returns `wait` with `resumeOn: "demo.file.requested"`. An invalid assessment
records the malformed fields and terminates failed. Neither route creates a
Decision or ActionRequest in ordinary coordination.

This layer validates semantic presence and basic types only. Whether a path is
inside the execution sandbox is deliberately a Phase 5 policy decision.

### Decision evidence and candidate intent

Decision accepts a ready assessment and creates an ActionRequest for
`filesystem.write` through the `filesystem` connector, targeting the current
execution workspace. Its selected option, relevant safe alternatives,
decisive evidence, constraints, and deterministic rationale remain explicit.

The request has an idempotency key and UTF-8 parameters, but no authorization
reference. This absence is material: structural readiness is not permission.
If Decision is invoked directly with an insufficient assessment, it selects
no action and waits or terminates instead of manufacturing an intent.

### Effect-free Action boundary

Action checks that the selected intent is the canonical filesystem request for
the same execution. It returns the staged ActionRequest as its product and
waits for `policy.evaluated`. No connector dependency is available to this
implementation, so Phase 4 cannot accidentally dispatch or complete an effect.

The intermediate complete-input route is therefore:

```text
Perception -> Analysis -> Decision -> Action -> wait(policy.evaluated)
```

Phase 5 replaces the waiting boundary with auditable policy evaluation before
Phase 6 enables the connector effect.

### Network availability

Network is registered with the other four capabilities and returns an idle,
effect-free placeholder result plus a wait. The filesystem fixture never
selects it, proving availability does not imply a mandatory visit.

### Registration and ownership

`registerDeterministicPandaCapabilities` registers all five implementations in
canonical order. If any registration fails, it removes only the implementations
it added. The returned cleanup preserves the Phase 3 registry's ownership-safe
unregistration semantics.

## Acceptance criteria

- All five deterministic implementations are publicly exported by
  `@panda/core` and can be registered together.
- Complete input dynamically selects Perception, Analysis, Decision, and
  Action, then waits before any effect.
- Missing content selects Perception and Analysis, then waits for corrected
  input with no Decision or ActionRequest.
- Invalid typed input is preserved as invalid evidence and terminates without
  selecting Action.
- Perception preserves source, occurrence/receipt time, provenance, and payload.
- Assessment records expose evidence, assumptions, confidence, options, and
  information needs.
- Decision records expose the selected option, relevant alternatives,
  decisive evidence, constraints, and rationale.
- ActionRequest creation requires complete valid evidence and does not invent
  policy authorization.
- Network remains registered but is absent from the filesystem route.
- No connector invocation, outcome, or filesystem effect occurs.
- The legacy application path and all earlier behavior remain unchanged.

## Validation plan

- Run the focused `@panda/core` executable tests.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Run `git diff --check` and inspect the complete diff and changed-file list.
- Inspect every local Markdown link and relative path.
- Confirm `.env`, generated wallets, and build outputs remain ignored and
  uncommitted.
- Confirm no configured format or lint command exists before reporting those
  checks as unavailable.

## Risks and assumptions

### Risks

- Treating type validation as sandbox approval would bypass the Phase 5 safety
  gate. The Decision record explicitly says the request is staged, not
  authorized, and Action always waits.
- Adding the golden route to the coordinator would recreate a fixed pipeline.
  Every route choice remains inside a capability result and existing generic
  coordinator tests remain unchanged.
- Filling missing content would create an unsupported effect. Perception keeps
  the original payload and Analysis records an explicit information need.
- A registered Network implementation could be mistaken for a required stage.
  Route tests assert that the filesystem scenario never invokes it.

### Assumptions

- Phase 4 inputs are canonical, structured-clone-compatible records.
- Presence and primitive type checks are sufficient before policy performs the
  sandbox and resource-limit checks in Phase 5.
- The current wait behavior retains the source active capability. Automatic
  event matching and route changes on resume remain later runtime work.
- Goal lifecycle changes remain outside capability-local Phase 4 behavior.

## Completion record

### Completed work

- Added and exported deterministic Perception, Analysis, Network, Decision,
  and effect-free Action implementations.
- Added canonical demo-file assessment, intent, and write-parameter types plus
  stable scenario constants.
- Added atomic five-capability registration and cleanup.
- Added four focused executable tests covering complete, incomplete, invalid,
  and Network-placeholder behavior.
- Preserved the legacy application path and deferred every real effect.

### Validation

- `git diff --check` — passed.
- Local Markdown link/path inspection — passed; 94 local links across 37
  Markdown files checked.
- `pnpm --filter @panda/core test` — passed; 26 core tests passed, including
  four focused Phase 4 tests, eight Phase 3 coordinator tests with four nested
  cases, six execution-store tests, and four legacy runtime tests.
- `pnpm build` — passed for all workspace projects.
- `pnpm typecheck` — passed for all workspace projects.
- `pnpm test` — passed; 5 shared contract tests and 26 core tests passed, with
  all remaining package scripts successful.
- `.env`, generated wallets, and build outputs — confirmed ignored and absent
  from the change set.
- Format/lint commands — unavailable because none are configured.

The dashboard build emitted its existing Node experimental warning while
loading the TypeScript Tailwind configuration; the build completed.

### Remaining work

No Phase 4 work remains. Phase 5 must add independent transition/effect policy,
enforce the execution-specific filesystem sandbox and resource limits, record
policy evidence, and guarantee that denied requests never reach a connector.
