# Phase 6 Plan: Implement Real Action Execution

**Status:** Complete

**Prerequisite:** [Phase 5 — Add the Policy Gate](phase-5.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#10-phase-6-implement-real-action-execution)

## Objective and scope

Add the canonical Action connector boundary and perform the one real PANDA
v0.1 effect: create or replace a UTF-8 file inside the authorized execution
workspace. The connector must revalidate the exact policy-bound request at the
filesystem boundary and return a structured Outcome that reports what the
connector did without claiming independent environmental verification or goal
success.

Phase 6 is enabled only when a caller explicitly supplies an Action connector
registry. The legacy daemon remains unwired until Phase 8, and existing
effect-free embedded callers continue to stop at the connector-availability
wait boundary.

## Starting state

Phase 5 added deterministic transition and effect policy. Action now converts
an allowed candidate into a new ActionRequest bound to the policy evaluation,
but waits because no responsibility-specific connector exists. Denials already
return a zero-effect Outcome through Decision.

The legacy universal `FilesystemConnector` still returns simulated
`{ accepted: true }`. It remains compatibility behavior and is not used for the
canonical v0.1 effect.

## Non-goals

- Reading the written file through Perception or verifying goal criteria.
- Marking an execution succeeded or a goal achieved after connector success.
- Wiring the connector into the daemon, SDK, dashboard, or legacy dispatcher.
- General filesystem access, directory deletion, process execution, network
  mutation, repository mutation, or multiple-file transactions.
- Durable idempotency storage, crash recovery, rollback, or exactly-once
  effects.
- Hiding partial, unknown, timeout, or cancellation outcomes behind success.

## Implementation tasks and affected files

1. Add a canonical `ConnectorInvocation` contract for effect-boundary audit.
2. Add a responsibility-specific `ActionConnector` port and ownership-safe
   in-memory registry in `packages/core/src/action-connector.ts`.
3. Add a `FilesystemActionConnector` that accepts only a policy-authorized
   `filesystem.write` request for the current execution workspace.
4. Repeat v0.1 policy, identity, workspace, size, path, and link validation
   immediately before opening the target.
5. Create workspace directories segment by segment without accepting symbolic
   links, then open the final file without following a link where supported.
6. Create or replace one regular file, track bytes written, and calculate the
   SHA-256 hash of the requested bytes.
7. Return canonical outcomes for completed, rejected, failed, cancelled,
   timeout, partial, and indeterminate cases as evidence permits.
8. Make deterministic Action dispatch only when an explicit registry is
   supplied. Record the authorized request, connector invocation, and Outcome
   as distinct causal trace entries.
9. Route connector failure or rejection to Decision for the bounded v0.1
   terminal choice. Keep successful execution waiting for Phase 7 verification.
10. Add integration and failure tests using operating-system temporary
    directories only, then update progress and contributor documentation.

## Connector decisions

### Responsibility-specific boundary

`ActionConnector` is separate from the legacy universal connector. It declares
an ID and supported action types and accepts a canonical authorized
ActionRequest plus the current ExecutionContext and abort signal. It returns a
canonical Outcome; it does not route capabilities or mutate execution state.

The registry rejects duplicate ownership and unknown connector IDs. Action
turns an unexpected registry/connector throw into a structured failed Outcome
rather than allowing one execution error to escape the coordination boundary.

### Authorization and defense in depth

The filesystem connector requires a non-empty authorization evaluation ID and
the v0.1 filesystem policy ID. It then evaluates its own deterministic v0.1
boundary policy against the exact authorized request and current context.
Allowance from a custom capability-side policy cannot weaken this local
filesystem restriction.

The connector creates the configured data directory and each managed workspace
directory separately, checking that every existing segment is a real directory
and not a symbolic link. It repeats policy after directory creation and before
opening the file. The final open uses no-follow semantics where the platform
provides them, and the open handle must be a regular file with one link before
truncation.

These controls reduce but cannot eliminate every filesystem race in an
untrusted shared host. The sandbox remains a v0.1 local-development boundary,
not an operating-system security container.

### Outcome semantics

A completed write records relative and resolved paths, byte count, SHA-256
content hash, hash algorithm, and the policy authorization reference. It uses
`effectStatus: "completed"` but does not populate independent observed-effect
evidence or change goal state.

Validation and authorization failures are `rejected` with no effect. Failures
before opening/truncating are `failed` with no effect. Once the target may have
changed, a short or interrupted write is `partial`; an error after all bytes are
written but before completion can be proven is `indeterminate` with unknown
effect. Cancellation and request timeout retain their own outcome status and
the most accurate known effect status.

### Phase 6 routes

With no explicitly configured connector registry, the Phase 5 allow route
continues to wait safely. With the filesystem connector configured:

```text
Perception -> Analysis -> Decision -> Action
  completed effect -> wait(effect.verification.available)
  connector failure/rejection -> Decision -> terminate(failed)
```

Phase 7 replaces the successful wait with independent Perception and Analysis.

## Acceptance criteria

- The public core API exports a narrow Action connector port, registry, and
  filesystem implementation without changing the legacy connector contract.
- Only an authorized, policy-permitted filesystem.write request can open a
  file.
- A real integration test proves the file exists under the execution workspace
  with exact UTF-8 bytes, byte count, and SHA-256 hash.
- The connector returns distinct structured rejection, failure, cancellation,
  timeout, partial, or indeterminate outcomes when those facts are known.
- Unsupported actions, missing/incorrect authorization, unknown connectors,
  and pre-effect I/O failures cannot appear as success.
- Action request, connector invocation, and outcome are separate trace entries
  with valid same-execution causation.
- Connector completion does not mark the execution succeeded or the goal
  achieved; the execution waits for Phase 7 verification.
- Tests write only below operating-system temporary directories.

## Validation plan

- Run the focused `@panda/core` executable tests.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Run `git diff --check` and inspect the complete diff and changed-file list.
- Inspect all local Markdown links and relative paths.
- Confirm `.env`, generated wallets, repository-local `.panda`, temporary
  sandboxes, and build outputs are absent from the change set.
- Confirm no configured format or lint command exists before reporting those
  checks as unavailable.

## Risks and assumptions

### Risks

- Following an attacker-controlled link could escape the workspace. Policy,
  managed-directory checks, no-follow open flags, and open-handle checks form
  layered controls.
- A process can fail after truncation or a partial write. The connector tracks
  the point at which effects become possible and never converts uncertainty to
  success.
- Treating connector completion as verification would close the loop on the
  component's own claim. Phase 6 always waits after a completed write.
- Reusing the legacy universal connector would mix observation, network, and
  effect privileges. The canonical connector uses a separate narrow port.

### Assumptions

- Tests and v0.1 run on a local filesystem that supports regular files and
  symbolic-link inspection.
- The configured data directory is dedicated to PANDA execution workspaces.
- The 65,536-byte Phase 5 limit keeps one write small; general streaming and
  multi-file atomicity are outside v0.1.
- Durable idempotency and crash reconciliation remain post-v0.1 work.

## Completion record

### Completed work

- Added and exported the canonical connector-invocation contract, narrow
  Action connector port, ownership-safe registry, and filesystem connector.
- Implemented a real create-or-replace UTF-8 write below the execution
  workspace with policy revalidation before and after managed directory
  creation, link checks, no-follow open behavior, regular-file validation, and
  conservative effect-state tracking.
- Recorded resolved and relative paths, exact byte count, SHA-256 hash,
  authorization reference, start/end times, action identity, and connector
  identity in the completed Outcome.
- Kept Action dispatch opt-in through an explicitly supplied connector
  registry, preserving the effect-free wait behavior for existing embedded
  and legacy callers.
- Recorded the authorized ActionRequest, ConnectorInvocation, and Outcome as
  separate same-execution causal trace entries.
- Routed rejection and failure outcomes back to Decision. A connector throw is
  retained as indeterminate with unknown effect rather than being converted to
  a zero-effect failure.
- Kept successful connector completion waiting for Phase 7 independent effect
  verification and left the legacy daemon, SDK, and universal connectors
  unchanged.

### Validation

- `pnpm --filter @panda/core test` — passed; 54 core tests passed, including
  direct connector success and failure tests plus coordinator-level real-write,
  trace, missing-connector, and indeterminate-effect integration coverage.

Full workspace and documentation validation is recorded in
[Implementation Progress](../progress.md).

### Remaining work

No Phase 6 work remains. Phase 7 must feed the completed Outcome back through
Perception, observe the file independently, compare the observed bytes and hash
with the goal criteria in Analysis, and terminate successfully only after that
verification passes.
