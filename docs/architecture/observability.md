# Observability

Every execution has a correlation ID; every invocation, transition, message, decision, action, outcome, state mutation, and failure has an ID and causation link. This produces a navigable causal history rather than only chronological logs.

Required records answer what was perceived, what evidence and analysis were used, what information crossed boundaries, which options and policies applied, why a decision was selected, what effect was attempted, what occurred, and what happened next. Decision reasons may be structured explanations or references; PANDA does not claim access to hidden model reasoning.

Traces represent invocations and connector calls, structured logs describe operational detail, metrics summarize health/latency/rates, and audit records capture security- and effect-relevant facts. Redaction, access control, retention, and payload hashing protect secrets and personal data. Telemetry backend choice is deferred.
