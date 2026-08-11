# Phase 7 Plan: Close the Outcome Feedback Loop

**Status:** Complete

**Prerequisite:** [Phase 6 — Implement Real Action Execution](phase-6.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#11-phase-7-close-the-outcome-feedback-loop)

## Objective and scope

Complete the first closed-loop PANDA execution. A completed filesystem Action
Outcome must become ordinary input to Perception, which reads the environment
through a separate observation boundary. Analysis then compares the observed
path, UTF-8 content, byte count, and SHA-256 hash with explicit goal criteria.
Only matching environmental evidence may mark the goal achieved and terminate
the execution successfully.

Phase 7 also establishes in-memory goal ownership and auditable status changes
for the frozen v0.1 fixtures. Verification mismatch, missing effect, or
observation failure returns to Decision for the bounded no-recovery choice and
terminates failed. The daemon and SDK remain unwired until Phase 8.

## Starting state

Phase 6 performs the authorized write, records ActionRequest,
ConnectorInvocation, and Outcome, then waits for future verification. The
canonical Goal contract exists, but no goal repository owns live status and no
capability receives a goal snapshot or can propose a validated goal update.
Perception currently accepts only the initial Signal, and Analysis currently
classifies only the initial request observation.

## Non-goals

- Trusting connector-returned path, byte count, or hash as observed evidence.
- Marking success from dispatch or a completed Action Outcome alone.
- General filesystem browsing, watching, or arbitrary reads.
- Retry, compensation, replanning, or multi-attempt verification.
- Durable goal storage, crash recovery, replay, or exactly-once state changes.
- Daemon, SDK, dashboard, WebSocket, or legacy-run integration.
- Changing the five canonical capabilities or encoding a fixed route in the
  coordinator.

## Implementation tasks and affected files

1. Extend goal criteria with an optional typed expected value so deterministic
   verification can compare evidence with the explicit goal contract.
2. Add a narrow `GoalStore` port and process-local implementation with stable
   identity, immutable goal definition, snapshot isolation, and explicit
   status updates and optimistic revisions.
3. Let the coordinator supply an optional immutable Goal snapshot to a
   capability and accept an optional Goal update proposal in its result.
4. Validate and persist a proposed Goal update only after its transition is
   policy-allowed and committed, then append a causal `goal-status` trace.
5. Add a responsibility-specific filesystem effect-observer port that resolves
   only the active execution workspace, rejects unsafe paths and aliases,
   reads through a no-follow regular-file handle, bounds bytes, and calculates
   SHA-256 independently.
6. Route a completed Action Outcome to Perception only when an observer is
   explicitly configured; otherwise retain the safe Phase 6 verification wait.
7. Make Perception create a typed effect-verification Observation caused by
   the Outcome and containing independently observed existence, path, bytes,
   byte count, hash, timing, and any observation error.
8. Make Analysis compare that Observation with the active Goal criteria and
   produce a typed verification Assessment with per-criterion checks,
   evidence, method, and uncertainty.
9. On a complete match, propose `goal: achieved` and terminate succeeded. On
   mismatch or missing/unavailable evidence, route to Decision, which records
   safe non-action, proposes `goal: failed`, and terminates failed.
10. Add goal-store, observer, coordinator-boundary, golden-path, missing-file,
    mismatch, and false-success prevention tests using OS temporary directories.
11. Update the implementation plan, progress record, onboarding guide, root
    summary, and documentation index.

## Verification decisions

### Independent observation boundary

The effect observer is separate from `FilesystemActionConnector`. It accepts
the active execution identity and the relative path associated with the
Outcome, but it does not trust the connector's resolved path, byte count, or
hash. It resolves the workspace from its own v0.1 policy configuration, checks
containment and existing filesystem aliases, opens without following links
where supported, verifies one regular file, and calculates evidence from bytes
read through that handle.

Missing files are observed facts, not connector exceptions. They produce a
valid `missing` observation that fails the goal criteria. Boundary or I/O
errors remain explicit `failed` observations with uncertainty and cannot
become verified success.

### Goal ownership and transition coupling

`GoalStore` is a separate state port, consistent with the accepted ownership
architecture. The coordinator passes a snapshot; capabilities cannot mutate
the repository. A capability may propose one canonical Goal record with the
  same identity and immutable definition but the next revision plus a new
  status, reason, timestamp, and causal evidence reference.

The coordinator validates the update together with `NextStep`. Terminal goal
states must match terminal execution intent, and `awaiting-human` must match a
wait. Persistence and the `goal-status` trace occur only after transition
policy allows and commits that next step, preventing an achieved goal from
surviving a rejected success transition.

### Explicit success criteria

The deterministic goal has four machine-checkable criteria:

- `filesystem.relative-path` equals the requested relative path;
- `filesystem.utf8-content` equals the requested string exactly;
- `filesystem.byte-count` equals the UTF-8 byte count; and
- `filesystem.sha256` equals the SHA-256 hash of those exact bytes.

Analysis requires all four criteria and all four matching observed values.
Missing, malformed, or contradictory criteria cannot verify success.

### Phase 7 routes

With the connector and observer configured, the successful route is:

```text
Perception -> Analysis -> Decision -> Action
  -> Perception -> Analysis -> terminate(succeeded)
```

A mismatch or missing effect selects:

```text
Perception -> Analysis -> Decision -> Action
  -> Perception -> Analysis -> Decision -> terminate(failed)
```

These arrows remain capability-produced `NextStep` values evaluated by the
generic coordinator.

## Acceptance criteria

- The public core API exports goal storage and a narrow effect-observer port.
- A completed Action Outcome is available to Perception and Analysis without
  trusting it as environmental proof.
- Exact observed path, UTF-8 content, byte count, and SHA-256 satisfy explicit
  goal criteria, persist `goal: achieved`, and terminate execution succeeded.
- Missing, mismatched, unsafe, or unreadable effects cannot achieve the goal.
- Verification failure produces an Assessment, a final Decision, `goal:
  failed`, and execution failed despite the earlier completed Outcome.
- Goal updates occur only after the matching transition commits and have
  causal `goal-status` traces.
- Outcome, verification Observation, verification Assessment, Goal update,
  and terminal trace form a valid same-execution causal history.
- Existing callers without a GoalStore or observer retain Phase 6 behavior.
- Tests perform effects and reads only below OS temporary directories.

## Validation plan

- Run focused shared/core executable tests.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Run `git diff --check` and inspect the complete diff and changed-file list.
- Inspect all local Markdown links and relative paths.
- Confirm `.env`, generated wallets, repository-local `.panda`, temporary
  sandboxes, and build outputs are absent from the change set.
- Confirm no configured format or lint command exists before reporting those
  checks as unavailable.

## Risks and assumptions

### Risks

- Reusing the Action connector's claims would create circular verification.
  The observer derives evidence independently from the filesystem.
- Updating a goal before transition commitment could leave goal and execution
  state inconsistent. The coordinator applies the update only after policy
  commits the matching transition.
- Reading by path can race with concurrent filesystem mutation. The observer
  uses boundary checks and an opened regular-file handle, but v0.1 remains a
  local-development sandbox rather than an OS security container.
- Recording file content in traces may be sensitive in general. The frozen
  v0.1 fixture requires exact content evidence; general redaction and artifact
  references remain later work.

### Assumptions

- The deterministic fixture creates one active Goal before coordination.
- Goal definitions do not change during one Phase 7 execution.
- The configured observer and Action connector share the same trusted PANDA
  data-directory configuration while remaining separate implementations.
- The Phase 5 content maximum also bounds one verification read.

## Completion record

### Completed work

- Extended canonical goal criteria with an optional typed expected value and
  used four explicit path/content/byte-count/SHA-256 criteria for v0.1.
- Added and exported a separate in-memory GoalStore with stable identity,
  immutable goal definitions, snapshot isolation, optimistic revision checks,
  and explicit conflicts.
- Made the generic coordinator provide immutable Goal snapshots, validate
  capability-proposed status updates, reject updates inconsistent with their
  NextStep, and persist/trace them only after transition policy commits.
- Added and exported an independent filesystem effect observer that re-resolves
  the execution workspace, rejects traversal and filesystem aliases, performs
  a bounded no-follow regular-file read, and derives bytes and SHA-256 itself.
- Routed a completed Outcome to Perception when that observer is configured,
  while preserving the Phase 6 verification wait for existing callers.
- Added typed effect-verification Observation and Assessment products with
  explicit provenance, evidence, method, per-criterion results, mismatch
  reasons, and separate causal trace categories.
- Made matching evidence propose `goal: achieved` and terminate succeeded.
  Missing, unavailable, or mismatched evidence returns through Decision,
  proposes `goal: failed`, and terminates failed without overriding the earlier
  completed Outcome.
- Made missing request information propose `goal: awaiting-human` and policy or
  connector failure propose `goal: failed` when a GoalStore is configured.
- Kept the canonical closed loop embedded and left daemon/SDK wiring for
  Phase 8.

### Validation

- `pnpm --filter @panda/core test` — passed; 65 core tests passed, including
  GoalStore, coordinator goal-commit, independent observer, verified golden
  route, mismatch route, cancellation, sandbox, and all earlier regression
  coverage.

Full workspace and documentation validation is recorded in
[Implementation Progress](../progress.md).

### Remaining work

No Phase 7 work remains. Phase 8 must make the daemon own the canonical stores,
coordinator, policy, connectors, and observer; expose execution and trace APIs;
update the typed SDK; and stream material records without reverting to the
legacy split runtime path.
