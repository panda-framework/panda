# Phase 8 Plan: Integrate the Daemon and SDK

**Status:** Complete

**Prerequisite:** [Phase 7 — Close the Outcome Feedback Loop](phase-7.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#12-phase-8-integrate-the-daemon-and-sdk)

## Objective and scope

Make one daemon-owned canonical runtime the executable application path. The
daemon will construct and retain the execution store, GoalStore, capability
registry, policy engine, Action connector registry, filesystem connector,
effect observer, and coordinator. HTTP and WebSocket clients will observe the
same records that this coordinator commits.

Phase 8 also adds typed SDK methods for execution creation, listing, detail,
and trace retrieval. The existing `/runs` endpoint remains only as a deprecated
compatibility alias into the canonical execution service; it must not construct
or invoke the legacy graph runtime.

## Starting state

The embedded core can complete and verify the frozen filesystem scenario, but
the daemon does not use it. The daemon currently observes input through one
legacy `PandaRuntime`, then calls `runPandaLoop`, which constructs another
runtime and follows the legacy seven-state path. The SDK exposes only health,
sessions, and the old run contract. WebSocket events report session/run
lifecycle messages rather than canonical trace records.

## Non-goals

- Durable execution or trace persistence across daemon restarts.
- Authentication, authorization between remote principals, TLS, or deployment
  hardening.
- General action types or arbitrary filesystem access beyond the frozen v0.1
  policy.
- Dashboard trace rendering; that is Phase 9.
- Removing every legacy type, graph package, session helper, or example; that
  is Phase 10.
- Retry, resume, cancellation, distributed coordination, or exactly-once
  delivery.

## Implementation tasks and affected files

1. Add shared, versionable request/response/error/event contracts for the
   execution API so the daemon and SDK cannot drift.
2. Add observation subscriptions to the in-memory execution store and emit an
   immutable snapshot after each successfully committed trace record.
3. Build a daemon-owned execution service that constructs the canonical policy,
   stores, registries, connector, observer, deterministic capabilities, and
   coordinator exactly once per daemon instance.
4. Create a canonical Signal, explicit four-criterion Goal, and pending
   Execution for each accepted request; append their causal records before
   coordination begins.
5. Expose `POST /executions`, `GET /executions`, `GET /executions/:id`, and
   `GET /executions/:id/trace` from a reusable Fastify application factory.
6. Return execution identity, status, Goal, final Outcome, verification
   Assessment, and trace URL in API views without creating synthetic records.
7. Return stable structured 4xx errors for malformed requests and unknown
   execution identifiers.
8. Stream every committed canonical trace record over `WS /events` with its
   execution identity, sequence, and original payload intact.
9. Route the deprecated `/runs` endpoint through the same execution service and
   remove `@panda/graph` from the daemon request path and dependencies.
10. Add typed SDK methods and an error class that preserves structured daemon
    errors.
11. Add executable daemon integration tests for success, trace equality,
    WebSocket delivery, concurrent isolation, compatibility routing, and 4xx
    behavior, plus core and SDK unit coverage.
12. Update the implementation plan, progress record, onboarding guide, root
    summary, and documentation index.

## API decisions

### Request contract

The canonical v0.1 request is:

```json
{
  "type": "demo.file.requested",
  "source": "sdk",
  "payload": {
    "path": "proof.txt",
    "content": "PANDA v0.1 completed"
  }
}
```

`type` and `source` have deterministic defaults. The payload may omit a typed
field so the existing missing-information wait route remains observable, but
unknown keys, unsupported request types, non-object payloads, and non-string
provided fields are HTTP contract errors. Semantic invalidity preserved by the
contract remains capability evidence and reaches an explicit execution state.

### Response views

An execution view contains the canonical Execution and Goal snapshots plus the
latest real Outcome and the effect-verification Assessment when present. The
top-level execution ID and status make the common client path direct, while
`traceUrl` names the authoritative trace resource. List and detail endpoints
derive views from the same stores; they never maintain a second status model.

### Event delivery

The in-memory store remains the commit boundary. It notifies subscribers only
after assigning a sequence and retaining a trace record. The daemon wraps each
snapshot in an `execution.recorded` event and fans it out to connected clients.
WebSocket delivery is best effort and process local in v0.1; a slow or closed
client cannot roll back the canonical store.

### Concurrency and ownership

One service owns all runtime components, but every request receives unique
execution, goal, correlation, workspace, and trace identities. The coordinator
may run different execution IDs concurrently and rejects only duplicate active
coordination of the same ID. API reads always resolve by explicit execution ID.

## Acceptance criteria

- The daemon imports no legacy graph runner and owns one canonical runtime
  component graph for its lifetime.
- A valid `POST /executions` performs the real sandboxed effect, independently
  verifies it, and returns `succeeded` with matching Outcome and verification.
- List, detail, and trace endpoints report the exact snapshots retained by the
  execution and Goal stores.
- A WebSocket connected before execution receives sequence-stable material
  records for that execution, including termination.
- Concurrent successful requests have distinct identities, workspaces, traces,
  content, and causation chains.
- Malformed input and unknown IDs produce documented structured 4xx responses,
  not Fastify internal failures.
- The deprecated `/runs` route reaches the same service and creates no session
  or legacy runtime execution.
- The SDK exposes typed create/list/get/trace methods and structured errors.

## Validation plan

- Run focused shared, core, SDK, and daemon executable tests.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Run `git diff --check` and inspect the complete diff and changed-file list.
- Inspect all local Markdown links and relative paths.
- Confirm `.env`, generated wallets, repository-local `.panda`, temporary
  sandboxes, and build outputs are absent from the change set.
- Confirm no configured format or lint command exists before reporting those
  checks as unavailable.

## Risks and assumptions

### Risks

- Publishing before store commit would let clients observe records that do not
  exist. Notifications therefore happen only after successful retention.
- Shared mutable runtime components could cross-contaminate executions. Tests
  assert identity, workspace, trace, and causal isolation under concurrency.
- Returning a convenient derived view can drift from source records. Views are
  rebuilt from stores and trace payloads on each read.
- WebSocket fan-out has no replay or backpressure. Clients reconnect by reading
  the trace endpoint; durable delivery remains outside v0.1.

### Assumptions

- One daemon process is the only writer to its process-local stores.
- SDK and daemon versions share the v0.1 contracts from `@panda/shared`.
- Filesystem requests remain bounded by the Phase 5 policy and operate only in
  per-execution workspaces below the configured PANDA data directory.
- Phase 9 will consume the new execution/event contracts without changing
  runtime truth.

## Completion record

### Completed work

- Added shared execution create/view/error contracts and a material
  `execution.recorded` WebSocket event variant.
- Added immutable post-commit trace subscriptions to the in-memory execution
  store without allowing observer failures or mutations to affect retention.
- Added one daemon-owned canonical runtime that constructs the GoalStore,
  ExecutionStore, capability registry, policy engine, connector registry,
  filesystem connector, effect observer, deterministic capabilities, and
  coordinator once.
- Replaced the daemon's legacy split request path with canonical Signal, Goal,
  Execution, trace, coordination, effect, observation, and verification flow.
- Added execution create/list/detail/trace endpoints with structured validation
  and not-found errors and views derived directly from retained records.
- Streamed committed trace records through the existing WebSocket route with
  execution identity and store-assigned sequence intact.
- Routed the deprecated `/runs` route through the canonical service and removed
  `@panda/graph` from daemon dependencies.
- Added typed SDK create/list/get/trace methods, encoded identifiers, a
  structured request error, and a deprecated compatibility method.
- Added core subscription tests, SDK request/error tests, and daemon integration
  tests covering terminal success, store/API trace equality, WebSocket records,
  concurrent isolation, structured 4xx behavior, and compatibility routing.

### Validation

- `pnpm --filter @panda/core test` — passed; 66 core tests passed.
- `pnpm --filter @panda/sdk test` — passed; 3 SDK tests passed.
- `pnpm --filter @panda/daemon test` — passed; 5 daemon integration tests
  passed against real temporary filesystem workspaces.

Full workspace and documentation validation is recorded in
[Implementation Progress](../progress.md).

### Remaining work

No Phase 8 work remains. Phase 9 must replace the session-oriented dashboard
with execution summaries and a sequence-stable causal trace inspector using
only the canonical APIs and stored records delivered here.
