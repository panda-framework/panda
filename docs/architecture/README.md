# PANDA Architecture

This directory defines the conceptual architecture of PANDA: **Perception, Analysis, Network, Decision, and Action**. The authoritative specification is [conceptual-architecture.md](conceptual-architecture.md).

PANDA's design philosophy is **simple core, powerful composition**. The five names are independently replaceable capabilities, not positions in a mandatory loop.

The project-wide [Guiding Principles and KPI
Scorecard](../guiding-principles-kpis.md) connects that philosophy to measurable
review and operational evidence without adding architectural invariants.

## Documentation map

- [Conceptual architecture](conceptual-architecture.md) — scope, model, invariants, diagrams, repository findings, and open questions
- [Capability contracts](capabilities.md)
- [Transitions and events](transitions.md)
- [State, context, and goals](state-context-goals.md)
- [Connectors](connectors.md)
- [Runtime boundary](runtime.md)
- [Policies](policies.md)
- [Observability](observability.md)
- [Failure model](failure-model.md)
- [Security](security.md)
- [Worked example](examples.md)
- [Architecture decision records](decisions/README.md)
- [Guiding principles and KPI scorecard](../guiding-principles-kpis.md) —
  project-level measures mapped back to these architecture documents

## Status language

- **Core invariant**: intrinsic to PANDA; changing it changes what PANDA is.
- **Architectural decision**: a selected, revisable design.
- **Implementation decision**: deliberately deferred to an implementation.
- **Open question**: unresolved and requiring evidence or experience.
