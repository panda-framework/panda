# PANDA Framework Software Requirements

**Status:** Draft 1

**Scope:** Conceptual framework and conforming runtime implementations

**Normative terms:** The words **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**,
and **MAY** are to be interpreted as requirement levels. Only statements with a
PANDA requirement identifier are normative requirements.

## 1. Purpose and scope

PANDA is a framework for autonomous systems. Its five capabilities are
**Perception**, **Analysis**, **Network**, **Decision**, and **Action**. PANDA
defines the behavior and information an autonomous system needs in order to
pursue goals. It does not prescribe a particular data structure, control loop,
model, deployment topology, or technology stack.

PANDA is not a fixed five-step pipeline. A system can move from any capability
to any other capability when its goal, context, uncertainty, policies,
resources, observations, or action outcomes make that transition appropriate.

Requirements marked **[Framework]** define the conceptual PANDA model.
Requirements marked **[Runtime]** apply to a software runtime claiming
conformance. Requirements marked **[Both]** apply at both levels.

## 2. System objective and conformance

- **PANDA-AUT-001 [Framework]** A PANDA system SHALL be capable of autonomously
  pursuing a defined goal.
- **PANDA-AUT-002 [Framework]** Goal pursuit SHALL form a closed feedback loop
  in which the system can evaluate its situation, choose what should happen
  next, observe outcomes, and continue until a terminal condition is reached.
- **PANDA-AUT-003 [Framework]** The system SHALL be able to terminate because a
  goal was achieved, found impossible, cancelled, or blocked by a required
  human intervention, safety constraint, policy, resource limit, or
  unrecoverable failure.
- **PANDA-AUT-004 [Framework]** The framework SHALL NOT require every execution
  to visit all five PANDA capabilities or visit them in a fixed order.
- **PANDA-AUT-005 [Framework]** The framework SHALL distinguish a goal from an
  action taken in service of that goal.
- **PANDA-AUT-006 [Both]** A system SHALL evaluate action results against goal
  success criteria rather than treating successful action dispatch as proof of
  goal completion.
- **PANDA-AUT-007 [Framework]** Autonomous behavior SHALL be implementable using
  any combination of deterministic code, rules, algorithms, machine-learning
  models, large language models, human decisions, and external agents.
- **PANDA-AUT-008 [Runtime]** A conforming runtime SHALL document which
  framework requirements it implements, delegates to application components,
  or does not support.

## 3. Goals

- **PANDA-GOAL-001 [Both]** The system SHALL represent each goal explicitly and
  assign it a stable identity.
- **PANDA-GOAL-002 [Both]** A goal SHALL include an objective and verifiable
  success criteria.
- **PANDA-GOAL-003 [Both]** A goal SHALL be able to specify failure criteria,
  constraints, priority, and a deadline when applicable.
- **PANDA-GOAL-004 [Both]** The system SHALL track a goal state sufficient to
  distinguish at least pending, active, suspended, achieved, failed,
  cancelled, and awaiting-human states.
- **PANDA-GOAL-005 [Both]** Goal-state changes SHALL record their time and
  reason.
- **PANDA-GOAL-006 [Framework]** The system SHALL support decomposing a goal
  into related subgoals without requiring decomposition before work begins.
- **PANDA-GOAL-007 [Both]** The system SHALL retain the relationship between a
  subgoal and the goal or decision that created it.
- **PANDA-GOAL-008 [Framework]** The system SHALL support multiple active or
  pending goals and resolve competition using declared priority, constraints,
  resource availability, and policy.
- **PANDA-GOAL-009 [Both]** Authorized participants SHALL be able to modify,
  suspend, resume, or cancel a goal.
- **PANDA-GOAL-010 [Both]** Changes to a goal SHALL preserve an auditable
  history and trigger reevaluation of affected plans and pending work.
- **PANDA-GOAL-011 [Both]** Goal completion SHALL be verified with evidence
  relevant to its success criteria.
- **PANDA-GOAL-012 [Framework]** If success cannot be verified, the system
  SHALL keep the goal unresolved, gather more information, or enter an explicit
  terminal or intervention state.

## 4. Autonomy information model

