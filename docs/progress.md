# PANDA Implementation Progress

## Current status

- **Latest completed phase:** Phase 13 — Authenticated API principals and guarded network exposure
- **Completed:** 2026-08-10
- **Release baseline:** PANDA v0.1 complete for its frozen local profile
- **Current development baseline:** Post-v0.1 local durability and authenticated API boundary complete
- **Phase plan:** [Phase 13 Plan](plans/phase-13.md)
- **Frozen release surface:** [PANDA v0.1 Release Profile](v0.1-release-profile.md)
- **Frozen acceptance contract:** [PANDA v0.1 Frozen Scope Contract](v0.1-scope-contract.md)

## Phase 13 completion

### What was completed

- Added validated opt-in bearer authentication for execution HTTP and WebSocket
  resources, a uniform structured `401`, and public health reporting of only the
  active authentication mode.
- Resolved bearer credentials to a canonical service principal and propagated
  that identity through signal provenance, Goal ownership, execution contexts,
  connector boundaries, and effect-policy evidence without retaining the token.
- Required a valid principal at the filesystem effect boundary while assigning
  deterministic system principals to embedded and unauthenticated loopback
  operation.
- Replaced permissive CORS with an exact origin allowlist and local dashboard
  defaults.
- Added a process startup guard that refuses a non-loopback listener unless
  bearer authentication is configured.
- Added typed SDK `apiToken` support, security configuration helpers, and API,
  WebSocket, CORS, principal, policy, and credential non-retention tests.
- Updated the README, example, onboarding, architecture/scaffold notes,
  documentation index, implementation plan handoff, and this progress record
  without changing the historical v0.1 release profile.

### Security evidence

The Phase 13 boundary proves that:

```text
Bearer credential
  -> one configured service principal
  -> Goal owner + capability context
  -> connector invocation context
  -> effect policy principal evidence
  -> no token in canonical trace

non-loopback host + no credential
  -> startup rejected before listen
```

Health remains public and discloses mode `none` or `bearer`, not the credential
or principal. Missing, malformed, and incorrect credentials receive the same
Bearer challenge. CORS permits only exact configured HTTP(S) origins.

### Validation results

- `pnpm --filter @panda/core test` — passed 67 core tests, including
  principal-required effect policy and connector coverage.
- `pnpm --filter @panda/sdk test` — passed 4 SDK tests, including bearer header
  propagation without request-body retention.
- `pnpm --filter @panda/daemon test` — passed 25 daemon tests, including four
  security-configuration tests, authenticated HTTP/WebSocket coverage, CORS,
  the eight-case release matrix, and restart recovery.
- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm -r typecheck`, and
  `pnpm test` — passed; the full suite contains 106 executable tests plus CLI
  typechecking.
- Built daemon plus typed SDK process check — passed with authentication
  `bearer`, unauthorized status `401`, Execution `succeeded`, Goal `achieved`,
  service owner and policy principal `process-operator`, 43 trace records, and
  no retained token.
- Built daemon non-loopback guard — passed with process exit `1` before listen
  when authentication was absent.
- `git diff --check` — passed; 127 local Markdown paths across 47 files resolve;
  `.env`, `.panda`, generated wallets, generated output, and temporary runtime
  state are ignored or absent from the change set; no GitHub token pattern is
  present in the diff.
- Dashboard production build — passed with the existing Node experimental
  warning for its Tailwind TypeScript configuration. Live browser QA was not
  run because Phase 13 changes no dashboard code and authenticated dashboard
  login/token handling is explicitly deferred.
- Format and lint — not run because neither workflow is configured.

## Phase 12 completion

### What was completed

- Added versioned `FileExecutionStore` and `FileGoalStore` adapters that replace
  state snapshots atomically and rehydrate canonical identity, trace sequence,
  causation, and Goal revision after restart.
- Made file persistence the daemon default below `<data>/state`, retained
  explicit `memory` mode through `PANDA_PERSISTENCE`, and exposed the active mode
  through daemon/SDK health.
- Preserved terminal and waiting work across restart without replaying stored
  subscriber events or automatically resuming waits, and finalized active
  Executions whose Goals had already reached a terminal state.
- Added a startup recovery policy for persisted `pending` and `running` work:
  append `PROCESS_RESTART_INTERRUPTED`, fail the Goal and Execution causally,
  classify uncertain authorized effects as `unknown`, and never repeat Action.
- Rejected malformed, incompatible, causally invalid, duplicate, and incomplete
  persisted state before the daemon accepts work.
- Updated the README, dashboard wording, onboarding, architecture/scaffold
  notes, documentation index, implementation plan handoff, and this progress
  record without retroactively broadening the v0.1 release profile.

### Durability evidence

The restart suite proves that:

```text
terminal Execution + Goal + 43-record trace
  -> daemon close
  -> same data directory reopened
  -> identical API-visible canonical history

waiting Execution + awaiting-human Goal
  -> daemon restart
  -> still waiting
  -> no automatic Action or recovery failure

active Action execution
  -> process interruption
  -> startup detects unfinished work
  -> effect classified conservatively
  -> Goal and Execution failed explicitly
  -> no Action replay
