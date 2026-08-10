# PANDA Developer Onboarding

This guide is the practical starting point for developing PANDA. It describes
the repository as it exists on **August 10, 2026**, including the difference
between the executable scaffold and the approved v0.1 architecture.

Use this document to get a local checkout running, find the right package,
understand the current request path, make a focused change, and validate it.
The [documentation index](README.md) links to the authoritative requirements,
architecture, plans, and progress records.

## 1. Current project status

PANDA is a TypeScript pnpm monorepo at an early implementation stage; its root
package is marked private to prevent accidental package publication. Phases 0
and 1 are complete: the v0.1 product contract is frozen and additive canonical
contracts now coexist with the legacy scaffold. Phase 2, the execution and
trace store, is the next implementation phase. See
[Implementation Progress](progress.md) for the current phase and validation
baseline.

There are two models in the repository today:

| Area | Current executable scaffold | Approved direction |
| --- | --- | --- |
| Capability/state names | Seven legacy states: perception, understanding, memory, planning, decision, execution, reflection | Five PANDA capabilities: perception, analysis, network, decision, action |
| Routing | `runPandaLoop` requests a predetermined sequence | Each capability returns a policy-permitted next step dynamically |
| Goals and executions | Sessions and messages only | First-class goals, execution-scoped state, outcomes, failures, and traces |
| Storage | Process-local `Map` objects | Initially an execution-scoped in-memory store; durable storage remains later work |
| Connectors | Filesystem and GitHub connectors return simulated acceptance | Narrow, policy-gated connectors report real outcomes; effects are independently verified |
| Security | Local unauthenticated HTTP/WebSocket scaffold | Explicit principals, policy checks, sandboxing, provenance, and auditable effects |
| Tests | Five shared contract tests and four core runtime tests; other package tests are type checks | Unit, integration, failure-fixture, and end-to-end release coverage |

Do not extend the seven-state model in new canonical contracts. The migration
must remain additive until the application path has moved and the Phase 10
legacy-removal gate is satisfied. Likewise, do not implement the expected v0.1
route as another hard-coded sequence: the route is an acceptance outcome of
capability results and policy.

## 2. Prerequisites

Install the following locally:

- Git.
- Node.js 20 or newer. The repository targets ES2022 and uses Fastify 5.
- pnpm 9.x.
- A modern browser for dashboard work.
- Optional: GitHub CLI (`gh`) for publishing pull requests.

The repository does not currently contain `.nvmrc`, `.node-version`, an
`engines` field, or a pinned `packageManager` field. The documented baseline
was verified with Node.js `v23.1.0` and pnpm `9.15.1`. If a version-specific
failure occurs, compare against that baseline and record any newly adopted
version policy in the repository.

Check the local tools:

```bash
node --version
pnpm --version
git --version
```

## 3. First-time setup

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

The initial build is required on a fresh clone. Internal workspace packages
export JavaScript and declarations from their ignored `dist/` directories;
those files are not available until they have been built.

### Local configuration and secrets

Runtime configuration is read directly from the shell environment:

| Variable | Default | Current behavior |
| --- | --- | --- |
| `PANDA_HOST` | `127.0.0.1` | Host used by the daemon listener |
| `PANDA_PORT` | `4317` | Port used by the daemon listener |
| `PANDA_DB` | `apps/daemon/data/panda.sqlite` | Returned by configuration, but no database is opened yet |

For example:

```bash
PANDA_HOST=127.0.0.1 PANDA_PORT=4317 pnpm dev
```

The application does not automatically load `.env`. The current
`.env.example` is for a local GitHub credential used by the publication
workflow, not daemon configuration. Keep all populated `.env` files local and
never print or commit their contents. Confirm the ignore rule before staging:

```bash
git check-ignore .env
git status --short
```

`generated_wallets/` can contain recovery phrases created by the donation
script. It is ignored for good reason: treat it as secret material and never
commit, paste, log, or share it. Avoid running `pnpm generate:wallets` unless
you specifically intend to create new wallet credentials.

## 4. Run and verify the local stack

