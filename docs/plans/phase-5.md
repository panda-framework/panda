# Phase 5 Plan: Add the Policy Gate

**Status:** Complete

**Prerequisite:** [Phase 4 — Implement Deterministic PANDA Capabilities](phase-4.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#9-phase-5-add-the-policy-gate)

## Objective and scope

Add an independent, auditable policy boundary for capability transitions and
the v0.1 filesystem effect candidate. Phase 5 must prove that a deterministic
allow decision binds authorization to the exact request, while denial becomes
structured information that returns from Action to Decision without invoking a
connector or touching the filesystem.

The phase remains effect-free. It prepares one authorized request for Phase 6,
but no Action connector is available to execute it.

## Starting state

Phase 4 added the five deterministic capabilities. Complete input reaches
Action with a typed but unauthorized `filesystem.write` candidate; Action then
waits for policy. The Phase 3 coordinator validates transition structure and
runtime bounds, but commits transitions without evaluating or recording a
policy decision.

The legacy connector path remains separate and simulated. It is not a policy
or effect implementation for the canonical execution path.

## Non-goals

- Writing, creating, replacing, reading, or hashing a sandbox file.
- Registering or invoking an Action connector.
- Treating policy allowance as connector success or verified goal success.
- Implementing general RBAC, durable approvals, policy hot reload, or a policy
  language.
- Adding production authentication, a goal repository, daemon wiring, or SDK
  endpoints.
- Moving request-shape or sandbox authorization into Analysis or Decision.
- Removing the legacy application path.

## Implementation tasks and affected files

1. Add a canonical `PolicyEvaluation` contract with its evaluation point,
   policy identifier, result, reason, and redacted typed inputs.
2. Add `packages/core/src/policy.ts` with a replaceable `PolicyEngine` port and
   a deterministic v0.1 implementation.
3. Make the v0.1 policy configuration expose its data directory, maximum UTF-8
   content size, and resolved execution workspace.
4. Allow only `filesystem.write` through the filesystem connector into the
   current execution workspace.
5. Reject absolute or empty paths, explicit `..` traversal, invalid execution
   identifiers, workspace-root targets, symlink escapes, wrong connectors or
   targets, unsupported action types, invalid encodings, and oversized
   content.
6. Evaluate and trace policy after every structurally valid transition request
   and immediately before the deterministic Action boundary could hand a
   request to a future connector.
7. Attach the effect evaluation to a newly authorized ActionRequest on allow.
   On deny, return a rejected zero-effect Outcome to Decision, which records
   safe non-action and terminates the v0.1 fixture explicitly.
8. Preserve a continuous causal trace through transition request, policy
   evaluation, transition result, effect evaluation, denial outcome, and final
   Decision.
9. Add focused transition-policy, allow, injected-denial, sandbox, symlink,
   unsupported-action, and content-limit tests.
10. Export the Phase 5 API and update the implementation plan, progress record,
    onboarding guide, root summary, and documentation index.

## Policy decisions

### Port and record boundary

The core policy port accepts one of two typed requests: a proposed transition
or an effect candidate. Implementations return only `allow`, `deny`, or
`require` plus a stable policy ID, reason, and safe input details. A shared
helper validates that decision and creates the canonical evaluation record
with execution, goal, correlation, causation, producer, and timestamp identity.

Policy engines do not mutate execution state, route capabilities, authorize
themselves, or perform effects. The coordinator and Action capability consume
their results at their respective boundaries.

### Transition evaluation

The coordinator retains structural checks for stale state, registered targets,
and invocation limits. Before committing any otherwise valid `invoke`, `wait`,
or `terminate` request, it evaluates transition policy and appends a
`policy-evaluation` trace. The committed or rejected TransitionRecord embeds a
summary of that exact evaluation.

A non-allow transition result cannot be committed. Because a denied next step
does not provide an alternate policy-permitted route, the generic coordinator
records a structured policy failure and terminates rather than inventing a
route.

### Effect evaluation and denial route

Deterministic Action evaluates the exact candidate selected by Decision. An
allow result creates a new authorized ActionRequest caused by the evaluation
and waits at the Phase 6 connector boundary. A deny result creates a rejected
Outcome with `effectStatus: "none"`; Decision consumes that outcome, explains
that no authorized v0.1 alternative remains, and terminates failed.

This capability-owned route is:

```text
Perception -> Analysis -> Decision -> Action
  allow -> wait(action.connector.available)
  deny  -> Decision -> terminate(failed)
```

The coordinator records capability-produced policy evaluations generically;
it does not inspect filesystem products or choose the denial route.

### Sandbox and resource rules

The v0.1 data directory defaults to `.panda`. An execution workspace resolves
to `<dataDirectory>/runs/<executionId>/workspace`, and tests inject a temporary
data directory. Execution IDs are validated before path construction.

Policy rejects both POSIX and Windows absolute syntax, explicit traversal
segments under either separator, a normalized workspace-root target, and any
existing symbolic-link segment from the workspace through the target. Lexical
containment is checked even after those explicit rules. Phase 6 repeats
boundary validation immediately around the actual write to reduce time-of-
check/time-of-use risk.

The default maximum content size is 65,536 UTF-8 bytes. The configured value is
publicly inspectable, and tests exercise exactly one byte above it. Evaluation
records include byte counts and resolved paths but not file content.

## Acceptance criteria

- The shared and core public APIs expose canonical policy evaluations and a
  replaceable policy engine.
- Every structurally valid committed transition has a preceding policy trace
  and embeds the matching policy summary.
- A transition denial is rejected, never invokes the target, and terminates
  with a structured policy failure.
- A valid v0.1 candidate receives an auditable authorization reference and
  remains waiting before connector execution.
- Injected effect denial routes Action to Decision, invokes no connector,
  records a rejected zero-effect outcome, and cannot appear as success.
- Absolute paths, traversal, workspace-root targets, symlink escapes,
  unsupported effects, wrong connectors or targets, invalid encoding, invalid
  execution IDs, and oversized content are denied.
- Policy details are inspectable without copying requested file content into
  the evaluation record.
- No filesystem effect occurs and the legacy application path remains
  unchanged.

## Validation plan

- Run the focused `@panda/core` executable tests.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Run `git diff --check` and inspect the complete diff and changed-file list.
- Inspect all local Markdown links and relative paths.
- Confirm `.env`, generated wallets, temporary sandboxes, and build outputs are
  ignored or outside the repository and absent from the change set.
- Confirm no configured format or lint command exists before reporting those
  checks as unavailable.

## Risks and assumptions

### Risks

- Treating an Action-produced allow decision as proof of an effect would skip
  both connector execution and independent verification. The allowed request
  remains waiting for Phase 6.
- Checking only lexical containment would miss an existing symlink escape.
  Phase 5 walks existing path segments; Phase 6 must re-check at the connector
  boundary because the filesystem can change after policy evaluation.
- Letting the coordinator route denied effects would add scenario logic to the
  runtime. Action and Decision select the denial route through ordinary
  capability products.
- Recording file contents as policy inputs would unnecessarily duplicate
  potentially sensitive data. Evaluation details retain type, path, size,
  limit, and resolved boundary instead.

### Assumptions

- Phase 5 runs in one process and policy evaluation is deterministic.
- The configured data directory is trusted runtime configuration; requested
  paths and execution IDs are not.
- No external component mutates a Phase 5 workspace during one test except the
  explicit symlink fixture.
- `require` is representable by the port, but the deterministic v0.1 policy
  returns only allow or deny because durable approval handling is deferred.

## Completion record

### Completed work

- Added and exported the canonical policy-evaluation contract, policy engine
  port, evaluation helper, and deterministic v0.1 policy.
- Added policy evaluation to every structurally valid transition commit and
  retained the exact evaluation summary in each transition result.
- Added the execution workspace resolver, inspectable 65,536-byte default, and
  deterministic denials for unsafe paths, filesystem aliases, unsupported
  operations, wrong boundaries, invalid execution IDs, and excessive content.
- Made Action issue a new policy-bound ActionRequest on allow without invoking
  a connector.
- Made Action return a rejected zero-effect Outcome on deny or require, and
  made Decision terminate the bounded fixture from that evidence.
- Preserved a continuous trace through both transition and effect policy
  evaluations while retaining the legacy application path.

### Validation

- `pnpm --filter @panda/core test` — passed; 45 core tests passed, including
  five deterministic capability tests and six focused policy tests with 12
  nested denial cases.

Full workspace and documentation validation is recorded in
[Implementation Progress](../progress.md).

### Remaining work

No Phase 5 work remains. Phase 6 must add the responsibility-specific Action
connector, repeat sandbox validation at the effect boundary, perform the real
write, and return a structured outcome without claiming goal verification.
