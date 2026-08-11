# Phase 9 Plan: Add the Trace Dashboard

**Status:** Complete with environment-limited browser verification

**Prerequisite:** [Phase 8 — Integrate the Daemon and SDK](phase-8.md)

**Phase source:** [PANDA v0.1 Implementation Plan](../v0.1-implementation-plan.md#13-phase-9-add-the-trace-dashboard)

## Objective and scope

Replace the session-oriented scaffold dashboard with an operator view over the
canonical execution API. The dashboard must list executions, display the active
Goal and explicit success criteria, and render every stored trace record in
store-assigned sequence with its direct cause and full expandable payload.

The UI must help an operator reconstruct what entered PANDA, which dynamic
route it followed, why Decision selected an action, whether policy authorized
it, what the connector executed, what Perception independently observed, and
why Analysis and the Goal ended in their final states. All summaries must be
derived from stored records and use an explicit “not recorded” state instead of
inventing missing rationale.

## Starting state

The dashboard still reads legacy sessions, submits free-form `/runs` input,
shows seven-state session cards, and renders an unstructured reverse event
list. Phase 8 now provides canonical execution views, sequence-stable traces,
typed SDK methods, and committed WebSocket trace events, but the dashboard does
not consume them.

## Non-goals

- Adding new runtime records, rationale, outcomes, or verification data solely
  for presentation.
- Editing, cancelling, retrying, resuming, or deleting an execution.
- Durable browser history, routing, pagination, server-side filtering, or
  authentication.
- General action authoring beyond the frozen v0.1 relative path and UTF-8
  content request.
- Changing the daemon, coordinator, capability route, policy, or effect model.
- Removing legacy runtime packages and shared types; that is Phase 10.

## Implementation tasks and affected files

1. Replace session state with typed canonical execution views, one selected
   execution ID, and its authoritative stored trace.
2. Replace the free-form Agent Console with an explicit relative-path and UTF-8
   content form that calls `createExecution`.
3. Refresh execution summaries on load, after creation, and when a material
   WebSocket record arrives; refresh the selected trace without synthesizing
   client-only runtime records.
4. Add a compact execution list with status, active/terminal capability state,
   objective, update time, and selection affordance.
5. Add an execution header showing Goal objective, status, explicit success
   criteria, constraints, terminal outcome, and status reasons.
6. Derive operator question cards only from trace payloads for input, route,
   Decision rationale, authorization, requested effect, observed effect, and
   verification/result.
7. Add a chronological timeline ordered by store-assigned sequence. Each row
   must display category, type, producer, timestamp, record ID, direct cause ID
   and cause sequence when present, and an expandable exact JSON payload.
8. Use a stable visual vocabulary to distinguish observed facts,
   deterministic inference, decisions, policy authorization, external effects,
   runtime control, and failures.
9. Add pure trace-view helpers and executable tests for ordering, direct-cause
   resolution, route extraction, record-derived insights, and visual kind
   classification.
10. Build and run the local daemon/dashboard, exercise creation, selection,
    expansion, live refresh, and responsive layout in the in-app browser.
11. Update the implementation plan, progress record, onboarding guide, root
    summary, documentation index, and dashboard test documentation.

## Presentation decisions

### One source of truth

Execution cards use `GET /executions`; detail uses the selected execution view;
the timeline uses `GET /executions/:id/trace`. WebSocket events are refresh
signals, not a separate browser-owned trace store. This prevents missed events,
reconnects, or duplicate messages from changing displayed runtime truth.

### Causal timeline

Records sort numerically by required stored sequence. A direct cause is shown
as `#<sequence>` when the referenced trace wrapper exists, together with the
exact causation ID. Root records explicitly say “root record.” Broken cause
references are displayed as unresolved rather than hidden or repaired.

### Semantic visual kinds

- observed: Signal, Goal, and Observation records;
- inference: Assessment and verification analysis records;
- decision: Decision records;
- authorization: Policy evaluations;
- effect: ActionRequest, ConnectorInvocation, and Outcome records;
- failure: Failure records;
- runtime: capability invocation, transition, goal status, wait, and
  termination records.

Colors and labels supplement record category/type text and are never the sole
carrier of meaning.

### Honest summaries

Operator question cards point to a source record sequence and quote only
structured fields already present in its payload. If a record or field is
absent, the card states “Not recorded.” The raw payload remains expandable for
independent inspection.

## Acceptance criteria

- The dashboard has no dependency on legacy `PandaSession` data or session API
  calls.
- Creating a request produces and selects a canonical execution with its
  terminal status and complete stored trace.
- Execution list and detail views show current/terminal status, active
  capability when present, Goal objective, constraints, and all success
  criteria.
- Timeline order exactly matches stored sequence and every material record can
  reveal its unchanged payload.
- Each non-root record displays its direct causation ID and the referenced
  trace sequence when resolvable.
- Observed facts, inference, decisions, authorization, effects, runtime control,
  and failures have explicit textual and visual distinctions.
- Operator question cards answer from source records or say “Not recorded.”
- Material WebSocket events cause canonical list/trace refresh without
  duplicating trace records in browser state.
- Pure helper tests, TypeScript build, production bundle, and live browser
  interaction checks pass.

## Validation plan

- Run dashboard executable trace-helper tests and production build.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` for the full workspace.
- Start the built daemon and dashboard with temporary PANDA data, then use the
  in-app browser to create an execution, inspect status/criteria, expand a
  payload, follow direct cause information, and verify live refresh.
- Inspect desktop and narrow viewport screenshots, visible text, interactive
  state, and browser console errors.
- Run `git diff --check` and inspect all changed files.
- Inspect all local Markdown links and confirm secrets, generated wallets,
  `.panda`, test sandboxes, and build outputs are absent from the change set.

## Risks and assumptions

### Risks

- Treating WebSocket arrival order as trace order would corrupt the timeline.
  The UI always re-reads and sorts authoritative stored records.
- Summarization can become an untracked interpretation layer. Each insight is a
  narrow field projection with an explicit source sequence and raw payload.
- Large payloads can overwhelm the page. They remain collapsed by default and
  scroll within bounded containers when expanded.
- Color-only semantics are inaccessible. Every style includes a written kind
  and original category.

### Assumptions

- The Phase 8 execution API and shared contracts remain the dashboard boundary.
- The daemon and dashboard use their default loopback ports during development.
- Process-local execution history is intentionally lost when the daemon
  restarts.
- The in-app browser integration is the required interaction-verification
  surface; if its own bootstrap remains unavailable, the exact setup failure is
  recorded rather than substituting an unsupported driver.

## Completion record

### Completed work

- Replaced all session state, API calls, cards, and free-form run input with
  canonical execution views, an explicit file request form, selected execution
  state, and authoritative trace reads.
- Added live WebSocket-driven refresh while keeping the daemon trace endpoint
  as the browser's source of truth and debouncing material record bursts.
- Added execution list/status cards and a detailed Goal header with active or
  terminal capability, objective, status reasons, constraints, all explicit
  success criteria, terminal effect, and verification state.
- Added seven source-linked operator reconstruction cards for input, dynamic
  route, Decision rationale, effect authorization, Action request, independent
  observed effect, and verification result. Missing fields say “Not recorded.”
- Added a chronological expandable timeline that sorts by store sequence,
  preserves exact payloads, labels producers, shows record identity, and links
  every resolvable direct cause to its source record.
- Added explicit observed, inference, decision, authorization, effect, failure,
  and runtime labels with accessible non-color text.
- Added pure trace presentation helpers and five executable tests for ordering,
  cause resolution, repeated route extraction, record-derived insights, and
  semantic category classification.
- Reworked the visual system and responsive layout for the canonical trace
  console without adding a second execution model.

### Validation

- `pnpm --filter @panda/dashboard test` — passed; production bundle completed
  and 5 dashboard trace-helper tests passed.
- Live daemon/dashboard stack — passed at the HTTP/runtime boundary using an
  isolated temporary data directory. A real request returned execution
  `succeeded`, Goal `achieved`, verification `verified`, and 43 consecutive
  trace records from sequence 1 through terminal sequence 43.
- In-app browser verification — unavailable because the installed browser
  integration failed during its own required bootstrap with `Cannot redefine
  property: process`, both initially and after a clean reconnect. Per the
  browser skill, no unsupported alternate automation driver was substituted.
  The temporary live fixture was moved to the user's Trash after shutdown.

Full workspace and documentation validation is recorded in
[Implementation Progress](../progress.md).

### Remaining work

No implementation work remains. Repeat the live visual and interaction check
when the in-app browser integration can initialize; this environment-only
verification gap does not change the stored-record tests or production bundle.
Phase 10 removes the remaining legacy session, seven-state, graph, and
deprecated run surfaces now that the daemon, SDK, and dashboard use the
canonical model.
