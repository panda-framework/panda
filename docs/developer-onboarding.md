# PANDA Developer Onboarding

Welcome to PANDA. This guide explains how to set up the repository and make
changes using PANDA's documentation-first, dependency-driven development flow.

## 1. Set up the repository

PANDA is a TypeScript pnpm monorepo containing applications in `apps/`, shared
packages in `packages/`, examples in `examples/`, and project records in
`docs/`.

Install dependencies and verify the current checkout:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Start the daemon and dashboard together with:

```bash
pnpm dev
```

The daemon listens on `http://127.0.0.1:4317` by default. See the root
[README](../README.md#initial-typescript-scaffold) for the workspace layout,
CLI commands, and local API endpoints.

## 2. Learn the current source of truth

Before planning or implementing a change, review the documentation and current
repository state relevant to it:

1. [Framework requirements](requirements.md)
2. [Conceptual architecture](architecture/conceptual-architecture.md) and its
   focused architecture documents
3. [v0.1 implementation plan](v0.1-implementation-plan.md)
4. [v0.1 frozen scope contract](v0.1-scope-contract.md)
5. [Implementation progress](progress.md) and the active phase plan under
   [`plans/`](plans/)
6. Open issues, recent commits, tests, and the affected implementation

When these sources disagree, do not silently choose one. Identify whether the
conflict is an outdated scaffold assumption, an unresolved requirement, or a
new architectural decision. Update or propose the appropriate documentation
before relying on the changed behavior in code.

### Architectural guardrails

New work must follow PANDA's current architectural direction:

- PANDA has five fundamental capabilities: Perception, Analysis, Network,
  Decision, and Action.
- Capabilities are dynamically connected responsibilities, not stages in a
  fixed loop. Any capability may request any policy-permitted next capability,
  wait, or terminate.
- The runtime or scheduler controls execution. An LLM may implement reasoning,
  but it is not the controller and is not required.
- Connectors, observations, events, state, context, policies, memory,
  decisions, actions, outcomes, and failures have distinct responsibilities
  and contracts.
- The system remains modular, model-independent, local-first, observable, and
  usable with minimal dependencies.
- The current scaffold contains legacy seven-state terminology. Follow the
  documented additive migration plan instead of extending that legacy model in
  new contracts.

## 3. Plan work in dependency order

Break a change into the smallest coherent phase that can be reviewed, tested,
documented, and logged independently. Do not start implementation until its
interfaces, data models, architectural decisions, and upstream dependencies
are sufficiently defined.

A phase plan must state:

- the problem and objective;
- relevant architecture references and current repository state;
- scope and explicit non-goals;
- dependencies, risks, and expected files or components;
- an ordered implementation plan;
- acceptance criteria;
- unit, integration, regression, and runtime validation as applicable; and
- documentation and progress-log updates required for completion.

Use [Phase 0](plans/phase-0.md) as the repository's initial example. The broader
dependency order for v0.1 is maintained in the
[implementation plan](v0.1-implementation-plan.md); update that plan when
evidence changes phase dependencies or release gates.

For work beyond the current plan, use this typical ordering as a guide:

1. Foundation: conventions, shared types, configuration, observability,
   testing, and documentation structure.
2. Runtime primitives: observations, events, state and context models,
   contracts, and transport abstractions.
3. Core execution: coordination, transitions, policies, and lifecycle.
4. Extensibility: connector and plugin contracts, persistence, and action
   dispatch.
5. Reference capabilities: minimal capability implementations.
6. Interfaces: daemon API, CLI, dashboard protocol, and developer SDK.
7. Hardening: integration tests, performance, security, recovery, and examples.

## 4. Implement incrementally

Keep each change narrow and reviewable:

- Implement the documented contract; do not introduce undocumented behavior.
- Keep runtime authority in the runtime and communicate through defined
  interfaces.
- Add tests with the implementation.
- Update types, examples, interfaces, and documentation when behavior changes.
- Avoid pulling deferred features into the active phase without revising its
  scope and dependencies.
- Stop and resolve architecture conflicts in documentation instead of coding
  around them.

Preserve compatibility when the active phase requires an additive migration.
Remove legacy behavior only after its callers have moved and the applicable
phase exit gate permits removal.

## 5. Validate the result

A phase or meaningful change is complete only when:

- its acceptance criteria are met;
- relevant unit, integration, and regression tests pass;
- build, type-check, and runtime checks pass where applicable;
- the implemented behavior and documentation agree;
- known limitations, risks, and follow-up work are recorded; and
- upstream contracts and later phase assumptions remain valid.

Run the repository-wide checks when the change can affect multiple workspaces:

```bash
pnpm build
pnpm typecheck
pnpm test
```

Also run focused tests and runtime checks for the components you changed. For a
documentation-only change, at minimum inspect links and run:

```bash
git diff --check
```

If validation reveals a flaw in the plan or architecture, pause implementation,
update the relevant documentation and acceptance criteria, and then adjust the
code deliberately.

## 6. Record completion

Update [Implementation Progress](progress.md) after every completed milestone
or meaningful change. The entry should record:

- date, phase, objective, and status;
- what was implemented and which components changed;
- tests and validation performed;
- decisions made or revised;
- deviations from the plan and their reasons; and
- known limitations, risks, and follow-up tasks.

Use one of these statuses: `planned`, `in progress`, `blocked`, `completed`, or
`superseded`. The record should let another contributor understand what changed,
why it changed, and what should happen next without reconstructing the work
from code alone.

When committing and publishing work, follow the credential and validation
requirements in the [GitHub push workflow](github-push-workflow.md).

## 7. Handle change without losing traceability

Plans are controlled, versioned guides rather than fixed predictions. When new
evidence requires a change:

1. Record the evidence or problem.
2. Update the relevant architecture document or decision record.
3. Assess the impact on active and future phases.
4. Revise dependencies, scope, and acceptance criteria.
5. Implement the smallest coherent change.
6. Test it.
7. Record the result in the progress log.

## Definition of done

PANDA work is done only when its architecture, phase plan, implementation,
tests, documentation, and progress record agree with one another.