Start the daemon and dashboard together:

```bash
pnpm dev
```

The default local endpoints are:

- Daemon HTTP API: `http://127.0.0.1:4317`
- Daemon WebSocket: `ws://127.0.0.1:4317/events`
- Dashboard: `http://127.0.0.1:5173`

In another terminal, verify the daemon:

```bash
curl http://127.0.0.1:4317/health
pnpm run doctor
```

Create a run through the API:

```bash
curl \
  --request POST \
  --header 'content-type: application/json' \
  --data '{"input":"Explain the current PANDA state."}' \
  http://127.0.0.1:4317/runs
```

Then inspect the process-local sessions:

```bash
curl http://127.0.0.1:4317/sessions
```

Open the dashboard and submit a prompt from **Agent Console**. A successful
scaffold run returns the fixed `PANDA runtime completed.` response plus memory
decisions. It does not call an LLM, write a file, or perform a GitHub action.

Stop the development processes with `Ctrl-C`. Sessions disappear when the
daemon restarts because the store is in memory.

## 5. Repository map

```text
panda/
├── apps/
│   ├── cli/             Commander-based local CLI
│   ├── daemon/          Fastify HTTP and WebSocket process
│   └── dashboard/       React, Vite, and Tailwind local UI
├── packages/
│   ├── shared/          Canonical and legacy contracts, factories, IDs, time
│   ├── core/            Bus, scheduler, memory, state, connectors, sessions
│   ├── graph/           Current compatibility runner and fixed transition path
│   └── sdk/             Typed HTTP client and public type re-exports
├── examples/            Small SDK usage examples
├── docs/                Requirements, architecture, plans, and project records
├── scripts/             Repository utility scripts
├── index.html           Static project homepage
├── package.json         Root commands and donation-script dependencies
├── pnpm-workspace.yaml  Workspace discovery
└── tsconfig.base.json   Shared strict TypeScript configuration
```

Build output appears in package `dist/` directories and in
`apps/dashboard/dist-types/` and `apps/dashboard/dist/`. These paths are
ignored generated artifacts. Change source files, not compiled output.

### Workspace responsibilities

| Workspace | Main entry point | Responsibility and current limits |
| --- | --- | --- |
| `@panda/shared` | `packages/shared/src/index.ts` | Additive v0.1 canonical contracts plus legacy session, observation, action, event, config, ID, timestamp, and logger definitions. Canonical records live in `contracts.ts`; legacy callers remain supported. |
| `@panda/core` | `packages/core/src/index.ts` | In-memory runtime primitives, connectors, session store, configuration, and all current executable tests. The file is currently monolithic. |
| `@panda/graph` | `packages/graph/src/index.ts` | Compatibility layer named around the original graph/loop concept. It constructs a new runtime and requests the fixed legacy state sequence. |
| `@panda/sdk` | `packages/sdk/src/index.ts` | Minimal Fetch-based client for daemon health, sessions, and runs. Its default base URL is hard-coded. |
| `@panda/daemon` | `apps/daemon/src/index.ts` | Owns the Fastify server, process-local sessions, a runtime instance, connector registration, and WebSocket fan-out. |
| `@panda/cli` | `apps/cli/src/index.ts` | Provides `init`, development process launchers, `doctor`, and version output. |
| `@panda/dashboard` | `apps/dashboard/src/App.tsx` | Local navigation, run form, session views, and recent event display. Several pages are placeholders. |

### Dependency direction

Keep dependencies pointing toward lower-level contracts and runtime packages:

```text
@panda/shared
├── @panda/core ──> @panda/graph ──> @panda/daemon
└── @panda/sdk
    ├── @panda/cli
    └── @panda/dashboard
```

The daemon also imports `@panda/shared` and `@panda/core` directly. The root
package's blockchain dependencies support `scripts/generate-wallets.js`; they
are not part of the PANDA runtime path.

Avoid app-to-app imports and avoid making a lower-level package depend on a
higher-level application. Cross-package contracts belong in a shared,
versionable layer rather than being duplicated.

## 6. How the current application works

### API run path