- **PANDA-CTX-001 [Framework]** The system SHALL have access to its active
  goals, current context, observations, known facts, assumptions, and material
  uncertainties.
- **PANDA-CTX-002 [Framework]** The system SHALL have access to available
  capabilities, applicable constraints, usable resources, and relevant
  external dependencies.
- **PANDA-CTX-003 [Framework]** The system SHALL retain previous actions, their
  outcomes, pending work, and errors when relevant to continuing goal pursuit.
- **PANDA-CTX-004 [Framework]** Facts, assumptions, predictions, and
  uncertainties SHALL remain distinguishable.
- **PANDA-CTX-005 [Both]** Information used for autonomous behavior SHALL carry
  sufficient provenance to determine its source or derivation.
- **PANDA-CTX-006 [Both]** The system SHALL be able to update or invalidate
  information when later evidence supersedes it.
- **PANDA-CTX-007 [Framework]** PANDA SHALL NOT require autonomy information to
  be stored in one monolithic state object or one persistence technology.
- **PANDA-CTX-008 [Runtime]** Concurrent updates to autonomy information SHALL
  be handled so that critical context is not silently lost or corrupted.

## 5. Perception

- **PANDA-PER-001 [Framework]** Perception SHALL transform external or internal
  signals into observations usable by the system.
- **PANDA-PER-002 [Both]** Perception SHALL support pushed, event-driven,
  polled, and on-demand inputs as applicable to a source.
- **PANDA-PER-003 [Framework]** Perception sources MAY include sensors, APIs,
  files, messages, humans, system events, tools, and internal components.
- **PANDA-PER-004 [Both]** Observations SHALL identify their source, observation
  time when known, receipt time, and payload or a durable reference to it.
- **PANDA-PER-005 [Both]** Observations SHALL be normalized sufficiently for
  consumers to identify their type and interpret their content.
- **PANDA-PER-006 [Both]** An observation SHALL be able to express confidence,
  quality, uncertainty, and provenance when those properties are available.
- **PANDA-PER-007 [Framework]** The system SHALL be able to detect relevant
  environmental changes.
- **PANDA-PER-008 [Framework]** The system SHALL be able to associate an
  observed outcome with a previous action when evidence supports the
  association.
- **PANDA-PER-009 [Both]** Invalid, incomplete, duplicated, stale, and
  out-of-order observations SHALL be detectable or explicitly tolerated by the
  consuming component.
- **PANDA-PER-010 [Runtime]** A runtime SHALL provide a way to start, stop, and
  inspect continuous perception sources.

## 6. Analysis

- **PANDA-ANA-001 [Framework]** Analysis SHALL interpret observations in the
  context of applicable goals and existing knowledge.
- **PANDA-ANA-002 [Framework]** Analysis SHALL support classification,
  comparison, inference, relationship detection, and relevance determination.
- **PANDA-ANA-003 [Framework]** Analysis SHALL be capable of prediction and
  anomaly detection when required by the application.
- **PANDA-ANA-004 [Framework]** Analysis SHALL preserve material uncertainty
  and SHALL NOT present unsupported inference as an observed fact.
- **PANDA-ANA-005 [Framework]** Analysis SHALL be capable of detecting
  conflicting information and identifying the conflict for resolution.
- **PANDA-ANA-006 [Framework]** Analysis SHALL evaluate evidence of progress,
  regression, or no progress toward active goals.
- **PANDA-ANA-007 [Framework]** Analysis SHALL be able to conclude that more
  information is required instead of forcing a decision with insufficient
  evidence.
- **PANDA-ANA-008 [Both]** Material analytical outputs SHALL identify the input
  evidence and method, component, model, rule, or human source that produced
  them.

## 7. Network

Network means interaction and context exchange with the broader environment;
it is not limited to TCP/IP communication.

- **PANDA-NET-001 [Framework]** Network SHALL enable interaction with services,
  knowledge sources, agents, humans, and other PANDA components.
- **PANDA-NET-002 [Framework]** The system SHALL be able to discover or be
  configured with available external capabilities and their invocation
  contracts.
- **PANDA-NET-003 [Framework]** Network SHALL support requesting information,
  retrieving knowledge, sharing authorized context, and calling services.
