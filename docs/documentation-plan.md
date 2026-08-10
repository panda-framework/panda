# PANDA Documentation Plan

**Status:** Active

**Last reviewed:** 2026-08-10

**Applies to:** Repository documentation through the PANDA v0.1 release

## 1. Purpose

This plan is the prioritized source of truth for documentation work that is
not already owned by an active implementation phase. It identifies the
audience, timing, dependencies, status, and completion standard for each
deliverable so documentation can be selected and shipped deliberately rather
than accumulated as disconnected files.

The [documentation index](README.md) remains the navigation entry point. The
[v0.1 implementation plan](v0.1-implementation-plan.md) owns product phase
order, and individual [phase plans](plans/) own the documentation required to
complete one implementation phase. This document coordinates the broader
user, contributor, reference, community, and release documentation around
those sources.

## 2. Documentation principles

1. **Describe the repository that exists.** Clearly distinguish current
   executable behavior, approved architecture, and future direction.
2. **Document for a named audience and task.** A new user, integrator,
   capability author, contributor, operator, and maintainer need different
   entry points.
3. **Keep one authoritative source.** Link to requirements, architecture, or a
   reference page instead of copying normative detail into multiple guides.
4. **Ship documentation with behavior.** Public API, configuration, workflow,
   and compatibility changes update their documentation in the same pull
   request.
5. **Use tested examples.** Commands and code samples must match supported
   versions and the current repository layout.
6. **State maturity and limitations.** Experimental, legacy, simulated,
   unauthenticated, in-memory, and deferred behavior must be visible where a
   reader makes a decision.
7. **Protect sensitive information.** Documentation must not contain tokens,
   seed phrases, private endpoints, personal data, or unsafe operational
   instructions.

## 3. Current baseline

The repository already has strong internal design and implementation-planning
coverage:

- normative framework requirements;
- conceptual and focused architecture documents;
- accepted architecture decision records;
- a frozen v0.1 scope contract and dependency-ordered implementation plan;
- completed plans for Phases 0 through 3;
- developer onboarding, troubleshooting, and validation guidance;
- implementation progress, project expenses, licensing, and GitHub publication
  workflow.

The primary gaps are the public quickstart, contributor and security entry
points, standalone interface references, extension guides, community health
files, and release or operations documentation.

## 4. Priority and status model

| Value | Meaning |
| --- | --- |
| `P0` | Required before the next dependent implementation, public adoption, or release gate |
| `P1` | High-value documentation that should ship with the relevant v0.1 capability |
| `P2` | Important once the project, contributor base, or deployment model grows |
| `Ready` | Scope is understood and dependencies are available |
| `Needs decision` | A maintainer must supply policy, ownership, or contact information |
| `Deferred` | A named implementation phase must land before the document can be accurate |
| `In progress` | Work has started on a branch |
| `In review` | A pull request is open |
| `Complete` | The document is merged and linked from the appropriate index |

Items are selected by taking the highest-priority `Ready` item whose
dependencies are satisfied. A lower-priority document may move first when it
must accompany the implementation that makes it accurate.

## 5. Prioritized backlog

| ID | Deliverable | Priority | Status | Timing and dependency |
| --- | --- | --- | --- | --- |
| `DOC-001` | Phase 4 implementation plan (`docs/plans/phase-4.md`) | `P0` | `Ready` | Before deterministic capability implementation begins |
| `DOC-002` | Root README status and five-minute quickstart refresh | `P0` | `Ready` | Now; reconcile the legacy seven-state scaffold with the canonical five-capability direction |
| `DOC-003` | Contributor guide (`CONTRIBUTING.md`) | `P0` | `Ready` | Before actively soliciting outside contributions; link to developer onboarding rather than duplicate it |
| `DOC-004` | Vulnerability reporting policy (`SECURITY.md`) | `P0` | `Needs decision` | Before external adoption; requires a private reporting channel and supported-version policy |
| `DOC-005` | Daemon HTTP and WebSocket reference (`docs/reference/api.md`) | `P1` | `Deferred` | Draft with Phase 8 API/SDK integration so routes, schemas, errors, authentication, and events are stable |
| `DOC-006` | Public TypeScript API reference (`docs/reference/typescript-api.md`) | `P1` | `Deferred` | Start after Phase 4; finalize after Phase 8 and label canonical, legacy, experimental, and stable exports |
| `DOC-007` | Capability authoring guide (`docs/guides/custom-capability.md`) | `P1` | `Deferred` | Write with or immediately after Phase 4 using a tested capability example |
| `DOC-008` | Connector authoring guide (`docs/guides/custom-connector.md`) | `P1` | `Deferred` | Write after Phases 5 through 7 establish policy, effects, outcomes, and verification |
| `DOC-009` | Testing guide (`docs/testing.md`) | `P1` | `Ready` | Now; cover test levels, workspace build order, fixtures, safety cases, and release validation |
| `DOC-010` | Configuration reference (`docs/reference/configuration.md`) | `P1` | `Deferred` | Finalize with Phase 8 when daemon, client, path, and persistence configuration is settled |
| `DOC-011` | Tutorials and runnable examples (`docs/tutorials/`) | `P1` | `Deferred` | Build across Phases 4 through 8; include first run, SDK, capability, connector, and verified `proof.txt` flows |
| `DOC-012` | Community health files | `P1` | `Needs decision` | Add `CODE_OF_CONDUCT.md`, `SUPPORT.md`, issue templates, pull-request template, and optional `CODEOWNERS` before community growth |
| `DOC-013` | Versioning, release policy, and `CHANGELOG.md` | `P0` | `Deferred` | Required in Phase 11 before the first v0.1 release or package publication |
| `DOC-014` | Public roadmap (`ROADMAP.md`) | `P2` | `Ready` | Derive a concise milestone view from the implementation plan without repeating technical detail |
| `DOC-015` | Governance and maintainer guide (`GOVERNANCE.md`) | `P2` | `Needs decision` | Required when decision and release authority extends beyond the current maintainers |
| `DOC-016` | Deployment and operations guide (`docs/operations/`) | `P2` | `Deferred` | Write after persistence, authentication, observability, backup, and supported service-management choices exist |