A request currently follows this path:

```text
Dashboard / CLI / custom caller
             |
             v
        @panda/sdk
             |
       POST /runs
             |
             v
      Fastify daemon
       |           |
       |           +--> global PandaRuntime.observe(user.input)
       |                stores the observation in global runtime memory
       |
       +--> create or update an in-memory PandaSession
       |
       +--> runPandaLoop creates a second PandaRuntime
       |    and requests the fixed legacy transitions
       |
       +--> save the returned session and output
       |
       +--> publish run events to connected WebSocket clients
```

Important consequences:

- The daemon's global runtime and the runtime created inside `runPandaLoop`
  are separate instances with separate memory and state.
- The daemon registers filesystem and GitHub connectors on its global
  runtime, but the current run path never dispatches an action to them.
- The fixed graph runner ends in legacy `reflection` and marks the session
  `completed` regardless of goal verification because goals do not exist yet.
- The dashboard refreshes sessions after `run.completed` and retains only the
  latest 100 WebSocket events in browser memory.

These are migration facts, not the target architecture.

### Observation bus and scheduler

`InMemoryObservationBus` maintains a FIFO array and a map of handlers.
Publishing only enqueues an observation. `drain()` removes queued observations
one at a time and awaits all interested handlers for each observation.
Handlers may subscribe to named observation types or `"*"`.

`PandaScheduler.dispatch()` publishes and drains. Reentrant `drain()` calls
return early while the current drain owns the queue, so observations created by
a handler are picked up by the active drain loop. There is no durability,
backpressure strategy, retry policy, delivery acknowledgment, or cross-process
transport.

### Memory and state

`ObservationMemory` subscribes to every observation:

- low-priority observations below `0.5` confidence are discarded;
- payloads whose JSON string exceeds 1,000 characters receive a `summarize`
  decision but are still stored unchanged;
- everything else is stored.

`StateTransitionEngine` subscribes to `state.transition.requested`, changes one
runtime-wide legacy state, records the transition, and emits
`state.transitioned`. It is not execution-scoped and does not evaluate policy.

### Connectors and actions

`ActionDispatcher` selects a connector by the action's `target`. The current
filesystem and GitHub connectors validate only action type and return
`{ accepted: true }`; they do not perform external effects. Connector
`start()`/`stop()` only toggle health state, and the daemon currently registers
connectors without starting them.

Do not treat `ok: true` from these stubs as proof that an effect occurred. The
approved v0.1 contract requires policy approval, a completed connector effect,
an independent Perception observation, and Analysis verification before goal
success.

### Sessions and events

`InMemoryPandaStore` keeps `PandaSession` values in a process-local map and
sorts them by `updatedAt` when listed. `POST /runs` can create a new session or
append to an existing session selected by `sessionId`.

WebSocket clients receive `run.started`, `run.completed`, and `run.failed`
events plus an initial log event. Session create/update event variants exist in
the shared type but are not emitted by the daemon.

## 7. Local interfaces

### Daemon HTTP API

| Method | Path | Input | Result |
| --- | --- | --- | --- |
| `GET` | `/health` | None | `{ ok, name, version }` |
| `GET` | `/sessions` | None | Sessions sorted newest update first |
| `GET` | `/sessions/:id` | Session ID in path | Session or `404` |
| `POST` | `/runs` | `{ input: string, sessionId?: string }` | `{ session, output }`; invalid input is `400` and unknown session is `404` |
| `GET` WebSocket upgrade | `/events` | None | JSON `PandaEvent` stream |

The daemon enables permissive CORS and has no authentication. Keep it bound to
loopback during development. Do not expose the current server to an untrusted
network.

### SDK

`PandaClient` accepts an optional `baseUrl` and exposes:

```ts
const client = new PandaClient({ baseUrl: "http://127.0.0.1:4317" });

await client.health();
await client.listSessions();
await client.getSession("ses_...");
await client.run({ input: "hello" });
await client.run({ sessionId: "ses_...", input: "continue" });
```

The SDK throws a generic status-based error for non-2xx responses and does not
yet expose the daemon's response body, retries, cancellation, timeouts, or a
WebSocket client.