- **PANDA-NET-004 [Both]** Connectors SHALL expose boundaries that isolate
  external protocols and provider-specific behavior from PANDA capability
  semantics.
- **PANDA-NET-005 [Both]** Network interactions SHALL enforce authentication,
  authorization, and context-disclosure boundaries outside the reasoning
  component that requested the interaction.
- **PANDA-NET-006 [Both]** Network interactions SHALL expose success, failure,
  timeout, and indeterminate outcomes to the autonomous system.
- **PANDA-NET-007 [Runtime]** A runtime SHALL support asynchronous and
  distributed interactions without assuming immediate availability or
  response.
- **PANDA-NET-008 [Both]** Shared context SHALL include provenance and SHALL be
  limited to information authorized for the recipient.
- **PANDA-NET-009 [Runtime]** Connector health and capability availability SHALL
  be inspectable.

## 8. Decision

- **PANDA-DEC-001 [Framework]** Decision SHALL determine an appropriate next
  step in light of the goal and current context.
- **PANDA-DEC-002 [Framework]** Decision SHALL be able to generate and compare
  candidate actions or strategies.
- **PANDA-DEC-003 [Framework]** Comparison SHALL be able to consider expected
  outcomes, uncertainty, risk, cost, constraints, policies, available
  resources, and capability availability.
- **PANDA-DEC-004 [Framework]** Decision SHALL be able to select an action,
  choose not to act, wait, retry, gather more information, analyze further,
  communicate, create a subgoal, replan, stop, or request human intervention.
- **PANDA-DEC-005 [Framework]** Decision SHALL NOT be required to transition to
  Action.
- **PANDA-DEC-006 [Both]** Important decisions SHALL record the selected option,
  relevant alternatives, decisive constraints, and rationale at a level
  appropriate to risk.
- **PANDA-DEC-007 [Framework]** Decision SHALL recognize when no candidate is
  authorized or sufficiently supported and choose a safe non-action or
  escalation path.
- **PANDA-DEC-008 [Both]** A decision that creates subgoals or pending work SHALL
  preserve their relationship to the originating goal and decision.

## 9. Action

- **PANDA-ACT-001 [Framework]** Action SHALL support changes to internal or
  external environments through tools, APIs, commands, connectors, software,
  communications, or physical devices.
- **PANDA-ACT-002 [Both]** Each action request SHALL identify its intended
  operation, target, parameters, originating goal or context, and applicable
  authorization.
- **PANDA-ACT-003 [Both]** Action execution SHALL return a result that
  distinguishes success, failure, timeout, cancellation, rejection, and
  indeterminate outcome where applicable.
- **PANDA-ACT-004 [Both]** Action results SHALL be available to Perception and
  Analysis so that effects can be verified.
- **PANDA-ACT-005 [Runtime]** Actions SHALL support configurable timeout and
  cancellation behavior when the underlying operation permits it.
- **PANDA-ACT-006 [Both]** Retry behavior SHALL account for idempotency and the
  possibility that a previous attempt completed despite an unknown response.
- **PANDA-ACT-007 [Framework]** Protected, destructive, irreversible, or
  high-risk actions SHALL support confirmation or independent authorization.
- **PANDA-ACT-008 [Framework]** The system SHALL support rollback or compensating
  action when the capability provides it and policy requires it.
- **PANDA-ACT-009 [Both]** Partial effects SHALL be reported and SHALL NOT be
  represented as complete success.
- **PANDA-ACT-010 [Both]** Successful execution SHALL NOT, by itself, mark the
  originating goal achieved.

## 10. Dynamic transitions and autonomous execution

- **PANDA-TRN-001 [Framework]** Every PANDA capability SHALL be permitted to
  transition to any PANDA capability, including itself, when appropriate.
- **PANDA-TRN-002 [Framework]** Transitions SHALL be driven by relevant goals,
  context, observations, uncertainty, capability availability, results,
  failures, environmental changes, policies, or resource constraints.
- **PANDA-TRN-003 [Both]** Each material transition SHALL record its origin,
  destination, time, triggering information, and reason.
- **PANDA-TRN-004 [Framework]** The system SHALL be able to reevaluate what it
  knows, what it lacks, what capabilities it can use, and what should happen
  next throughout execution.
