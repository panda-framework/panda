import assert from "node:assert/strict";
import test from "node:test";
import {
  PANDA_CAPABILITIES,
  createExecutionContext,
  createPandaExecution,
  createSignal,
  createTraceRecord,
  type PandaExecution,
  type Signal,
} from "@panda/shared";
import {
  ExecutionCoordinator,
  InMemoryCapabilityRegistry,
} from "./coordinator.js";
import {
  DEMO_FILE_REQUEST_TYPE,
  FILESYSTEM_WRITE_ACTION_TYPE,
  POLICY_EVALUATION_RESUME_EVENT,
  registerDeterministicPandaCapabilities,
  type DemoFileAssessment,
  type DemoFileDecision,
} from "./deterministic-capabilities.js";
import {
  InMemoryExecutionStore,
  type StoredTraceRecord,
} from "./execution-store.js";

const fixedTime = "2026-08-10T12:00:00.000Z";
const producer = { kind: "runtime", component: "phase-4-test" } as const;

function makeExecution(executionId: string): PandaExecution {
  return createPandaExecution({
    id: executionId,
    executionId,
    goalId: `goal_${executionId}`,
    correlationId: `corr_${executionId}`,
    producer,
    status: "pending",
    activeCapability: "perception",
    goalIds: [`goal_${executionId}`],
    updatedAt: fixedTime,
  });
}

function makeSignal(
  execution: PandaExecution,
  payload: unknown,
  type = DEMO_FILE_REQUEST_TYPE,
): Signal<unknown> {
  return createSignal({
    id: `sig_${execution.executionId}`,
    executionId: execution.executionId,
    goalId: execution.goalId,
    correlationId: execution.correlationId,
    producer: { kind: "runtime", component: "acceptance-source" },
    timestamp: fixedTime,
    type,
    source: "phase-4-acceptance",
    occurredAt: "2026-08-10T11:59:58.000Z",
    receivedAt: "2026-08-10T11:59:59.000Z",
    provenance: {
      kind: "human",
      sourceId: "acceptance-user",
      details: { channel: "test" },
    },
    payload,
  });
}

async function runScenario(executionId: string, payload: unknown) {
  const store = new InMemoryExecutionStore();
  const registry = new InMemoryCapabilityRegistry();
  const execution = store.createExecution(makeExecution(executionId));
  const signal = makeSignal(execution, payload);
  const signalTrace = store.appendTrace(
    createTraceRecord({
      id: `trace_${signal.id}`,
      executionId: execution.executionId,
      goalId: execution.goalId,
      correlationId: execution.correlationId,
      producer,
      timestamp: fixedTime,
      category: "signal",
      type: "signal.accepted",
      payload: signal,
    }),
  );
  const unregister = registerDeterministicPandaCapabilities(registry, {
    now: () => fixedTime,
  });
  const result = await new ExecutionCoordinator(store, registry, {
    now: () => fixedTime,
  }).run({
    executionId: execution.executionId,
    input: signal,
    causationId: signalTrace.id,
  });

  return {
    store,
    registry,
    result,
    signal,
    unregister,
    trace: store.getTrace(execution.executionId),
  };
}

function invocationRoute(trace: readonly StoredTraceRecord[]): string[] {
  return trace
    .filter((record) => record.type === "capability.started")
    .map((record) => {
      assert.ok(isRecord(record.payload));
      assert.equal(typeof record.payload.capability, "string");
      return record.payload.capability as string;
    });
}

function invocationOutputs(trace: readonly StoredTraceRecord[]): unknown[] {
  return trace
    .filter((record) => record.type === "capability.completed")
    .map((record) => {
      assert.ok(isRecord(record.payload));
      return record.payload.output;
    });
}

