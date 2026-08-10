import assert from "node:assert/strict";
import test from "node:test";
import {
  PANDA_CAPABILITIES,
  PANDA_SCHEMA_VERSION,
  createActionRequest,
  createAssessment,
  createDecision,
  createExecutionContext,
  createFailure,
  createGoal,
  createObservationRecord,
  createOutcome,
  createPandaExecution,
  createPolicyEvaluation,
  createSignal,
  createTraceRecord,
  createTransitionRecord,
  createTransitionRequest,
  type NextStep,
  type PandaStateName,
  type RecordProducer,
} from "./index.js";

const executionId = "exe_phase_1";
const goalId = "goal_phase_1";
const correlationId = "corr_phase_1";
const perception: RecordProducer = {
  kind: "capability",
  capability: "perception",
};

const commonIdentity = {
  executionId,
  goalId,
  correlationId,
  producer: perception,
};

test("canonical capabilities contain only the five PANDA responsibilities", () => {
  const retainedLegacyState: PandaStateName = "understanding";

  assert.deepEqual(PANDA_CAPABILITIES, [
    "perception",
    "analysis",
    "network",
    "decision",
    "action",
  ]);
  assert.equal(retainedLegacyState, "understanding");
});

test("record constructors generate stable identity, version, and timestamps", () => {
  const first = createExecutionContext({
    ...commonIdentity,
    invocationHistory: [],
    values: {},
  });
  const second = createExecutionContext({
    ...commonIdentity,
    invocationHistory: [],
    values: {},
  });

  assert.match(first.id, /^ctx_[a-f0-9]{16}$/);
  assert.notEqual(first.id, second.id);
  assert.equal(first.schemaVersion, PANDA_SCHEMA_VERSION);
  assert.equal(first.executionId, executionId);
  assert.equal(first.goalId, goalId);
  assert.equal(first.correlationId, correlationId);
  assert.equal(first.causationId, undefined);
  assert.equal(Number.isNaN(Date.parse(first.timestamp)), false);
});

test("goal and execution constructors use their domain identity as the initial record identity", () => {
  const goal = createGoal({
    executionId,
    correlationId,
    producer: { kind: "runtime", component: "goal-manager" },
    objective: "Create and verify proof.txt",
    priority: 1,
    constraints: ["sandbox-only"],
    successCriteria: [
      {
        id: "criterion_file",
        description: "proof.txt contains the expected bytes",
        evidenceType: "filesystem.observed",
      },
    ],
    failureCriteria: [],
    status: "pending",
    owner: { id: "panda", type: "system" },
    dependencyGoalIds: [],
  });
  const execution = createPandaExecution({
    goalId: goal.id,
    correlationId,
    producer: { kind: "runtime", component: "coordinator" },
    status: "pending",
    goalIds: [goal.id],
    updatedAt: "2026-08-10T00:00:00.000Z",
  });

  assert.equal(goal.id, goal.goalId);
  assert.match(goal.id, /^goal_[a-f0-9]{16}$/);
  assert.equal(execution.id, execution.executionId);
  assert.match(execution.id, /^exe_[a-f0-9]{16}$/);
  assert.equal(execution.goalId, goal.id);
});