- **PANDA-TRN-005 [Framework]** After an action, the system SHALL be able to
  observe and analyze the result before deciding whether to continue, change
  strategy, wait, retry, escalate, or stop.
- **PANDA-TRN-006 [Framework]** PANDA SHALL NOT prescribe a mandatory algorithm
  or fixed cadence for autonomous reevaluation.
- **PANDA-TRN-007 [Runtime]** A runtime SHALL prevent an unbounded transition
  sequence from bypassing configured execution, resource, or safety limits.

## 11. Planning and replanning

- **PANDA-PLN-001 [Framework]** The system SHALL support planned and reactive
  goal pursuit.
- **PANDA-PLN-002 [Framework]** Plans MAY be complete, partial, contingent, or
  incrementally developed.
- **PANDA-PLN-003 [Framework]** PANDA SHALL NOT require a complete plan before
  the system acts.
- **PANDA-PLN-004 [Both]** A plan SHALL preserve its relationship to goals,
  subgoals, assumptions, constraints, and relevant decisions.
- **PANDA-PLN-005 [Framework]** The system SHALL be able to revise, suspend,
  resume, or abandon a plan when observations, outcomes, constraints, or goals
  change.
- **PANDA-PLN-006 [Framework]** The system SHALL be able to recover from an
  unexpected outcome by retrying safely, choosing an alternative, gathering
  information, replanning, seeking help, or terminating safely.
- **PANDA-PLN-007 [Both]** Pending plan work SHALL be inspectable and cancellable
  subject to authorization and underlying capability limits.

## 12. Memory and context continuity

- **PANDA-MEM-001 [Framework]** The system SHALL maintain sufficient information
  across execution to continue goal pursuit coherently.
- **PANDA-MEM-002 [Framework]** The information model SHALL be capable of
  distinguishing immediate execution context, working memory, historical
  events, and long-term knowledge.
- **PANDA-MEM-003 [Both]** Previous decisions, actions, and action results SHALL
  remain linked when retained.
- **PANDA-MEM-004 [Both]** Retained knowledge SHALL preserve source,
  observation or creation time, and derivation when applicable.
- **PANDA-MEM-005 [Both]** Retention, summarization, archival, and deletion
  SHALL comply with configured privacy and retention policy.
- **PANDA-MEM-006 [Framework]** The system SHALL be able to explain why it
  believes a material proposition using available provenance and derivation.
- **PANDA-MEM-007 [Runtime]** A runtime that persists execution state SHALL
  detect incompatible, incomplete, or corrupt persisted state before resuming.

## 13. Extensibility and connectors

- **PANDA-EXT-001 [Both]** PANDA SHALL permit developers to add perception
  sources, analysis modules, knowledge systems, decision strategies, tools,
  action handlers, connectors, services, and physical devices.
- **PANDA-EXT-002 [Both]** Extension contracts SHALL describe inputs, outputs,
  errors, lifecycle expectations, and declared capabilities.
- **PANDA-EXT-003 [Framework]** PANDA SHALL NOT depend on one LLM provider,
  model, cloud vendor, database, operating system, or external agent framework.
- **PANDA-EXT-004 [Both]** Models and LLMs SHALL be replaceable components and
  SHALL NOT be assumed to own orchestration or safety enforcement.
- **PANDA-EXT-005 [Runtime]** A runtime SHALL validate extension compatibility
  and configuration before relying on the extension.
- **PANDA-EXT-006 [Runtime]** Extension failures SHALL be isolated sufficiently
  to prevent silent corruption of unrelated execution state.

## 14. Human interaction and autonomy levels

- **PANDA-HUM-001 [Framework]** PANDA SHALL support configurations in which
  humans provide input, clarification, approval, decisions, or oversight.
- **PANDA-HUM-002 [Both]** Authorized humans SHALL be able to interrupt,
  suspend, cancel, or manually override autonomous execution.
- **PANDA-HUM-003 [Both]** The system SHALL support resumption after human
  interaction with the resulting input and changed context preserved.
- **PANDA-HUM-004 [Framework]** The system SHALL be able to escalate when
  information, authority, policy, or capability needed for progress is absent.
- **PANDA-HUM-005 [Both]** Approval requests SHALL identify the proposed action,
  relevant risk, expected effect, and decision deadline when applicable.
