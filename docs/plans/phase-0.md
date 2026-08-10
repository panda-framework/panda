# Phase 0 Plan: Freeze the v0.1 Contract

**Status:** Complete

**Prerequisites:** None

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#4-phase-0-freeze-the-v01-contract)

## Objective and scope

Freeze the product-level acceptance contract for PANDA v0.1 before canonical
runtime contracts are introduced. The phase will define the exact golden-path
request, expected dynamically selected routes, failure fixtures, sandbox and
effect boundary, trace requirements, durability limitation, and release-test
success and failure criteria.

This is a documentation-only phase. It establishes observable behavior that
later phases can implement without changing the current scaffold or treating
the documented route as a mandatory PANDA loop.

## Current state assessment

The architecture already fixes the five canonical capabilities as Perception,
Analysis, Network, Decision, and Action. It also requires dynamic transitions,
explicit goals, structured outcomes and failures, policy-gated effects,
correlatable records, responsibility-specific connectors, and model
independence.

The v0.1 implementation plan already selects a deterministic filesystem demo
and orders later implementation work safely. Phase 0 is nevertheless
incomplete because its scenarios, sandbox contract, trace categories,
durability limitation, and exact acceptance expectations are listed as
deliverables rather than defined as a frozen contract. The latest repository
commit also identifies Phase 0 review and approval as the next step.

Existing TypeScript implements the legacy seven-state scaffold, an in-memory
observation bus, a simulated filesystem connector, and a predetermined
`runPandaLoop`. Phase 0 must not alter or endorse those behaviors; Phase 1 will
add canonical contracts alongside them, and later phases will migrate callers.

## Non-goals

- Adding or changing TypeScript contracts, runtime behavior, APIs, or tests.
- Removing `PandaStateName`, `runPandaLoop`, or other compatibility code.
- Performing real filesystem writes.
- Implementing policy, coordination, persistence, tracing, or connectors.
- Requiring an LLM, model provider, broker, daemon, database, or durable store.
- Defining a universal capability order or requiring Network in the demo.
- Resolving implementation choices assigned to later phases, such as concrete
  class layout, serialization library, hash library, or configurable size
  limits.

## Implementation tasks and affected files

1. Add `docs/v0.1-scope-contract.md` with the frozen Phase 0 contract:
   canonical capabilities, fixtures, dynamic routes, sandbox rules, trace
   categories and common fields, durability, and acceptance criteria.
2. Update `docs/v0.1-implementation-plan.md` to mark Phase 0 complete and link
   its frozen contract without changing later-phase scope.
3. Update `docs/README.md` so the contract, plan, and progress record are
   discoverable.
4. Add `docs/progress.md` with the completed work, decisions, validation, and
   remaining work for Phase 0 and the next phase.
5. Update this plan after implementation with completed tasks, decisions,
   validation results, and remaining phase work.

## Acceptance criteria

- The five canonical capabilities are named exactly and described as
  independently selectable responsibilities.
- The valid-input, missing-information, policy-denial, connector-failure, and
  verification-failure fixtures have explicit inputs, routes, effects, and
  expected execution/goal states.
- The golden path uses only an execution-scoped sandbox and
  `filesystem.write`; dispatch success alone cannot satisfy the goal.
- The required causal trace categories and common identity fields are fixed.
- The initial execution store is explicitly in-memory and not restart-safe.
- Success, waiting, and failure expectations are precise enough for later
  automated tests without another product decision.
- Network remains registered/available but is not forced into the golden path.
- No production source or current application path changes.

## Test and validation plan

- Run `git diff --check` and inspect all documentation links and relative paths.
- Run the repository's existing `pnpm build`, `pnpm typecheck`, and `pnpm test`
  commands to confirm the documentation-only change does not coincide with a
  broken baseline.
- Confirm no lint or format script exists before reporting those checks as not
  available.
- Confirm the final diff contains only Phase 0 documentation and no ignored
  credential or generated files.

No focused executable test is added in this phase because Phase 0 intentionally
changes no executable contract or behavior. The frozen fixtures are the input
for focused tests in Phases 1 through 11.

## Risks, assumptions, and unresolved questions

### Risks

- A route fixture could be misread as a fixed framework loop. The contract will
  state that each route is a scenario expectation produced by capability
  results and policy, not a global sequence.
- Over-specifying later implementation mechanics could couple the framework to
  one runtime. The contract will freeze observable behavior while leaving
  storage, coordination, and provider choices open.
- Treating connector acceptance as success could violate goal verification.
  The golden path will require an independently observed effect.

### Assumptions

- The exact request already selected in the v0.1 implementation plan is the
  approved golden-path fixture.
- The execution sandbox layout already proposed for Phase 6 is the v0.1
  boundary: `.panda/runs/<executionId>/workspace`.
- A missing-information execution waits without an effect; deterministic
  denial and failure fixtures terminate as failed after Decision records that
  no safe v0.1 recovery remains.

### Unresolved questions

There are no blocking product questions for Phase 0 after freezing the
observable fixtures. Language-level shapes for the canonical records,
pre-1.0 compatibility, and concrete runtime APIs remain intentionally assigned
to Phase 1 and later phases; they must preserve this contract.

## Completion record

### Completed work

- Added the frozen v0.1 scope contract covering the golden path, four required
  non-success fixtures, sandbox/effect boundaries, status rules, trace fields,
  durability, and release acceptance.
- Marked Phase 0 complete in the dependency-ordered implementation plan.
- Added the project progress record and linked the new documentation from the
  documentation index.
- Kept all production source, tests, package configuration, and the legacy
  application path unchanged.

### Technical decisions

- Scenario routes are asserted outcomes of dynamic capability selection, not
  coordinator logic.
- A successful effect must be observed independently and verified against the
  goal before success.
- The policy-denial fixture injects a deterministic policy result; invalid path
  variants remain focused Phase 5 tests.
- The v0.1 store is explicitly in-memory and restart-unsafe.

### Validation

- `git diff --check` — passed.
- Local Markdown link/path inspection — passed.
- `pnpm build` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — passed (4 core tests; all package scripts successful).
- Format/lint commands — unavailable because none are configured in the
  repository.

### Remaining work

No Phase 0 work remains. Phase 1 is the next incomplete phase and must add the
canonical contracts without changing current production behavior.
