# ADR-007: Optional Event-Oriented Runtime Coordination

**Status:** Proposed

## Context

Events aid decoupling, recovery, extensibility, and audit, but mandatory asynchronous infrastructure would burden embedded and deterministic applications. The scaffold currently represents commands and facts as observations.

## Decision

A full runtime should expose immutable domain events and distinguish them from commands. Framework contracts must also support direct invocation; no broker, durable log, or event sourcing is required.

## Alternatives

- Events for every interaction: uniform but adds latency, delivery semantics, and conceptual ambiguity.
- Direct calls only: simple but makes durable workflows and independent subscribers difficult.
- Mandatory event sourcing: excellent replay but imposes storage and schema-evolution complexity.

## Consequences

Runtime implementations can gain observability and resilience without defining PANDA by a transport. Portable event names, delivery expectations, and the minimum conformance profile require implementation experience before acceptance.
