# ADR-003: Explicit Dynamic Capability Transitions

**Status:** Accepted

## Context

Arbitrary capability movement is fundamental, but hidden direct calls obscure reason, policy, and causality.

## Decision

A capability proposes a typed next step. Coordination validates and policy-checks it, then records a committed transition. Any target or self-transition is structurally valid; wait and terminate are also valid.

## Alternatives

- Direct capability calls: minimal but tightly coupled and poorly observable.
- Predeclared global state-machine graph: inspectable but makes dynamic behavior and concurrency cumbersome.
- Events only: decoupled but blurs request versus fact.

## Consequences

Transitions become auditable and governable. A coordinator is needed for runtime use, while embedded applications may implement the protocol directly.