## 6. Delivery sequence

### Now: project entry and Phase 4 readiness

1. Create the Phase 4 implementation plan.
2. Refresh the root README so a visitor can identify project maturity and run
   the current stack successfully.
3. Add the contributor guide and testing guide.
4. Decide the private vulnerability-reporting channel, then add
   `SECURITY.md`.

### During Phases 4 through 7: extension and safety guides

1. Add the capability authoring guide with the first deterministic capability
   implementations.
2. Begin the TypeScript reference and clearly label unstable exports.
3. Add the connector guide only after policy, effect execution, outcome
   feedback, and independent verification are implemented.
4. Grow tutorials from executable tests and supported examples rather than
   hypothetical APIs.

### During Phases 8 through 10: interfaces and migration

1. Publish the standalone daemon API, WebSocket event, SDK, and configuration
   references.
2. Document legacy-to-canonical migration before removing the seven-state
   execution path.
3. Update the README quickstart to use the canonical daemon and SDK path.
4. Document the trace dashboard workflow and interpretation of execution
   records.

### Phase 11: release readiness

1. Define semantic versioning, schema compatibility, deprecation, and support
   expectations.
2. Add the changelog and release process.
3. Complete community health files required for public contribution.
4. Run a documentation release audit covering installation, examples, API,
   configuration, security, migration, licensing, and known limitations.

## 7. Information architecture

New documents should use these locations unless an established repository
convention is a better fit:

```text
README.md                    Project identity, maturity, and fastest start
CONTRIBUTING.md              Contribution entry point
SECURITY.md                  Vulnerability reporting and supported versions
CHANGELOG.md                 User-visible release history
ROADMAP.md                   Concise public milestones
docs/
  README.md                  Complete documentation index
  documentation-plan.md     Documentation roadmap and status
  developer-onboarding.md   Repository development workflow
  testing.md                Test strategy and commands
  tutorials/                Task-oriented learning paths
  guides/                   Goal-oriented extension and operation guides
  reference/                Exact API, SDK, configuration, and schema facts
  architecture/             Design invariants, boundaries, and ADRs
  plans/                    Phase-specific implementation contracts
  operations/               Deployment, backup, monitoring, and recovery
```

Do not reorganize existing documents solely to match this tree. Create a new
directory when the first approved document needs it, then update links in the
same change.

## 8. Maintenance triggers

| Repository change | Documentation that must be reviewed in the same pull request |
| --- | --- |
| Public TypeScript type or export | TypeScript reference, affected examples, onboarding, and migration notes |
| Daemon route, schema, status code, or event | API reference, SDK reference, dashboard assumptions, and examples |
| CLI command or configuration default | Root README, onboarding, configuration reference, and troubleshooting |
| Capability or transition semantics | Requirements, architecture, ADRs when needed, active phase plan, and trace examples |
| Connector permission or external effect | Connector guide, security boundaries, policy documentation, and failure behavior |
| Authentication, secret, or trust-boundary change | `SECURITY.md`, architecture security, configuration, and operations guidance |
| Phase start | Add or approve the detailed phase plan and link it from progress and the documentation index |
| Phase completion | Add its completion record and update progress, implementation plan, onboarding, and this backlog |
| Breaking or deprecated behavior | Migration guidance, compatibility policy, changelog, and release notes |
| Release | Changelog, supported versions, installation, quickstart, API/reference version labels, and known limitations |

## 9. Documentation definition of done

A documentation deliverable is complete when:

- its intended audience and task are clear from the opening section;
- statements match current code, tests, accepted requirements, and
  architecture;
- current behavior, target behavior, and deferred work are not conflated;
- commands and code samples were exercised against the documented versions;
- security, data-loss, authentication, and external-effect limitations are
  visible at the decision point;
- normative statements link to the authoritative requirement, architecture
  document, ADR, or phase contract;
- local links and paths resolve, Markdown whitespace checks pass, and the page
  is linked from the root README or documentation index as appropriate;
- no credentials, recovery phrases, private data, generated output, or
  machine-specific paths are included;
- changed behavior and corresponding documentation ship together; and
- the pull request reports the exact validation performed and any unavailable
  lint, render, or example checks.

## 10. Tracking and review

- Keep each documentation pull request focused on one backlog item unless two
  items are inseparable for correctness.
- Update an item's status in this plan when work starts, enters review, or
  merges.
- Add newly discovered work to the backlog with an ID, priority, dependency,
  and target location before implementation begins.
- Review this plan at every phase boundary and before every release candidate.
- Move completed items to a short completion history during periodic cleanup;
  Git history and pull requests retain implementation detail.
