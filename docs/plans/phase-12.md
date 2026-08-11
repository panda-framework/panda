# Phase 12 Plan: Durable Local State and Safe Restart Recovery

**Status:** Complete (2026-08-10)

**Prerequisite:** [Phase 11 — Release Hardening](phase-11.md)

**Phase source:** The first highest-impact item in the
[post-v0.1 follow-up direction](../progress.md#follow-up-direction)

## Objective and scope

Preserve canonical Executions, Goals, and causal traces across local daemon
restarts, while making restart handling safe and explicit. Phase 12 adds a
versioned file-backed adapter as the daemon default, validates persisted state
before use, preserves terminal and waiting work, and terminates work interrupted
while active without replaying an Action whose effect may be uncertain.

This is the first post-v0.1 implementation phase. It extends the current
development baseline without rewriting the frozen v0.1 release profile or
claiming production database, distributed scheduling, or exactly-once support.

## Starting state

Phase 11 completed the v0.1 release with replaceable `ExecutionStore` and
`GoalStore` ports, append-only causal traces, and in-memory adapters. The daemon
lost every Goal, Execution, trace, and wait on process exit. It also had no
startup policy for an Execution persisted while `pending` or `running`.

The canonical Action can cross a real filesystem boundary. Restart recovery
therefore must not blindly re-invoke Action: a crash can occur after an effect
but before its Outcome or verification is durably recorded.

## Non-goals

- A production database, write-ahead log, broker, replication, or backup.
- Multi-process or distributed writers sharing one data directory.
- Exactly-once Action execution, transactionally coupling state to an external
  effect, automatic retry, compensation, or rollback.
- Automatic resumption of waits or a human resume API.
- Migration between canonical schema versions or persistence versions.
- Encryption, retention/deletion controls, authentication, or multi-tenancy.

## Implementation tasks

1. Add `FileExecutionStore` and `FileGoalStore` adapters behind the existing
   store ports while preserving the in-memory adapters for tests and explicitly
   ephemeral daemon operation.
2. Store each Execution together with its complete ordered trace in one
   versioned JSON envelope, and each Goal in a versioned JSON envelope below
   `<data>/state`.
3. Replace snapshots through a same-directory temporary file, file flush,
   atomic rename, and directory flush where the platform permits it. Restrict
   newly created state directories and files to owner access.
4. Rehydrate canonical state at startup and continue per-execution trace
   sequence assignment without replaying historical subscriber events.
5. Reject malformed JSON, invalid canonical identity, non-consecutive traces,
   invalid causal links, duplicate IDs, unsupported persistence versions, and
   incomplete Execution/Goal pairs before recovery.
6. Make file persistence the daemon default and expose the active mode in
   `GET /health`. Support explicit ephemeral operation with
   `PANDA_PERSISTENCE=memory`.
7. Preserve `succeeded`, `failed`, `cancelled`, and `waiting` Executions exactly
   across startup. Do not automatically resume a wait. If an active Execution's
   Goal had already reached a terminal state before interruption, finalize the
   Execution to the matching outcome without replay.
8. For any other persisted `pending` or `running` Execution, append a structured
   `PROCESS_RESTART_INTERRUPTED` failure, fail its Goal, append terminal evidence,
   and mark the Execution failed without invoking a capability or connector.
9. Classify the interrupted effect as `unknown` when Action was authorized but
   no later Outcome was durable; otherwise retain the latest known effect status.
10. Update the SDK health type, dashboard wording, README, onboarding,
    architecture notes, scaffold record, implementation progress, and
    documentation index. Ignore the default `.panda` state directory so
    plaintext local records cannot be staged accidentally.

## Restart policy

| Durable state at startup | Phase 12 behavior |
| --- | --- |
| Execution `succeeded`, `failed`, or `cancelled` | Rehydrate unchanged; HTTP detail and trace remain authoritative |
| Execution `waiting` | Rehydrate unchanged; retain Goal and wait trace; do not resume automatically |
| Execution `pending` or `running`, Goal already terminal | Finalize the matching Execution outcome with causal termination evidence; never replay Action |
| Execution `pending` or `running`, Goal not terminal | Fail explicitly with causal recovery records; never replay Action |
| Unsupported persistence version | Refuse startup before loading runtime state |
| Corrupt or incomplete state | Refuse startup with a typed persistence/runtime error |
| `PANDA_PERSISTENCE=memory` | Start with empty ephemeral stores and retain the v0.1 restart-loss behavior |

## Local durability boundary

The default data layout is:

```text
.panda/
├── state/
│   ├── executions/   # one atomic Execution + trace snapshot per Execution
│   └── goals/        # one atomic current snapshot per Goal
└── runs/              # existing per-Execution effect workspaces
```

The storage envelope version is independent of the canonical record schema
version. Version `1` is the only accepted local persistence format.

This adapter is for one daemon process. JavaScript operations are synchronous at
the commit boundary, but there is no inter-process lock or cross-file
transaction. An operating-system or power failure between the Execution and
Goal file commits can leave an incomplete pair; the next startup detects that
condition and stops rather than guessing. JSON state contains request content,
evidence, and trace payloads in plaintext. Operators must protect and back up
the data directory according to their environment.

## Acceptance criteria

- A successful execution remains retrievable with the same 43-record trace
  after the daemon is closed and recreated on the same data directory.
- A missing-information execution remains `waiting` with an `awaiting-human`
  Goal and gains no recovery or Action records after restart.
- A seeded active Action execution becomes failed on restart with
  `PROCESS_RESTART_INTERRUPTED`, an `unknown` effect, consecutive causal records,
  and no repeated connector invocation.
- Active Execution state whose Goal was already terminal finalizes to the
  matching outcome without adding a false interruption failure.
- Rehydrated trace appends continue at the next sequence number and notify
  subscribers only for new commits.
- Corrupt, incompatible, and incomplete persisted state is rejected before the
  daemon accepts requests.
- Explicit memory mode remains available and reports itself through health.
- The v0.1 golden and non-success release matrix remains green with the durable
  adapters as the daemon default.

## Validation plan

- Run the file-store tests for rehydration, sequence continuation, Goal revision,
  corrupt-state rejection, and incompatible-version rejection.
- Run the daemon restart tests for terminal, waiting, interrupted, already
  terminal Goal, incomplete, and memory-mode behavior.
- Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm -r typecheck`, and
  `pnpm test`.
- Start the built daemon against an isolated data directory, create an execution
  through the typed SDK, restart the daemon, and retrieve the same detail and
  trace through HTTP.
- Run `git diff --check`, local Markdown link/path validation, and Git hygiene
  checks for `.env`, `.panda`, wallets, generated output, and temporary state.

## Risks and assumptions

### Risks

- Synchronous full-trace snapshots trade throughput for a small, inspectable,
  atomic local adapter. Larger workloads need a database or durable log adapter.
- The Goal and Execution stores cannot commit as one transaction. Startup
  validation turns partial cross-store state into an explicit failure instead of
  silently accepting it.
- A crash after an external effect but before its Outcome can leave effect state
  uncertain. Recovery records `unknown` and does not replay the Action.
- State is plaintext and inherits host filesystem security and backup behavior.

### Assumptions

- One daemon process owns a data directory at a time.
- The local filesystem provides atomic same-directory rename.
- Waiting executions are valuable durable evidence even though the current API
  does not resume them.
- Historical v0.1 documents continue to describe the released v0.1 profile.

## Completion record

Phase 12 completed the first post-v0.1 durability increment:

- added versioned, atomic local-file Execution/trace and Goal adapters;
- made file persistence the daemon default with explicit memory-mode fallback;
- rehydrated terminal and waiting work, and finalized already-terminal Goals,
  without changing canonical identity, trace order, or causation;
- added safe interruption recovery that fails active work without replaying an
  authorized Action;
- rejected corrupt, incompatible, and incomplete persisted state before use;
- exposed persistence mode through daemon health and the typed SDK; and
- added focused core and daemon recovery tests while retaining the Phase 11
  release matrix.

Validation completed:

- `pnpm install --frozen-lockfile` passed with the pinned lockfile.
- `pnpm build` and `pnpm -r typecheck` passed for every workspace.
- `pnpm test` passed 98 executable tests: 5 shared, 66 core, 3 SDK, 19 daemon,
  and 5 dashboard; CLI typechecking also passed.
- The built daemon and typed SDK passed a real process restart check against an
  isolated data directory: persistence `file`, Execution `succeeded`, Goal
  `achieved`, and 43 consecutive records ending in `execution.succeeded` before
  and after restart.
- `git diff --check` passed.
- Local Markdown validation checked 123 paths across 46 files with no missing
  target.
- `.env`, `.panda`, generated wallets, build output, and temporary runtime state
  are ignored or absent from the change set.
- The dashboard production build passed with its existing Tailwind TypeScript
  configuration warning from Node.js.
- Live dashboard verification through the required in-app browser was attempted
  twice, but the integration failed before navigation with
  `Cannot redefine property: process`, matching the Phase 11 limitation. The
  browser workflow prohibits substituting another driver; repeat live visual QA
  when that integration initializes.
- Format and lint were not run because neither workflow is configured.