### Dashboard

The dashboard's HTTP and WebSocket daemon URLs are currently hard-coded to
port `4317`. Changing `PANDA_PORT` only changes the daemon listener; it does not
reconfigure the dashboard or the CLI's default SDK client. Update the clients
deliberately if configurable endpoints become part of the task.

The Home, Agent Console, Memory, and Logs views use live local data. Tasks and
Settings are placeholder views. There is no router, persisted browser state,
component test setup, or error message surface yet.

### CLI

Run the TypeScript CLI from the workspace:

```bash
pnpm --filter @panda/cli panda init
pnpm --filter @panda/cli panda dev
pnpm --filter @panda/cli panda daemon
pnpm --filter @panda/cli panda dashboard
pnpm --filter @panda/cli panda doctor
pnpm --filter @panda/cli panda version
```

`panda init` creates `panda/panda.config.json` below the current directory. It
does not initialize this monorepo, install packages, or change daemon runtime
configuration.

## 8. Development workflows

### Before changing code

1. Read [Framework Requirements](requirements.md).
2. Read the relevant focused document under
   [Architecture](architecture/README.md) and its accepted ADRs.
3. Check [Implementation Progress](progress.md), the
   [v0.1 Implementation Plan](v0.1-implementation-plan.md), and the active
   phase plan.
4. Read the affected source, current tests, and recent Git history.
5. Define a small scope, explicit non-goals, acceptance criteria, and required
   validation.

When documents and code disagree, first classify the mismatch. The executable
scaffold intentionally lags the approved architecture, while requirements and
accepted ADRs constrain new canonical work. Do not silently choose whichever
source makes implementation easiest.

### Editing an application

- Daemon changes belong in `apps/daemon/src/` and should preserve API/SDK
  compatibility or update both deliberately.
- Dashboard changes belong in `apps/dashboard/src/`; validate both build output
  and the relevant browser interaction.
- CLI changes belong in `apps/cli/src/`; exercise the affected command against
  a running daemon when applicable.

Focused commands:

```bash
pnpm --filter @panda/daemon build
pnpm --filter @panda/dashboard build
pnpm --filter @panda/cli typecheck
```

### Editing a package

Workspace consumers import package `dist/` exports rather than package source.
The root `pnpm dev` command watches only the daemon and dashboard; it does not
start package source watchers. After changing `packages/*/src`, rebuild the
changed package and its consumers, or run the repository-wide build before
testing the live stack.

Useful focused builds include a package and its workspace dependencies:

```bash
pnpm --filter @panda/core... build
pnpm --filter @panda/graph... build
pnpm --filter @panda/daemon... build
```

For the least surprising workflow after a cross-package contract change:

```bash
pnpm build
pnpm typecheck
pnpm test
```

Restart `pnpm dev` if a consumer does not pick up rebuilt package output.

### Adding tests

The repository uses Node's built-in test runner for executable core tests.
Current tests live in `packages/core/src/runtime.test.ts`. Add focused tests
beside the affected implementation using `*.test.ts` when the package's test
script discovers them, and update that script if a new package begins to have
runtime tests.

Run the current core suite with:

```bash
pnpm --filter @panda/core test
```

That script builds `@panda/shared`, builds `@panda/core`, and runs
`node --test dist/*.test.js`. Tests for the CLI, daemon, dashboard, graph, SDK,
and shared packages currently run TypeScript checking only. Do not describe
those checks as behavioral test coverage.

There is no configured test coverage threshold, integration-test harness,
dashboard component test runner, formatter, or linter.

### Changing public contracts

When a type crosses a package or process boundary:

- make identity, schema version, correlation, causation, timestamps, and
  provenance explicit where required by the architecture;
- prefer typed semantic fields over behavior-driving metadata;
- update producers, consumers, SDK exports, API validation, examples, and
  tests together;
- preserve the Phase 1 additive-migration rule;
- record a new architectural choice in an ADR when it changes an invariant or
  accepted boundary.

### Adding a connector or effect