test("routes a complete request through deterministic capabilities and stages no effect", async () => {
  const scenario = await runScenario("exe_phase_4_complete", {
    path: "proof.txt",
    content: "PANDA v0.1 completed",
  });

  assert.deepEqual(
    scenario.registry.list().map((implementation) => implementation.capability),
    PANDA_CAPABILITIES,
  );
  assert.deepEqual(invocationRoute(scenario.trace), [
    "perception",
    "analysis",
    "decision",
    "action",
  ]);
  assert.equal(scenario.result.execution.status, "waiting");
  assert.equal(scenario.result.execution.activeCapability, "action");
  assert.equal(scenario.result.invocationCount, 4);
  assert.equal(
    scenario.result.execution.statusReason,
    "The effect candidate is staged but remains unauthorized until the Phase 5 policy gate evaluates it.",
  );

  const [observation, assessmentValue, decisionValue, actionRequest] =
    invocationOutputs(scenario.trace);
  assert.ok(isRecord(observation));
  assert.equal(observation.kind, "observation");
  assert.equal(observation.validationStatus, "valid");
  assert.equal(observation.source, scenario.signal.source);
  assert.equal(observation.observedAt, scenario.signal.occurredAt);
  assert.equal(observation.receivedAt, scenario.signal.receivedAt);
  assert.deepEqual(observation.provenance, scenario.signal.provenance);
  assert.deepEqual(observation.payload, scenario.signal.payload);

  const assessment = assessmentValue as DemoFileAssessment;
  assert.equal(assessment.kind, "assessment");
  assert.equal(assessment.result.status, "ready");
  assert.deepEqual(assessment.informationNeeds, []);
  assert.ok(assessment.evidence.some((item) => item.id === observation.id));
  assert.ok(assessment.assumptions.length > 0);
  assert.ok(assessment.options.length >= 2);

  const decision = decisionValue as DemoFileDecision;
  assert.equal(decision.kind, "decision");
  assert.equal(decision.selectedOption.intent?.kind, "action");
  assert.ok(decision.alternatives.some((option) => option.id === "no-action"));
  assert.ok(decision.decisiveEvidence.some((item) => item.id === assessment.id));
  assert.ok(decision.decisiveConstraints.length > 0);
  assert.ok(decision.rationale.length > 0);
  assert.deepEqual(decision.nextStep, {
    kind: "invoke",
    target: "action",
    reason:
      "Evidence supports staging a filesystem.write candidate for the policy-gated Action boundary.",
  });

  assert.ok(isRecord(actionRequest));
  assert.equal(actionRequest.kind, "action-request");
  assert.equal(actionRequest.actionType, FILESYSTEM_WRITE_ACTION_TYPE);
  assert.equal(actionRequest.authorization, undefined);
  assert.deepEqual(actionRequest.parameters, {
    path: "proof.txt",
    content: "PANDA v0.1 completed",
    encoding: "utf8",
  });
  const wait = scenario.trace.at(-1);
  assert.equal(wait?.category, "wait");
  assert.ok(isRecord(wait?.payload));
  assert.equal(wait.payload.resumeOn, POLICY_EVALUATION_RESUME_EVENT);
  assert.equal(
    scenario.trace.some(
      (record) =>
        record.category === "connector-invocation" ||
        record.category === "outcome",
    ),
    false,
  );

  scenario.unregister();
  assert.deepEqual(scenario.registry.list(), []);
});

test("waits for missing content without creating a decision or action request", async () => {
  const scenario = await runScenario("exe_phase_4_incomplete", {
    path: "proof.txt",
  });

  assert.deepEqual(invocationRoute(scenario.trace), ["perception", "analysis"]);
  assert.equal(scenario.result.execution.status, "waiting");
  assert.equal(scenario.result.execution.activeCapability, "analysis");
  assert.equal(scenario.result.invocationCount, 2);
  const [observation, assessmentValue] = invocationOutputs(scenario.trace);
  assert.ok(isRecord(observation));
  assert.equal(observation.validationStatus, "incomplete");
  assert.deepEqual(observation.payload, { path: "proof.txt" });

  const assessment = assessmentValue as DemoFileAssessment;
  assert.equal(assessment.result.status, "incomplete");
  assert.deepEqual(assessment.result.missingFields, ["content"]);
  assert.deepEqual(assessment.result.invalidFields, []);
  assert.deepEqual(
    assessment.informationNeeds.map((need) => need.field),
    ["content"],
  );
  assert.equal(
    invocationOutputs(scenario.trace).some(
      (output) => isRecord(output) && output.kind === "action-request",
    ),
    false,
  );
  assert.equal(
    invocationOutputs(scenario.trace).some(
      (output) => isRecord(output) && output.kind === "decision",
    ),
    false,
  );
  const wait = scenario.trace.at(-1);
  assert.ok(isRecord(wait?.payload));
  assert.equal(wait.payload.resumeOn, DEMO_FILE_REQUEST_TYPE);
});

test("terminates malformed input without inventing content or selecting Action", async () => {
  const scenario = await runScenario("exe_phase_4_invalid", {
    path: "proof.txt",
    content: 42,
  });

  assert.deepEqual(invocationRoute(scenario.trace), ["perception", "analysis"]);
  assert.equal(scenario.result.execution.status, "failed");
  assert.equal(scenario.result.execution.activeCapability, undefined);
  const [observation, assessmentValue] = invocationOutputs(scenario.trace);
  assert.ok(isRecord(observation));
  assert.equal(observation.validationStatus, "invalid");
  assert.deepEqual(observation.payload, { path: "proof.txt", content: 42 });
  const assessment = assessmentValue as DemoFileAssessment;
  assert.equal(assessment.result.status, "invalid");
  assert.deepEqual(assessment.result.invalidFields, ["content"]);
  assert.equal(
    scenario.trace.some(
      (record) =>
        record.type === "capability.started" &&
        isRecord(record.payload) &&
        record.payload.capability === "action",
    ),
    false,
  );
});

test("keeps Network registered as an effect-free placeholder", async () => {
  const registry = new InMemoryCapabilityRegistry();
  const unregister = registerDeterministicPandaCapabilities(registry, {
    now: () => fixedTime,
  });
  const context = createExecutionContext({
    executionId: "exe_network_placeholder",
    goalId: "goal_network_placeholder",
    correlationId: "corr_network_placeholder",
    producer,
    timestamp: fixedTime,
    activeCapability: "network",
    invocationHistory: [],
    values: {},
  });

  const result = await registry.invoke("network", {
    context,
    input: { operation: "none" },
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, {
    output: {
      kind: "network-placeholder",
      status: "idle",
      reason: "The v0.1 filesystem scenario requires no network exchange.",
    },
    nextStep: {
      kind: "wait",
      reason: "No deterministic network work was requested.",
      resumeOn: "network.requested",
    },
  });
  unregister();
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