- **PANDA-HUM-006 [Framework]** A PANDA implementation SHALL be capable of
  exposing different autonomy levels by varying which decisions and actions
  require human participation.

## 15. Safety and constraints

- **PANDA-SAF-001 [Both]** Permissions, policy enforcement, and action
  authorization SHALL operate independently of any autonomous model's claim
  that an action is safe.
- **PANDA-SAF-002 [Both]** The system SHALL enforce capability restrictions,
  resource limits, execution limits, rate limits, and timeouts configured by an
  authorized operator.
- **PANDA-SAF-003 [Both]** Protected actions SHALL require the configured human
  or independent system approval before execution.
- **PANDA-SAF-004 [Both]** Denied actions SHALL produce an observable result and
  SHALL NOT be silently executed through an alternate capability.
- **PANDA-SAF-005 [Runtime]** A runtime SHALL provide an emergency-stop
  mechanism that prevents new actions and cancels in-flight work where safely
  possible.
- **PANDA-SAF-006 [Both]** Safety controls and policy changes SHALL be auditable.
- **PANDA-SAF-007 [Framework]** The least privilege needed for a goal SHALL be
  preferred when selecting credentials and capabilities.
- **PANDA-SAF-008 [Both]** Secret values SHALL be protected from unauthorized
  context, logs, models, extensions, and recipients.
- **PANDA-SAF-009 [Framework]** When constraints conflict with goal pursuit,
  constraints SHALL take precedence and the system SHALL wait, replan,
  escalate, or terminate safely.

## 16. Failure and recovery

- **PANDA-FLR-001 [Both]** The system SHALL represent failures from tools,
  networks, services, observations, actions, models, and unavailable
  capabilities as information usable for recovery decisions.
- **PANDA-FLR-002 [Both]** Failure information SHALL identify the failed
  operation, time, known effects, retryability when known, and cause or error
  evidence.
- **PANDA-FLR-003 [Framework]** The system SHALL be able to choose among safe
  retry, an alternative, additional perception or analysis, replanning, human
  assistance, and termination.
- **PANDA-FLR-004 [Both]** Retry policy SHALL be bounded and account for
  timeout, rate limits, cost, idempotency, and partial completion.
- **PANDA-FLR-005 [Framework]** Conflicting information SHALL be preserved as a
  conflict until resolved or explicitly accepted under uncertainty.
- **PANDA-FLR-006 [Both]** An unavailable required capability or impossible
  goal SHALL lead to replanning, escalation, or an explicit terminal state.
- **PANDA-FLR-007 [Runtime]** A runtime SHALL support recovery after process or
  infrastructure failure to the extent promised by its documented durability
  level.
- **PANDA-FLR-008 [Both]** Recovery SHALL NOT repeat a non-idempotent action
  unless policy and available evidence make the repetition acceptable.

## 17. Observability and auditability

- **PANDA-OBS-001 [Both]** Autonomous execution SHALL be inspectable.
- **PANDA-OBS-002 [Both]** The system SHALL record goals, material observations,
  analytical outputs, network interactions, decisions, actions, results,
  transitions, errors, and relevant timestamps.
- **PANDA-OBS-003 [Both]** Records SHALL preserve correlation sufficient to
  reconstruct the causal history of a goal execution.
- **PANDA-OBS-004 [Both]** An operator SHALL be able to determine why a material
  action was selected and which evidence, constraints, policy, and approvals
  influenced it.
- **PANDA-OBS-005 [Both]** Audit records SHALL distinguish observed facts from
  inferred content and human, deterministic, model, and external-agent input.
- **PANDA-OBS-006 [Both]** Observability output SHALL apply access control,
  privacy, redaction, and retention policy.
- **PANDA-OBS-007 [Runtime]** Failures in telemetry export SHALL NOT silently
  change autonomous decisions or bypass local audit requirements.
- **PANDA-OBS-008 [Runtime]** Operators SHALL be able to inspect current goal,
  execution, dependency, capability, and health status.

## 18. Runtime requirements

These requirements concern a potential execution runtime, not the definition of
the five PANDA capabilities.

