# ADR-006: State, Context, and Goal Ownership

**Status:** Accepted

## Context

Generic mutable dictionaries obscure lifetime, authority, concurrency, persistence, and security. A single session `currentState` cannot represent concurrent goals.

## Decision

Repositories own durable system state and believed environment state. The coordinator owns scoped execution context. Goals are first-class durable entities. Capabilities consume snapshots and propose explicit updates.

## Alternatives

- Shared mutable blackboard: flexible but difficult to audit and race-prone.
- Capability-owned global state: encapsulated locally but fragments consistency and recovery.
- Event sourcing as mandatory: strong history but excessive as a core requirement.

## Consequences

Ownership and tests are clearer, causal context propagates consistently, and concurrency requires versions/conflict handling. Storage style remains an implementation decision.
