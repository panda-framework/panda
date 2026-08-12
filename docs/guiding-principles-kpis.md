# PANDA Guiding Principles and KPI Scorecard

**Status:** Living guidance

**Scope:** Product direction, architecture, delivery, and runtime operation

**Authority:** Non-normative. The [framework requirements](requirements.md) and
accepted architecture decisions remain authoritative. A KPI never permits a
safety, security, policy, or conformance requirement to be weakened.

## Purpose

PANDA should be judged not only by what it can do, but by how it pursues a
goal. The principles below turn the project's intended character into
observable engineering behavior. They guide tradeoffs, while the KPIs make
those tradeoffs reviewable without pretending that a single number represents
the quality of an intelligent system.

## How to use the scorecard

- Evaluate every applicable KPI for each release or completed implementation
  phase. For longer periods without a release, review it at least quarterly.
- Record the measurement window, denominator, result, target, and evidence.
  Mark a KPI `not applicable` only with a reason.
- Treat the targets below as minimum guardrails. A project or deployment may
  set stricter workload-specific targets.
- Do not average the KPIs into one score. A strong result in one principle
  cannot offset a policy bypass, unsafe effect, corrupted state, or unsupported
  release claim.
- Report a missed target with an owner or follow-up decision; never improve a
  metric by hiding failures, reducing required evidence, or narrowing a
  denominator after measurement.

The initial baseline should be recorded in the next active phase or release
report. Historical evidence may be cited only when it actually measures the
KPI as defined here.

## Guiding principles and key performance indicators