- **PANDA-RUN-001 [Runtime]** A runtime SHALL manage the lifecycle of registered
  components and expose initialization, readiness, operation, degradation, and
  shutdown states.
- **PANDA-RUN-002 [Runtime]** A runtime SHALL schedule synchronous and
  asynchronous work without assuming that capability work completes in one
  process or one turn.
- **PANDA-RUN-003 [Runtime]** A runtime SHALL support event receipt, delivery,
  correlation, and failure reporting.
- **PANDA-RUN-004 [Runtime]** Cancellation SHALL propagate to pending and
  in-flight work where the underlying capability permits safe cancellation.
- **PANDA-RUN-005 [Runtime]** Persistence behavior and durability guarantees
  SHALL be explicit and configurable where supported.
- **PANDA-RUN-006 [Runtime]** Concurrency controls SHALL protect ordering,
  consistency, resource, and safety invariants without globally requiring
  serial execution.
- **PANDA-RUN-007 [Runtime]** The runtime SHALL expose connector invocation
  results and component failures to the autonomy information model.
- **PANDA-RUN-008 [Runtime]** Shutdown and restart SHALL preserve or explicitly
  terminate active work according to documented policy.

## 19. Non-functional requirements

- **PANDA-NFR-001 Extensibility [Both]** Adding a conforming capability or
  connector SHALL NOT require modification of unrelated core components.
- **PANDA-NFR-002 Modularity [Both]** Capability, policy, persistence,
  scheduling, and connector concerns SHALL have replaceable boundaries.
- **PANDA-NFR-003 Portability [Runtime]** Platform dependencies SHALL be
  isolated and documented so implementations can target multiple operating and
  deployment environments.
- **PANDA-NFR-004 Reliability [Both]** Implementations SHALL explicitly handle
  partial, duplicated, delayed, out-of-order, and failed operations where those
  conditions are possible.
- **PANDA-NFR-005 Scalability [Runtime]** A runtime SHOULD permit components and
  workloads to scale independently without changing PANDA semantics.
- **PANDA-NFR-006 Performance [Runtime]** Implementations SHALL allow operators
  to measure latency, throughput, queueing, and resource consumption relevant
  to their deployment and set workload-appropriate limits.
- **PANDA-NFR-007 Security [Both]** Implementations SHALL apply least privilege,
  secure defaults, authenticated identities, authorization checks, and
  protected credential handling at trust boundaries.
- **PANDA-NFR-008 Privacy [Both]** Implementations SHALL support data
  minimization, access control, retention, deletion, and disclosure policy for
  context, memory, telemetry, and exchanged information.
- **PANDA-NFR-009 Testability [Both]** Components SHALL expose contracts and
  observable results that permit deterministic testing, simulation, fault
  injection, and evaluation of nondeterministic components.
- **PANDA-NFR-010 Observability [Runtime]** A runtime SHALL provide structured
  logs, metrics, traces, or equivalent evidence appropriate to reconstructing
  autonomous execution.
- **PANDA-NFR-011 Interoperability [Both]** Public interfaces and exchanged
  representations SHALL be documented and use versionable formats.
- **PANDA-NFR-012 Compatibility [Both]** Breaking changes to public contracts or
  persisted representations SHALL be versioned and accompanied by migration or
  compatibility guidance.
- **PANDA-NFR-013 Developer usability [Both]** Public extension contracts SHALL
  include validation behavior, error semantics, and executable or testable
  examples.
- **PANDA-NFR-014 Explainability [Both]** The detail retained for explanations
  SHALL be proportional to action impact and sufficient for authorized
  operators to investigate material behavior.

## 20. Verification guidance

Conformance should be established with a mix of interface inspection,
scenario-based tests, policy tests, fault injection, and audit reconstruction.
At minimum, verification should cover:

1. a goal requiring several observations and actions before verification;
2. a transition that does not follow Perception → Analysis → Network → Decision
   → Action;
3. replanning after an unexpected or partial action outcome;
4. denial of a protected action independently of model output;
5. bounded recovery from a timeout or indeterminate result;
6. human interruption and later resumption;
7. reconstruction of the evidence and rationale behind a material action; and
8. replacement of a model or connector without changing goal semantics.

This guidance is non-normative; the uniquely identified requirements above are
the conformance baseline.
