# Connectors and Adapters

Connectors isolate mechanisms and privileges from the conceptual core. PANDA uses small, responsibility-specific ports:

- A **Perception adapter** receives/reads a mechanism-specific input and yields a `Signal`; Perception performs semantic normalization into an `Observation`.
- A **Network connector** sends and receives addressed envelopes, reporting delivery status and peer identity. An in-process transport is valid.
- An **Action connector** declares supported effect types and required permissions, executes an authorized request, and returns an `Outcome`.

Optional common traits include lifecycle, health, metadata, cancellation, and telemetry; they do not justify one universal execute/publish/subscribe interface. Capabilities and schema declarations enable discovery without promising that every connector is interchangeable.

Connectors validate boundary schemas, expose least-privilege requirements, avoid leaking secrets, support cancellation/deadlines where possible, and document idempotency. “Accepted” is distinct from “executed” and “effect verified.” A later Perception observation may verify the real-world effect.
