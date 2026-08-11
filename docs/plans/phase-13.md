# Phase 13 Plan: Authenticated API Principals and Guarded Network Exposure

**Status:** Complete (2026-08-10)

**Prerequisite:** [Phase 12 — Durable Local State and Safe Restart Recovery](phase-12.md)

**Phase source:** The first highest-impact item in the
[post-v0.1 follow-up direction](../progress.md#follow-up-direction)

## Objective and scope

Add an explicit trust boundary to the daemon API without turning the local
runtime into an identity platform. Phase 13 introduces optional static bearer
authentication for HTTP and WebSocket resources, resolves a successful
credential to one canonical service principal, carries that principal through
Goal ownership and effect policy, restricts browser origins, and refuses an
unauthenticated non-loopback listener.

Loopback development remains available without a token. It runs as the explicit
`panda-local` system principal and reports authentication mode `none` through
health. This phase extends the post-v0.1 development baseline; it does not
rewrite the frozen v0.1 release profile.

## Starting state

Phase 12 made local state durable and restart-safe, but the Fastify daemon still
accepted every request, enabled permissive CORS, and trusted any caller able to
reach the listener. `PrincipalReference` existed in shared contracts, yet the
daemon always assigned the Goal to `panda-daemon`, capability contexts normally
omitted a principal, and effect policy did not require or record one.

The listener defaulted to loopback, but setting `PANDA_HOST=0.0.0.0` or another
non-loopback address had no security guard.

## Non-goals

- Multi-user or multi-tenant authorization, per-resource access control, roles,
  scopes, organizations, or delegated credentials.
- OAuth/OIDC, JWT validation, sessions, browser login, password storage, token
  issuance, token rotation, revocation, or a secret manager.
- TLS termination, certificate management, reverse-proxy trust, request rate
  limiting, or denial-of-service protection.
- Persisting successful or failed API authentication attempts in the canonical
  execution trace.
- Supplying a bearer token to the dashboard UI or adding a WebSocket SDK.
- Implementing a real PANDA Network connector or claiming the Network
  requirements are satisfied.
- Changing the historical v0.1 support classification.

## Implementation tasks

1. Add validated bearer configuration from `PANDA_API_TOKEN` and
   `PANDA_API_PRINCIPAL_ID`. Require at least 32 non-whitespace token characters
   and never include the credential in errors, records, or health output.
2. Protect every execution and `/events` resource with the bearer credential
   when configured. Keep `/health` public so operators can inspect liveness and
   whether authentication mode is `none` or `bearer`.
3. Resolve the credential to one `service` principal, return the same structured
   `401 AUTHENTICATION_REQUIRED` response for missing, malformed, and incorrect
   credentials, and use a fixed-size digest comparison.
4. Propagate the request principal to signal provenance, Goal ownership,
   capability `ExecutionContext`, connector calls, and effect-policy inputs.
   Require every effect evaluation to have a valid principal.
5. Give embedded coordinators a deterministic system principal by default and
   give unauthenticated loopback API calls the explicit `panda-local` system
   principal.
6. Replace permissive CORS with an exact HTTP(S)-origin allowlist. Default to
   the two local dashboard origins and accept an explicit comma-separated
   `PANDA_ALLOWED_ORIGINS` value.
7. Reject daemon-process startup on every non-loopback host unless bearer
   authentication is configured. Treat `localhost`, IPv4 `127.0.0.0/8`, and
   IPv6 `::1` as loopback.
8. Add typed SDK `apiToken` support and a shared health response contract.
9. Update examples, README, onboarding, architecture notes, scaffold status,
   documentation index, implementation plan handoff, and progress log.

## Security behavior

| Boundary | Behavior |
| --- | --- |
| Loopback, no token | Starts in authentication mode `none`; protected resources execute as `panda-local` |
| Loopback, token configured | Execution HTTP and WebSocket resources require `Authorization: Bearer …` |
| Non-loopback, no token | Process refuses to listen with `UNAUTHENTICATED_NETWORK_EXPOSURE` |
| Non-loopback, token configured | Process may listen; bearer checks remain mandatory |
| `GET /health` | Public; reports mode only and never credential or principal details |
| Missing, malformed, or wrong credential | Uniform structured `401` with a Bearer challenge |
| Allowed browser origin | Exact origin is reflected by CORS |
| Unlisted browser origin | No access-control allow-origin header is emitted |
| Authorized effect | Policy evidence contains principal ID and type, not the token |

## Principal and credential boundary

`PANDA_API_TOKEN` is a process credential. It remains in process memory, is
compared through fixed-size digests, and never becomes a canonical record. The
configured principal defaults to `panda-api-client` and can be named with
`PANDA_API_PRINCIPAL_ID`. Changing that ID changes the owner of newly created
Goals; it does not rewrite retained history.

This is single-principal authentication, not multi-tenant authorization. An
authenticated caller can read every Execution retained by that daemon. TLS is
still required outside a trusted host or trusted terminating proxy because a
bearer credential is replayable if intercepted.

## Acceptance criteria

- Health is reachable without credentials and accurately reports `none` or
  `bearer`.
- Missing, malformed, and incorrect bearer credentials cannot create, list,
  read, trace, or subscribe to executions.
- A valid credential creates a successful execution whose Goal owner and effect
  policy evidence identify the configured principal.
- Serialized traces, responses, and errors do not contain the bearer token.
- The SDK sends a configured token in the Authorization header and never in the
  request body.
- Effect policy rejects a context with no valid principal.
- Local dashboard origins are the only defaults; malformed configured origins
  fail before the daemon accepts work.
- Non-loopback listener configuration without authentication fails before
  `listen`.
- The Phase 11 release matrix and Phase 12 restart behavior remain green.

## Validation plan

- Run core effect-policy and connector tests, including the missing-principal
  denial.
- Run SDK header/error tests and daemon API, WebSocket, CORS, release, and
  restart suites.
- Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm -r typecheck`, and
  `pnpm test`.
- Start the built daemon in bearer mode, create an execution through the typed
  SDK, and prove owner/policy principal evidence without token retention.
- Prove a non-loopback process configuration without a token exits before
  listening.
- Run `git diff --check`, local Markdown link/path validation, and Git hygiene
  checks for credentials, local state, wallets, and generated output.

## Risks and assumptions

### Risks

- A single static bearer token has coarse authorization and operational
  rotation limits.
- Bearer authentication without TLS does not protect a credential in transit.
- Health remains public by design and discloses basic daemon version,
  persistence, and authentication mode.
- The dashboard has no authenticated-mode token entry, so it is intended for
  the default loopback mode until a browser login/session design exists.
- CORS is a browser boundary, not authentication; non-browser clients are
  constrained by bearer authentication and network controls instead.

### Assumptions

- Operators generate, distribute, and rotate the static credential outside
  PANDA and prevent it from entering Git or logs.
- A reverse proxy that exposes PANDA is responsible for TLS and its own trusted
  forwarding configuration.
- One configured principal is sufficient for this bounded increment.
- Historical Goals retain the principal recorded when they were created.

## Completion record

Phase 13 completed the first authenticated daemon boundary:

- added validated static bearer authentication for execution HTTP and
  WebSocket resources;
- propagated the resolved principal into canonical provenance, Goal ownership,
  coordinator contexts, connector boundaries, and effect-policy evidence;
- required valid principal identity before the filesystem effect can be
  authorized;
- restricted CORS to exact configured origins and guarded non-loopback startup;
- added typed SDK token support and health authentication-mode reporting; and
- added focused security, API, WebSocket, CORS, SDK, policy, and regression
  tests while retaining the release and restart suites.

Final repository-wide validation is recorded in
[Implementation Progress](../progress.md). It included the frozen install,
every workspace build and typecheck, all 106 executable tests plus CLI
typechecking, an authenticated built-process SDK execution, the non-loopback
startup guard, 127 local Markdown paths across 47 files, diff and credential
hygiene, and the dashboard production build. No formatter or linter is
configured. Live browser QA was not required because dashboard code did not
change and authenticated browser login remains a documented non-goal. GitHub
publication evidence belongs to the workflow completion report after merge.