test("material records preserve typed payloads and causal identity", () => {
  const signal = createSignal({
    ...commonIdentity,
    type: "demo.file.requested",
    source: "acceptance-test",
    receivedAt: "2026-08-10T00:00:00.000Z",
    provenance: { kind: "system", sourceId: "fixture" },
    payload: { path: "proof.txt", content: "PANDA v0.1 completed" },
  });
  const observation = createObservationRecord({
    ...commonIdentity,
    causationId: signal.id,
    type: "demo.file.requested",
    source: "perception",
    receivedAt: "2026-08-10T00:00:01.000Z",
    validationStatus: "valid",
    provenance: { kind: "capability", sourceId: "perception" },
    payload: signal.payload,
  });
  const assessment = createAssessment({
    ...commonIdentity,
    causationId: observation.id,
    producer: { kind: "capability", capability: "analysis" },
    summary: "The request contains a safe relative path and content.",
    method: "panda.v0.1.demo-file-rule",
    confidence: 1,
    evidence: [{ id: observation.id, kind: "record" }],
    assumptions: [],
    informationNeeds: [],
    options: [{ id: "write", description: "Write in the sandbox" }],
    result: { complete: true },
  });
  const nextStep: NextStep = {
    kind: "invoke",
    target: "decision",
    reason: "The request is complete.",
    payloadRef: assessment.id,
  };
  const decision = createDecision({
    ...commonIdentity,
    causationId: assessment.id,
    producer: { kind: "capability", capability: "decision" },
    selectedOption: {
      id: "write",
      description: "Write in the sandbox",
      intent: { actionType: "filesystem.write" },
    },
    alternatives: [{ id: "no-action", description: "Take no action" }],
    decisiveEvidence: [{ id: assessment.id, kind: "record" }],
    decisiveConstraints: ["sandbox-only"],
    rationale: "The request is complete and the sandbox is the only target.",
    nextStep,
  });
  const action = createActionRequest({
    ...commonIdentity,
    causationId: decision.id,
    producer: { kind: "capability", capability: "action" },
    actionType: "filesystem.write",
    target: "proof.txt",
    connectorId: "filesystem",
    parameters: observation.payload,
    idempotencyKey: "write-proof-once",
  });
  const outcome = createOutcome({
    ...commonIdentity,
    causationId: action.id,
    producer: { kind: "connector", connectorId: "filesystem" },
    actionRequestId: action.id,
    status: "succeeded",
    effectStatus: "completed",
    startedAt: "2026-08-10T00:00:02.000Z",
    endedAt: "2026-08-10T00:00:03.000Z",
    data: { bytesWritten: 20 },
    observedEffect: { path: "proof.txt" },
  });
  const failure = createFailure({
    ...commonIdentity,
    causationId: outcome.id,
    producer: { kind: "runtime", component: "verifier" },
    category: "conflict",
    failedOperation: "verify-file",
    code: "CONTENT_MISMATCH",
    message: "Observed content does not match the goal.",
    retryable: false,
    evidence: [{ id: outcome.id, kind: "record" }],
    effectStatus: "completed",
  });

  assert.equal(signal.payload.path, "proof.txt");
  assert.equal(observation.causationId, signal.id);
  assert.equal(assessment.causationId, observation.id);
  assert.equal(decision.causationId, assessment.id);
  assert.equal(action.causationId, decision.id);
  assert.equal(outcome.causationId, action.id);
  assert.equal(failure.causationId, outcome.id);
  assert.equal(outcome.data?.bytesWritten, 20);
  assert.equal(failure.schemaVersion, PANDA_SCHEMA_VERSION);
});

test("transition and trace records preserve caller-provided identity and time", () => {
  const requestedStep: NextStep = {
    kind: "wait",
    reason: "Content is missing.",
    resumeOn: "demo.file.requested",
  };
  const request = createTransitionRequest({
    ...commonIdentity,
    id: "trnreq_fixed",
    timestamp: "2026-08-10T00:00:04.000Z",
    causationId: "asm_missing_content",
    producer: { kind: "capability", capability: "analysis" },
    sourceCapability: "analysis",
    sourceInvocationId: "inv_analysis_1",
    triggerId: "asm_missing_content",
    nextStep: requestedStep,
  });
  const policy = createPolicyEvaluation({
    ...commonIdentity,
    id: "pol_fixed",
    timestamp: "2026-08-10T00:00:05.000Z",
    causationId: request.id,
    producer: { kind: "runtime", component: "policy-engine" },
    point: "transition",
    policyId: "panda.v0.1.transitions",
    result: "allow",
    reason: "The transition is allowed.",
    inputs: { requestId: request.id },
  });
  const transition = createTransitionRecord({
    ...commonIdentity,
    causationId: policy.id,
    producer: { kind: "runtime", component: "coordinator" },
    requestId: request.id,
    sourceCapability: "analysis",
    sourceInvocationId: "inv_analysis_1",
    triggerId: "asm_missing_content",
    nextStep: requestedStep,
    policy: {
      evaluationId: policy.id,
      policyId: policy.policyId,
      result: policy.result,
      reason: policy.reason,
    },
    status: "committed",
  });
  const trace = createTraceRecord({
    ...commonIdentity,
    causationId: transition.id,
    producer: { kind: "runtime", component: "trace" },
    category: "wait",
    type: "execution.waiting",
    payload: { resumeOn: "demo.file.requested" },
  });

  assert.equal(request.id, "trnreq_fixed");
  assert.equal(request.timestamp, "2026-08-10T00:00:04.000Z");
  assert.equal(policy.causationId, request.id);
  assert.equal(policy.inputs.requestId, request.id);
  assert.equal(transition.causationId, policy.id);
  assert.equal(transition.policy?.evaluationId, policy.id);
  assert.equal(trace.causationId, transition.id);
  assert.deepEqual(trace.payload, { resumeOn: "demo.file.requested" });
  assert.equal(trace.sequence, undefined);
});