| Guiding principle | Operational meaning | Key performance indicators and minimum target | Primary evidence and related documentation |
| --- | --- | --- | --- |
| **Calm strength** | Stay controlled under load or uncertainty; enforce boundaries without thrashing or panic. | Policy or safety bypasses: **0**. Executions escaping configured transition, time, retry, or resource bounds: **0**. | Policy decisions, limit tests, and incident records. See [Policies](architecture/policies.md), [Failure Model](architecture/failure-model.md), and [Safety requirements](requirements.md#15-safety-and-constraints). |
| **Patience** | Wait for evidence or authority when acting now would be unsafe or premature. | Applicable wait, backoff, and bounded-retry scenarios passing: **100%**. Duplicate or unsafe effects caused by retry: **0**. | Wait/retry traces and scenario tests. See [Transitions](architecture/transitions.md), [Failure Model](architecture/failure-model.md), and [Planning requirements](requirements.md#11-planning-and-replanning). |
| **Balance** | Balance capability, safety, reliability, usability, cost, and operator control. | Releases with evidence for every applicable correctness, safety, security, operability, and usability gate: **100%**. Releases shipped with a known critical regression in any gate: **0**. | Release matrix, validation report, risk register, and limitations. See [Implementation Progress](progress.md), [Security](architecture/security.md), and [Non-functional requirements](requirements.md#19-non-functional-requirements). |
| **Adaptability** | Change route, strategy, component, or plan when evidence and conditions change. | Applicable replanning, alternate-route, and failure-recovery scenarios passing: **100%**. Changed replaceable boundaries with contract coverage: **100%**. | Route traces, fault injection, and compatibility tests. See [Conceptual Architecture](architecture/conceptual-architecture.md), [Capability Contracts](architecture/capabilities.md), and [Failure and recovery requirements](requirements.md#16-failure-and-recovery). |
| **Gentle power** | Prefer the least force and privilege needed to produce a verified effect. | Effect attempts evaluated by independent policy before execution: **100%**. Protected or unauthorized effects executed: **0**. | Policy and connector audit records. See [Policies](architecture/policies.md), [Connectors](architecture/connectors.md), and [Action requirements](requirements.md#9-action). |
| **Resilience** | Fail explicitly, preserve trustworthy state, and recover without compounding harm. | Supported restart and fault-recovery scenarios passing: **100%**. Replays of uncertain non-idempotent effects: **0**. | Restart tests, recovery traces, and durability reports. See [Failure Model](architecture/failure-model.md), [Runtime Boundary](architecture/runtime.md), and [Failure and recovery requirements](requirements.md#16-failure-and-recovery). |
| **Curiosity** | Seek missing evidence, surface uncertainty, and test assumptions before forcing a conclusion. | Applicable missing-information and conflict scenarios that gather, wait, or escalate correctly: **100%**. Material decisions presenting unsupported inference as fact: **0**. | Assessments, information-need routes, provenance, and conflict tests. See [State, Context, and Goals](architecture/state-context-goals.md) and [Analysis requirements](requirements.md#6-analysis). |
| **Presence** | Attend to the current goal, context, environment, and evidence freshness. | Material trace records with required correlation and causation: **100%**. Time-sensitive evidence carrying the required observation/receipt time and freshness context: **100%**. | Causal traces and evidence records. See [Observability](architecture/observability.md), [State, Context, and Goals](architecture/state-context-goals.md), and [Observability requirements](requirements.md#17-observability-and-auditability). |
| **Simplicity** | Keep the core small, explicit, understandable, and free of accidental machinery. | Fundamental capability identities in the core model: **exactly five**. New required infrastructure or public abstractions without a documented need and owner: **0**. | Architecture review, dependency changes, and ADRs. See [PANDA Architecture](architecture/README.md), [Conceptual Architecture](architecture/conceptual-architecture.md), and [Developer Onboarding](developer-onboarding.md#11-architectural-guardrails). |
| **Harmony with nature** | Fit the operating environment: be resource-aware, local-first, and proportionate to the workload. | Releases with declared and measured workload-specific latency, throughput, and resource budgets: **100%**. Unexplained budget regressions: **0**. | Performance measurements, dependency review, and deployment profile. See [Runtime Boundary](architecture/runtime.md), [Project Expenses](project-expenses.md), and [Performance requirements](requirements.md#19-non-functional-requirements). |
| **Focus** | Keep work tied to an explicit goal and its verifiable success conditions. | Active milestone deliverables mapped to a goal, requirement, or explicit non-goal: **100%**. Goals accepted without verifiable success criteria: **0**. | Phase plan, Goal records, and acceptance tests. See [State, Context, and Goals](architecture/state-context-goals.md), [Goal requirements](requirements.md#3-goals), and the [Implementation Plan](v0.1-implementation-plan.md). |
| **Playfulness** | Make room for safe exploration and learning without weakening production boundaries. | Experiments isolated to an authorized sandbox, fixture, or test environment: **100%**. Completed experiments with a recorded result or learning: **100%**. | Experiment notes, sandbox policy, and tests. See [Policies](architecture/policies.md), [Worked Example](architecture/examples.md), and [Developer Onboarding](developer-onboarding.md#8-development-workflow). |
| **Quiet confidence** | Make modest claims that are supported by inspectable evidence. | Release and goal-completion claims linked to retrievable verification evidence: **100%**. Goals marked achieved from dispatch success alone: **0**. | Release evidence, Outcome-to-Observation links, and verification Assessments. See [Observability](architecture/observability.md), [Action requirements](requirements.md#9-action), and [Implementation Progress](progress.md). |
| **Steady growth** | Improve in small, validated increments while retaining what already works. | Completed milestones with acceptance evidence and documented remaining limits: **100%**. Relevant previously passing release scenarios regressed at completion: **0**. | Phase completion records, regression suite, and progress history. See [Implementation Progress](progress.md), [Developer Onboarding](developer-onboarding.md#14-definition-of-done), and the [phase plans](plans/phase-0.md). |
| **Natural flow of thought and action** | Let evidence move coherently from perception and analysis through decision, authorized action, observation, and learning without imposing a fixed loop. | Material transitions with a reason, trigger, causal link, and policy result: **100%**. Supported golden paths completed without unplanned operator repair: **100%**. | Transition records, end-to-end traces, and golden-path tests. See [Transitions](architecture/transitions.md), [Conceptual Architecture](architecture/conceptual-architecture.md), and [Dynamic transition requirements](requirements.md#10-dynamic-transitions-and-autonomous-execution). |

## Review record

Add the scorecard result to the applicable phase plan, release profile, or
[Implementation Progress](progress.md) update. A compact record is sufficient:

```text
Measurement window:
Scope and workload:
Evidence version or commit:

Principle | KPI | Result | Target | Status | Evidence | Follow-up
```

Use `met`, `missed`, or `not applicable` for status. Evidence should point to a
test, trace, measurement, review, or decision that another contributor can
inspect. Where a KPI misses its target, record whether the release is blocked,
the risk is accepted by an authorized owner, or follow-up work is required.

## Relationship to the rest of the documentation

This scorecard is the shared interpretation layer across the documentation:

- [Framework Requirements](requirements.md) define what a conforming system
  must do; the scorecard must not dilute those requirements.
- [PANDA Architecture](architecture/README.md) defines the boundaries and
  invariants through which the principles are implemented.
- [Observability](architecture/observability.md) defines the trace, metric, and
  audit evidence used to calculate KPI results.
- [Developer Onboarding](developer-onboarding.md) applies the principles during
  scoping, implementation, review, and validation.
- [Implementation Progress](progress.md) is the current home for project-level
  KPI evidence and follow-up direction.
- [GitHub Pull Request Workflow](github-push-workflow.md) keeps each change
  focused, reviewable, validated, and linked to durable delivery evidence.