Read [Connectors](architecture/connectors.md),
[Policies](architecture/policies.md), and
[Security](architecture/security.md) before implementation. Keep input,
network, and action responsibilities distinct. Declare supported operations and
permissions, validate boundary data, use least privilege, and return structured
outcomes.

Real external effects are not appropriate for the current v0.1 sequence until
the policy gate in Phase 5 is complete. A connector's accepted or dispatched
response must remain distinct from effect completion and independent effect
verification.

## 9. Build, test, and validation reference

| Command | What it currently does |
| --- | --- |
| `pnpm dev` | Runs daemon and dashboard development processes in parallel |
| `pnpm build` | Builds every workspace recursively in dependency order |
| `pnpm typecheck` | Builds first, then runs each workspace's no-emit type check |
| `pnpm test` | Runs every workspace test script; shared and core have executable tests |
| `pnpm start` | Starts the already-built daemon from `apps/daemon/dist/index.js` |
| `pnpm run doctor` | Runs the source CLI and checks the default daemon health endpoint; use `run` because `pnpm doctor` resolves to pnpm's own command |
| `pnpm generate:wallets` | Generates sensitive seed phrases and public donation addresses |

For every change, at minimum run the most focused relevant check. Run the
repository-wide commands when a change affects shared types, package exports,
runtime behavior, API contracts, configuration, or multiple workspaces:

```bash
pnpm build
pnpm typecheck
pnpm test
git diff --check
```

For documentation-only work, validate whitespace and local Markdown links. No
documentation linter is configured, so report that limitation rather than
claiming a lint pass.

The dashboard build can emit a Node experimental warning while loading the
TypeScript Tailwind configuration through CommonJS. It is a known baseline
warning when the build still exits successfully; investigate any actual error
or newly introduced warning separately.

## 10. Documentation-first delivery

PANDA development is dependency-ordered because later runtime behavior depends
on stable upstream contracts and safety boundaries. A phase or meaningful
change should document:

- the problem, objective, scope, and non-goals;
- relevant requirements, architecture, and current implementation evidence;
- dependencies, risks, and affected components;
- ordered implementation tasks and acceptance criteria;
- unit, integration, regression, runtime, and UI validation as applicable;
- documentation and progress updates; and
- known limitations or follow-up work.

Use [Phase 0](plans/phase-0.md) as the first completed phase-plan example. If
new evidence changes an accepted design or dependency:

1. Record the evidence.
2. Update or add the relevant architecture decision.
3. Assess active and later phase impact.
4. Revise scope, dependencies, and acceptance criteria.
5. Implement and test the smallest coherent change.
6. Update [Implementation Progress](progress.md).

Follow the [GitHub Pull Request Workflow](github-push-workflow.md) only when the
task includes committing or publication. Inspect the branch and working tree,
stage only intended paths, keep secrets and generated output out of Git, record
validation, and process required CI and review gates without bypassing them.

## 11. Architectural guardrails

All new work must preserve these invariants:

- PANDA has exactly five fundamental capabilities: Perception, Analysis,
  Network, Decision, and Action.
- Capabilities are independently selectable responsibilities, not steps in a
  fixed loop.
- Any capability can request any policy-permitted capability, itself, wait, or
  termination.
- The runtime coordinates execution; an LLM can implement reasoning but is
  neither required nor the controller.
- Goals, signals, observations, assessments, messages, decisions, action
  requests, outcomes, failures, transitions, state, and execution context have
  distinct contracts and ownership.
- Runtime state is execution-scoped. A single process-wide current state is
  legacy scaffold behavior.
- Proposed transitions and effects are checked by policy before commitment.
- Decisions, transitions, connector calls, outcomes, verification evidence,
  and failures remain causally traceable.
- Connectors isolate protocols and privileges behind responsibility-specific
  boundaries.
- PANDA remains model-independent, local-first, observable, and usable without
  a broker, database, daemon, or LLM.
- Failure, rejection, timeout, cancellation, partial effect, and unknown effect
  remain distinct from success.
- Untrusted input keeps provenance and trust metadata until validation;
  confidence is not authorization.

