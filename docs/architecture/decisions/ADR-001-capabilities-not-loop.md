# ADR-001: Capabilities Rather Than a Fixed Loop

**Status:** Accepted

## Context

Autonomous work needs revisiting evidence, coordination, retries, waiting, human input, and termination. A P→A→N→D→A loop makes letter order an accidental control constraint.

## Decision

Perception, Analysis, Network, Decision, and Action are five responsibility boundaries. No execution order is intrinsic to PANDA.

## Alternatives

- A mandatory loop: simple but cannot express recovery and information gathering honestly.
- Seven cognitive stages: useful techniques but conflicts with PANDA's definition and makes implementations prescriptive.

## Consequences

Implementations are replaceable and flows are adaptive. Coordination and termination must be modeled explicitly, and diagrams/examples must avoid implying a canonical loop.