```

Corrupt JSON, unsupported persistence versions, and incomplete Execution/Goal
pairs prevent startup. Rehydrated traces continue at the next sequence and
subscribers receive only new commits.

### Validation results

- `pnpm --filter @panda/core test` — passed 66 core tests, including four
  file-store persistence cases.
- `pnpm --filter @panda/daemon test` — passed 19 daemon tests, including the
  eight-case v0.1 release matrix and six restart/persistence cases.
- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm -r typecheck`, and
  `pnpm test` — passed; the full suite contains 98 executable tests plus CLI
  typechecking.
- Built daemon process restart plus typed SDK/API detail and trace reads —
  passed with persistence `file`, Execution `succeeded`, Goal `achieved`, and 43
  consecutive records ending in `execution.succeeded`.
- `git diff --check` — passed; 123 local Markdown paths across 46 files resolve;
  `.env`, `.panda`, generated wallets, generated output, and temporary runtime
  state are ignored or absent from the change set.
- Dashboard production build — passed with the existing Node experimental
  warning for its Tailwind TypeScript configuration.
- Required in-app browser QA — attempted twice but blocked before navigation by
  the existing `Cannot redefine property: process` integration error; no
  alternate browser driver was substituted.
- Format and lint — not run because neither workflow is configured.

## Phase 11 completion

### What was completed

- Added narrow runtime injection boundaries for release fault fixtures without
  changing the daemon's default canonical assembly.
- Added eight daemon-boundary end-to-end tests for the golden path,
  missing-information wait, policy denial, pre-effect connector failure,
  verification mismatch, invocation limit, concurrent isolation, and complete
  causal reconstruction.
- Added the v0.1 release profile documenting exact capabilities, effect,
  statuses, trace records, API/SDK surfaces, process-local durability, restart
  loss, filesystem sandbox boundary, security limits, and unsupported features.
- Classified all 153 normative framework requirement IDs as implemented,
  delegated, or not supported for this bounded release.
- Aligned the private root package with v0.1 and recorded Node.js `>=20` plus
  pnpm `9.15.1` as the repository baseline.
- Updated the README, onboarding, documentation index, implementation plan, and
  phase records to present one completed release story.

### Release gate evidence

The automated successful scenario proves, in one execution:

```text
signal accepted
  -> goal created
  -> capability route selected dynamically
  -> decision and rationale recorded
  -> effect policy allowed
  -> real action executed
  -> effect independently observed
  -> success criteria verified
  -> goal achieved
  -> execution terminated
  -> complete causal trace retrieved
```

The non-success matrix proves that missing input waits without Action, denial
does not invoke a connector, pre-effect failure cannot claim an effect,
verification mismatch cannot achieve the Goal, invocation limits terminate
explicitly, and concurrent work remains isolated.

### Validation results

- `pnpm install --frozen-lockfile` — passed.
- `pnpm build` — passed for every workspace.
- `pnpm -r typecheck` — passed for every workspace.
- `pnpm test` — passed 88 executable tests: 5 shared, 62 core, 3 SDK, 13
  daemon, and 5 dashboard; CLI typechecking also passed.
- Built daemon plus typed SDK example and independent API/trace read — passed
  with Execution `succeeded`, Goal `achieved`, verification `verified`, and 43
  consecutive records ending in `execution.succeeded`.
- `pnpm start` health and CLI version — passed at `0.1.0`.
- Normative-requirement classification coverage — all 153 IDs present.
- Production legacy-symbol and unsupported-effect searches — clean.
- `git diff --check` — passed.
- Local Markdown link/path inspection — passed for 45 files.
- `.env`, generated wallets, repository-local `.panda`, temporary sandboxes,
  and generated output — absent from the change set.
- Format and lint — not run because neither workflow is configured.

The dashboard production build completed with the existing Node experimental
warning for its Tailwind TypeScript configuration. The in-app browser plugin
failed before navigation with `Cannot redefine property: process`, including
after a clean retry. Its required workflow prohibits another browser driver,
so repeat live visual/interaction QA when the integration initializes.

## Completed implementation sequence

Phases 0 through 11 froze the acceptance contract, introduced canonical
contracts, execution-scoped stores and causal traces, dynamic coordination,
deterministic capabilities, transition/effect policy, a real sandboxed Action,
independent verification, daemon/API/SDK integration, the canonical dashboard,
legacy-model removal, and the hardened v0.1 release. Phase 12 then added durable
local state and safe restart handling. Phase 13 added an authenticated API
principal boundary and guarded network exposure. Detailed records remain linked
from the [documentation index](README.md).

## Follow-up direction

v0.1 remains complete only for the explicitly bounded release profile, while
Phases 12 and 13 are post-release development increments. Future work should
continue from the delegated and unsupported requirement lists. Highest-impact
areas are general planning and bounded recovery, real Network transports,
human approval/control APIs, multi-principal resource authorization, TLS and
credential lifecycle, production metrics/privacy/security controls, and
replacing the local file adapter with a transactional multi-process store when
deployment needs require it.

Beginning with the next active phase or release, progress updates should also
record the applicable results and initial baselines from the [Guiding
Principles and KPI Scorecard](guiding-principles-kpis.md). Historical phase
evidence remains valid, but should not be relabeled as a KPI measurement unless
it includes the defined scope, denominator, target, and evidence.
