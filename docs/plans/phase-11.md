# Phase 11 Plan: Release Hardening

**Status:** Complete (2026-08-10)

**Prerequisite:** [Phase 10 — Remove the Legacy Execution Model](phase-10.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#15-phase-11-release-hardening)

## Objective and scope

Turn the completed canonical runtime into a verifiable v0.1 release baseline.
The release must prove the golden filesystem execution and every frozen
non-success/boundary fixture through a daemon-owned end-to-end matrix, make the
complete causal chain mechanically reconstructable, and document exactly what
v0.1 supports, delegates to replaceable implementations, and does not support.

This phase hardens and describes the existing bounded product. It does not
broaden the effect surface or introduce a second execution model.

## Starting state

Phases 0 through 10 provide:

- canonical versioned records and five capability identities;
- execution-scoped Goal, Execution, and append-only trace stores;
- dynamic coordination with invocation, deadline, cancellation, and policy
  boundaries;
- deterministic Perception, Analysis, Network, Decision, and Action
  implementations for the frozen filesystem scenario;
- a real sandboxed filesystem connector plus independent effect observation;
- canonical daemon, SDK, WebSocket, example, and trace-dashboard surfaces; and
- focused unit/integration coverage for every required behavior.

The daemon integration suite proves success, event delivery, concurrency,
errors, and the retired route. The missing-information, injected denial,
connector-failure, verification-failure, invocation-limit, and causal-chain
behaviors are currently distributed across focused core tests rather than
named together as the release acceptance matrix.

## Non-goals

- Durable persistence, restart recovery, or a production database.
- Authentication or exposure beyond a trusted loopback development host.
- New effects, general planning, retries, automatic wait resumption, or LLM
  integration.
- Network transport behavior for the Network capability.
- Distributed or multi-agent execution, plugins, MCP, or cloud deployment.
- Generalizing the deterministic v0.1 fixture into a production agent product.
- Adding a formatter, linter, coverage service, or deployment pipeline.

## Implementation tasks

1. Extend daemon runtime construction with narrow injectable release-fixture
   boundaries for the execution policy, Action connector, effect observer, and
   coordinator invocation limit. Defaults must remain the production v0.1
   components.
2. Add a daemon-level release acceptance suite covering eight required cases:
   successful sandboxed execution; missing-information wait; effect-policy
   denial; pre-effect connector failure; verification mismatch; invocation
   limit; concurrent isolation; and complete correlation/causation
   reconstruction.
3. Assert every non-success fixture avoids false Goal achievement and records
   its decisive wait, denial, failure, or verification evidence.
4. Assert the successful trace proves signal acceptance, Goal creation,
   dynamic capability routing, explained Decision, policy authorization, real
   Action, independent observation, criteria verification, termination, and
   authoritative retrieval.
5. Add a v0.1 release profile documenting process-local durability, restart
   behavior, filesystem sandbox boundaries and limitations, supported
   capabilities/actions/statuses/records/interfaces, and explicitly unsupported
   production features.
6. Map framework requirement groups to **implemented**, **delegated**, or **not
   supported in v0.1**, citing executable or architectural evidence without
   claiming support that the bounded fixture does not provide.
7. Align root release metadata with v0.1 and codify the verified Node/pnpm
   baseline for reproducible contributor setup.
8. Update the README, onboarding, documentation index, implementation plan, and
   progress record so Phase 11 and the release profile are discoverable.
9. Validate a frozen install, build, typecheck, full suite, standalone daemon,
   SDK example, dashboard production build, API/trace reads, production source
   searches, Markdown links, and Git hygiene.

## End-to-end acceptance matrix

| Case | Boundary fixture | Required result |
| --- | --- | --- |
| Golden path | Default daemon components | File bytes match; Goal achieved only after independent verification; Execution succeeded |
| Missing information | Request omits `content` | Execution waiting, Goal awaiting human, no Decision/Action/connector record |
| Policy denial | Effect evaluation returns deterministic deny | No connector invocation; final Decision and Goal/Execution failed |
| Connector failure | Filesystem connector returns pre-effect failure | One attempted invocation, zero completed effects, no verification, final failure |
| Verification failure | Observer returns mismatched content and hash | Completed Action remains recorded but Goal and Execution fail |
| Invocation limit | Coordinator limit reached before requested next invocation | Structured `INVOCATION_LIMIT_REACHED` failure and no false success |
| Concurrency | Two overlapping API requests target the same relative path | Distinct IDs, workspaces, content, correlations, and traces |
| Trace reconstruction | Retrieve a successful trace through HTTP | Consecutive sequences; one root; every cause resolves to an earlier same-execution record; release-gate records present |

## Release documentation decisions

### Durability

The in-memory stores are the implemented v0.1 adapters. Restart loss is a
documented limitation, not an implicit promise of durability. Store ports and
runtime boundaries permit future durable implementations without redefining
canonical records.

### Sandbox

The only supported effect is one policy-authorized UTF-8 write to a relative
regular-file path below `.panda/runs/<executionId>/workspace` (or the configured
data directory). The policy and connector reject absolute/traversal/root paths,
symbolic-link and multi-link escapes, identity mismatch, unsupported actions or
connectors, invalid encoding, and content beyond the configured 65,536-byte
limit. The sandbox is defense in depth for the frozen local fixture, not a
general operating-system isolation boundary.

### Requirements status vocabulary

- **Implemented:** executable v0.1 behavior directly satisfies the bounded
  requirement profile.
- **Delegated:** the architecture defines a replaceable port or policy, while
  the local deterministic adapter supplies only the v0.1 implementation.
- **Not supported:** no v0.1 implementation is claimed; the item remains
  explicitly deferred.

## Acceptance criteria

- All eight release cases run automatically from the daemon test script.
- The full matrix uses isolated temporary data directories and never writes its
  fixture into the repository.
- Default daemon behavior is unchanged by fixture injection.
- Only verified matching environmental state yields Goal `achieved` and
  Execution `succeeded`.
- Every material successful trace record has one execution/goal/correlation
  identity, a consecutive sequence, and a root or resolvable earlier cause.
- The release profile lists the exact supported capability, effect, statuses,
  trace categories, API/SDK surfaces, durability, sandbox, and non-goals.
- Framework requirements are conservatively classified with evidence.
- Root and workspace metadata consistently identify v0.1 and the documented
  Node/pnpm baseline.
- Frozen install, build, typecheck, all tests, daemon, SDK example, dashboard,
  documentation links, source searches, and Git hygiene pass.

## Validation plan

- Run `pnpm install --frozen-lockfile`.
- Run `pnpm build`, `pnpm -r typecheck`, and `pnpm test`.
- Run `pnpm --filter @panda/daemon test` and confirm all eight release cases.
- Start a built daemon with an isolated data directory and port, then run
  `examples/basic-run.ts` through the typed SDK and retrieve the API trace.
- Build the production dashboard and verify it consumes the canonical API
  contracts; repeat browser interaction QA if the in-app browser integration
  initializes.
- Search production code/examples for retired legacy symbols and unsupported
  effect implementations.
- Run `git diff --check` and local Markdown link/path validation.
- Confirm `.env`, wallets, `.panda`, temporary fixtures, and generated build
  output are absent from the commit.

## Risks and assumptions

### Risks

- Fixture injection could accidentally become a second production assembly
  path. Options remain narrow and defaults instantiate the same components as
  before.
- A broad requirements matrix can overstate completeness. Classifications are
  limited to the frozen scenario and distinguish delegated architecture from
  implemented behavior.
- Filesystem checks reduce path-escape risk but do not provide container,
  process, user, quota, or host isolation. The release profile states that
  limitation explicitly.
- The dashboard browser integration may repeat the Phase 9 bootstrap failure;
  production bundling and helper tests remain required, and any visual QA
  limitation must be recorded exactly.

### Assumptions

- v0.1 is a local deterministic architecture proof, not a production service.
- Node.js 20+ and pnpm 9.15.1 remain the supported contributor baseline.
- The existing frozen fixture and 65,536-byte content limit remain unchanged.
- Historical phase plans remain completion evidence and are not rewritten.

## Completion record

Phase 11 completed the v0.1 release baseline:

- added narrow daemon runtime injection boundaries for release policy,
  connector, observer, and invocation-limit fixtures while preserving the
  default production assembly;
- added eight daemon-boundary release tests for success, missing information,
  policy denial, connector failure, verification mismatch, invocation limit,
  concurrency, and complete causal reconstruction;
- added the v0.1 release profile with exact capability, effect, status, trace,
  API/SDK, durability, sandbox, security, and unsupported-feature scope;
- explicitly classified all 153 normative framework requirement IDs as
  implemented, delegated, or not supported for the bounded v0.1 profile;
- aligned the private root package to version `0.1.0`, Node.js `>=20`, and pnpm
  `9.15.1`; and
- updated the README, documentation index, onboarding, implementation plan, and
  progress record for the completed release baseline.

Validation completed:

- `pnpm install --frozen-lockfile` passed.
- `pnpm build` and `pnpm -r typecheck` passed for every workspace.
- `pnpm test` passed 88 executable tests: 5 shared, 62 core, 3 SDK, 13 daemon,
  and 5 dashboard; CLI typechecking also passed.
- All eight named release-matrix tests passed through the daemon HTTP/runtime
  boundary using isolated temporary data directories.
- A built isolated daemon plus `examples/basic-run.ts` produced Execution
  `succeeded`, Goal `achieved`, verification `verified`, and a 43-record trace
  ending in `execution.succeeded`; an independent HTTP read confirmed the same
  state and trace.
- `pnpm start` served `/health` with daemon version `0.1.0`, and the CLI version
  command returned `0.1.0`.
- The dashboard production bundle and five trace-presentation tests passed.
- A machine check confirmed all 153 normative requirement IDs appear in the
  release classification.
- Production legacy-symbol/unsupported-effect searches, `git diff --check`, and
  local-path validation across 45 Markdown files passed.
- `.env`, generated wallets, repository-local `.panda`, temporary sandboxes,
  and generated build output were absent from the change set.
- No formatter or linter was run because the repository configures neither.

The dashboard build emitted the existing successful Node experimental warning
while Tailwind loaded its TypeScript configuration through CommonJS. The
required in-app browser integration failed during bootstrap with `Cannot
redefine property: process`, including after one clean-session retry. Its skill
prohibits substituting another browser driver, so live visual/interaction QA
remains environment-limited; repeat it when that integration initializes.

The two isolated Phase 11 validation directories were moved to the user Trash
as `panda-phase11.VxVxeF` and `panda-phase11-start.TjYyNZ`; they remain
recoverable.
