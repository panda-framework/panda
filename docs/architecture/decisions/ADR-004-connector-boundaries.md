# ADR-004: Responsibility-Specific Connector Boundaries

**Status:** Accepted

## Context

Signals, message exchange, and external effects have different semantics and security needs. The scaffold's single connector interface combines all three.

## Decision

Define separate Perception adapter, Network connector, and Action connector ports, with optional shared lifecycle, health, and metadata traits.

## Alternatives

- One universal connector: convenient registration but weak typing and oversized implementations.
- Embed technology clients in capabilities: initially direct but couples reasoning to mechanisms and privileges.

## Consequences

Boundary contracts stay narrow, testable, and least-privileged. A registry may need to manage several connector categories.
