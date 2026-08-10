# ADR-002: Framework and Runtime Separation

**Status:** Accepted

## Context

PANDA must support both embedded libraries and an operating runtime. Requiring a daemon, scheduler, or broker would make infrastructure part of the model.

## Decision

The framework owns concepts, contracts, conformance, extension points, and ports. A runtime optionally coordinates lifecycle, routing, state, policy, persistence, and operations while depending on framework contracts.

## Alternatives

- Runtime-only platform: operationally uniform but hard to embed.
- Contracts-only library: portable but leaves recurring coordination semantics undefined.

## Consequences

Local direct invocation remains valid and a full runtime can grow independently. APIs must avoid leaking daemon-specific assumptions into core contracts.
