# PANDA Implementation Progress

## Current status

- **Latest completed phase:** Phase 3 — Add the dynamic coordinator
- **Completed:** 2026-08-10
- **Next phase:** Phase 4 — Implement deterministic PANDA capabilities
- **Phase plan:** [Phase 3 Plan](plans/phase-3.md)
- **Frozen baseline:** [PANDA v0.1 Frozen Scope Contract](v0.1-scope-contract.md)

## Phase 3 completion

### What was completed

- Added capability invocation and result contracts, the `CapabilityRegistry`
  port, and an ownership-safe in-memory registry to `@panda/core`.
- Added an execution-scoped coordinator that uses capability-produced
  `NextStep` values instead of a fixed route.
- Added support for self-transitions, non-adjacent invocation, wait/resume, and
  successful, failed, or cancelled termination.
- Passed each capability product to its dynamically selected successor and
  preserved prior invocation IDs in resumed execution context.
- Recorded invocation start/completion, transition request, transition commit
  or rejection, wait, structured failure, and termination in one causal trace.
- Rejected unknown capabilities, duplicate or non-canonical registrations,
  malformed results, stale execution updates, and overlapping coordination of
  the same execution.
- Enforced configurable invocation limits, execution deadlines, and
  cancellation signals without adding scenario-specific routing.
- Retained the legacy application path unchanged for the additive migration.

### Key technical decisions

- The registry and coordinator live in `@panda/core` and consume the Phase 1
  contracts plus the Phase 2 `ExecutionStore` port.
- A canonical execution must select its initial active capability. Each
  committed `invoke` transition selects the next active capability and passes
  the previous output as its input.
- A `wait` transition keeps the source capability selected. A later call can
  resume that same execution, and invocation history is reconstructed from its
  stored trace.
- Requested and committed or rejected transitions are distinct canonical
  records and distinct trace entries. Their causation links continue from the
  invocation through the transition outcome to the next material record.
- Invocation errors and runtime bounds become structured `Failure` data and
  explicit terminal records; unknown targets and exhausted invocation budgets
  also retain rejected transition evidence.
- The coordinator compares material execution state after every asynchronous
  invocation. A stale result is recorded as rejected and cannot overwrite the
  newer state.
- Automatic event matching for `resumeOn`, policy decisions, retry routing,
  durable scheduling, and capability-specific products remain later phases.

### Validation results

- `git diff --check` — passed.
- Local Markdown link/path inspection — passed; 88 local links across 36
  Markdown files checked.
- `pnpm --filter @panda/core test` — passed; 22 core tests passed, including
  eight focused Phase 3 tests with four nested failure/boundary cases, six
  execution-store tests, and four legacy runtime tests.
- `pnpm build` — passed for all workspace projects.
- `pnpm typecheck` — passed for all workspace projects.
- `pnpm test` — passed; 5 shared contract tests and 22 core tests passed, and
  all remaining package scripts completed successfully.
- Format and lint — not run because the repository defines no format or lint
  script or configured tool.

The dashboard build emitted the existing Node experimental warning while
loading the TypeScript Tailwind configuration through CommonJS; the build
completed successfully.

### Remaining Phase 3 work

None. Phase 3 intentionally does not wire the coordinator into runtime callers
or implement scenario behavior. Those responsibilities remain ordered behind
the deterministic capabilities and later daemon integration phases.

## Previous phases

Phases 0 through 2 froze the v0.1 product baseline, added the canonical
contract family, and established independent in-memory execution state with
append-only causal traces. Their full completion records remain in the
[Phase 0 Plan](plans/phase-0.md), [Phase 1 Plan](plans/phase-1.md), and
[Phase 2 Plan](plans/phase-2.md).

## Next phase

Phase 4 implements deterministic Perception, Analysis, Network, Decision, and
Action capabilities. Complete and incomplete inputs must produce different
routes, decisions must retain evidence and rationale, and the filesystem
scenario must remain effect-free until the Phase 5 policy gate is complete.
