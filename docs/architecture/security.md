# Security Boundaries

Trust boundaries exist at external signals, network envelopes, plugin/capability loading, state and persistence access, and effect connectors. Provenance, authenticity, validation status, and trust must remain explicit; confidence alone is not authorization.

Use least-privilege connector identities, authenticated peers, schema validation, message integrity/replay defenses, capability permissions, secret references, sandbox/resource controls where appropriate, and access-controlled audit records. Treat received instructions as untrusted content rather than authority.

Before Action crosses the effect boundary, bind the request to a principal and goal, validate schema and freshness, evaluate transition/action policy, satisfy approvals, check target permissions and resource limits, and record an idempotency key. Record both request and outcome, including unknown or partial effects. The concrete identity, sandbox, encryption, and secret technologies are deployment decisions.

The current post-v0.1 daemon has one bounded implementation of this boundary.
An optional static bearer credential resolves to one service principal; that
principal owns the new Goal, propagates through capability and connector
contexts, and is required in filesystem effect-policy evidence. The credential
itself is never written to canonical records. Loopback operation without a
credential uses the explicit `panda-local` system principal, while non-loopback
startup without authentication is rejected. Exact CORS origins restrict browser
access but are not treated as authentication.

This implementation is not an identity platform. It does not provide TLS,
multi-principal resource authorization, roles/scopes, credential issuance or
rotation, authentication audit persistence, or browser sessions. Deployments
outside a trusted host still require TLS and operational secret management.
