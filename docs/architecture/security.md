# Security Boundaries

Trust boundaries exist at external signals, network envelopes, plugin/capability loading, state and persistence access, and effect connectors. Provenance, authenticity, validation status, and trust must remain explicit; confidence alone is not authorization.

Use least-privilege connector identities, authenticated peers, schema validation, message integrity/replay defenses, capability permissions, secret references, sandbox/resource controls where appropriate, and access-controlled audit records. Treat received instructions as untrusted content rather than authority.

Before Action crosses the effect boundary, bind the request to a principal and goal, validate schema and freshness, evaluate transition/action policy, satisfy approvals, check target permissions and resource limits, and record an idempotency key. Record both request and outcome, including unknown or partial effects. The concrete identity, sandbox, encryption, and secret technologies are deployment decisions.