The accepted ADRs under `docs/architecture/decisions/` explain the reasoning
behind these boundaries.

## 12. Known limitations and deferred work

New contributors should not assume the following exists today:

- canonical five-capability TypeScript contracts;
- first-class goals or independent executions;
- dynamic capability coordination;
- execution-scoped trace storage or causal trace APIs;
- policy evaluation, approvals, sandbox enforcement, or real connector effects;
- independent environmental verification of action outcomes;
- durable sessions, executions, events, or restart recovery;
- authentication, authorization, or production-safe network exposure;
- API endpoint configuration shared across daemon, SDK, CLI, and dashboard;
- an actual database despite the `PANDA_DB` configuration value;
- LLM or model-provider integration;
- retries, deadlines, cancellation propagation, or resource budgets;
- multiple agents, a plugin marketplace, MCP support, cloud synchronization,
  vector memory, mobile applications, or Docker deployment;
- comprehensive runtime, API, WebSocket, UI, or end-to-end tests; or
- configured linting, formatting, or coverage enforcement.

The detailed implementation order and phase gates are in the
[v0.1 Implementation Plan](v0.1-implementation-plan.md). Do not pull a deferred
feature into an earlier phase without updating its dependencies, safety gates,
and acceptance criteria.

## 13. Troubleshooting

### A workspace import cannot find `dist/index.js`

Build the repository before starting development:

```bash
pnpm build
```

On a fresh clone, ignored build outputs do not exist. After package-source
changes, consumers may also be reading stale generated output.

### `pnpm run doctor` reports that the daemon is unavailable

Confirm the daemon is running on the default endpoint:

```bash
curl http://127.0.0.1:4317/health
```

If the daemon uses a custom port, note that `doctor` currently constructs the
SDK client with the hard-coded default URL.

### Port 4317 or 5173 is already in use

Inspect the owning process before stopping anything:

```bash
lsof -nP -iTCP:4317 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

The daemon port can be changed with `PANDA_PORT`, but dashboard and default SDK
URLs must then be updated or configured separately. The dashboard dev port is
set in both its package script and Vite configuration.

### Sessions disappeared

This is expected after a daemon restart. `PANDA_DB` is not connected to a
database implementation, and `InMemoryPandaStore` is the only session store.

### A filesystem or GitHub action reports success but nothing happened

The current connectors are stubs. They return an accepted result for supported
action types but do not perform the effect. Real filesystem work begins only
after the v0.1 policy phase establishes its sandbox and authorization rules.

### A package change does not appear in the live app

Rebuild workspace outputs, then restart the development process if needed:

```bash
pnpm build
pnpm dev
```

The root development command does not watch `packages/*/src` directly.

## 14. Suggested reading order

For a first small code change:

1. This guide.
2. The affected package source and tests.
3. [Implementation Progress](progress.md).
4. [Conceptual Architecture](architecture/conceptual-architecture.md).
5. The relevant focused architecture document and ADR.

For Phase 2 or later runtime work, continue with:

1. [Framework Requirements](requirements.md).
2. [PANDA v0.1 Frozen Scope Contract](v0.1-scope-contract.md).
3. [PANDA v0.1 Implementation Plan](v0.1-implementation-plan.md).
4. [Transitions and Events](architecture/transitions.md).
5. [State, Context, and Goals](architecture/state-context-goals.md).
6. [Policies](architecture/policies.md),
   [Failure Model](architecture/failure-model.md), and
   [Observability](architecture/observability.md).

## 15. Definition of done

A PANDA change is complete when:

- its documented scope and acceptance criteria are met;
- implementation follows the current requirements and accepted architecture;
- relevant tests cover success, failure, and regression behavior;
- focused checks and repository-wide checks pass in proportion to impact;
- API, SDK, examples, UI, and documentation agree with changed behavior;
- no credential, generated wallet, build output, or unrelated user change is
  included;
- limitations, deviations, risks, and follow-up work are recorded; and
- the architecture, phase plan, implementation, tests, and progress record tell
  the same story.
