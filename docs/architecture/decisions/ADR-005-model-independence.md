# ADR-005: Model and LLM Independence

**Status:** Accepted

## Context

Rules, planners, optimization, ML, LLMs, and humans can provide Analysis or Decision behavior. Making an LLM the orchestrator would exclude deterministic and non-AI systems.

## Decision

Core contracts contain no provider- or model-specific requirement. Intelligence techniques are replaceable capability implementations and may be composed.

## Alternatives

- LLM-centered agent abstraction: fast for chat agents but ties architecture, observability, and control to one technique.
- Mandatory planner: stronger planning semantics but unnecessary for reactive or rule-based systems.

## Consequences

PANDA works without AI models and supports deterministic testing. Implementations must normalize technique-specific products into common contracts.
