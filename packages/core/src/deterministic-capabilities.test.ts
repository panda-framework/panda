import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PANDA_CAPABILITIES,
  createExecutionContext,
  createPandaExecution,
  createSignal,
  createTraceRecord,
  type Outcome,
  type PandaExecution,
  type Signal,
} from "@panda/shared";
import {
  FilesystemActionConnector,
  InMemoryActionConnectorRegistry,
  type ActionConnectorRegistry,
  type FilesystemWriteOutcomeData,
} from "./action-connector.js";
import {
  ExecutionCoordinator,
  InMemoryCapabilityRegistry,
} from "./coordinator.js";
import {
  ACTION_CONNECTOR_RESUME_EVENT,
  DEMO_FILE_REQUEST_TYPE,
  EFFECT_VERIFICATION_RESUME_EVENT,
  FILESYSTEM_WRITE_ACTION_TYPE,
  registerDeterministicPandaCapabilities,
  type DemoFileAssessment,
  type DemoFileDecision,
} from "./deterministic-capabilities.js";
import {
  InMemoryExecutionStore,
  type StoredTraceRecord,
} from "./execution-store.js";
import {
  V01PolicyEngine,
  V01_FILESYSTEM_POLICY_ID,
  type PolicyEngine,
} from "./policy.js";

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

async function runScenario(
  executionId: string,
  payload: unknown,
  policyEngine?: PolicyEngine,
  actionConnectorRegistry?: ActionConnectorRegistry,
) {
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
    policyEngine,
    actionConnectorRegistry,
  });
  const result = await new ExecutionCoordinator(store, registry, {
    now: () => fixedTime,
    policyEngine,
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
    "Policy allowed the exact request, but no Action connector registry is configured.",
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
  assert.ok(isRecord(actionRequest.authorization));
  assert.equal(
    actionRequest.authorization.policyId,
    V01_FILESYSTEM_POLICY_ID,
  );
  assert.equal(typeof actionRequest.authorization.evaluationId, "string");
  assert.deepEqual(actionRequest.parameters, {
    path: "proof.txt",
    content: "PANDA v0.1 completed",
    encoding: "utf8",
  });
  const wait = scenario.trace.at(-1);
  assert.equal(wait?.category, "wait");
  assert.ok(isRecord(wait?.payload));
  assert.equal(wait.payload.resumeOn, ACTION_CONNECTOR_RESUME_EVENT);
  const policyTraces = scenario.trace.filter(
    (record) => record.category === "policy-evaluation",
  );
  assert.equal(policyTraces.length, 5);
  const effectEvaluation = policyTraces.find(
    (record) =>
      isRecord(record.payload) &&
      record.payload.point === "effect" &&
      record.payload.result === "allow",
  );
  assert.ok(effectEvaluation);
  assert.ok(isRecord(effectEvaluation.payload));
  assert.equal(
    actionRequest.authorization.evaluationId,
    effectEvaluation.payload.id,
  );
  assert.equal(actionRequest.causationId, effectEvaluation.payload.id);
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

test("routes an injected effect denial through Decision with no connector effect", async () => {
  const base = new V01PolicyEngine();
  const denyingPolicy: PolicyEngine = {
    evaluate(request, signal) {
      if (request.point === "effect") {
        return {
          policyId: V01_FILESYSTEM_POLICY_ID,
          result: "deny",
          reason: "phase-0 acceptance denial",
          inputs: {
            actionRequestId: request.actionRequest.id,
            injectedFixture: true,
          },
        };
      }
      return base.evaluate(request, signal);
    },
  };
  const scenario = await runScenario(
    "exe_phase_5_policy_denial",
    {
      path: "proof.txt",
      content: "PANDA v0.1 completed",
    },
    denyingPolicy,
  );

  assert.deepEqual(invocationRoute(scenario.trace), [
    "perception",
    "analysis",
    "decision",
    "action",
    "decision",
  ]);
  assert.equal(scenario.result.execution.status, "failed");
  const outputs = invocationOutputs(scenario.trace);
  const outcome = outputs.at(-2) as Outcome;
  assert.equal(outcome.kind, "outcome");
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.effectStatus, "none");
  assert.equal(outcome.error?.code, "POLICY_DENIED");
  const finalDecision = outputs.at(-1) as DemoFileDecision;
  assert.equal(finalDecision.kind, "decision");
  assert.equal(finalDecision.selectedOption.intent?.kind, "no-action");
  assert.equal(finalDecision.nextStep.kind, "terminate");
  assert.equal(
    scenario.trace.some(
      (record) => record.category === "connector-invocation",
    ),
    false,
  );
  assert.equal(
    scenario.trace.some(
      (record) =>
        record.category === "policy-evaluation" &&
        isRecord(record.payload) &&
        record.payload.point === "effect" &&
        record.payload.result === "deny",
    ),
    true,
  );
});

test("executes the authorized write and waits for independent verification", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-action-route-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const policyEngine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const actionConnectorRegistry = new InMemoryActionConnectorRegistry();
  const unregisterConnector = actionConnectorRegistry.register(
    new FilesystemActionConnector({
      policyEngine,
      now: () => fixedTime,
    }),
  );
  const scenario = await runScenario(
    "exe_phase_6_write",
    { path: "nested/proof.txt", content: "PANDA v0.1 completed" },
    policyEngine,
    actionConnectorRegistry,
  );

  assert.deepEqual(invocationRoute(scenario.trace), [
    "perception",
    "analysis",
    "decision",
    "action",
  ]);
  assert.equal(scenario.result.execution.status, "waiting");
  assert.equal(scenario.result.execution.activeCapability, "action");
  assert.equal(
    scenario.result.execution.statusReason,
    "The connector completed the write; independent Phase 7 verification is still required.",
  );
  assert.equal(
    await readFile(
      join(
        policyEngine.workspaceFor("exe_phase_6_write"),
        "nested",
        "proof.txt",
      ),
      "utf8",
    ),
    "PANDA v0.1 completed",
  );

  const actionTrace = scenario.trace.find(
    (record) => record.category === "action-request",
  );
  const connectorTrace = scenario.trace.find(
    (record) => record.category === "connector-invocation",
  );
  const outcomeTrace = scenario.trace.find(
    (record) => record.category === "outcome",
  );
  assert.ok(actionTrace);
  assert.ok(connectorTrace);
  assert.ok(outcomeTrace);
  assert.ok(isRecord(actionTrace.payload));
  assert.ok(isRecord(connectorTrace.payload));
  assert.ok(isRecord(outcomeTrace.payload));
  assert.equal(connectorTrace.payload.causationId, actionTrace.payload.id);
  assert.equal(outcomeTrace.payload.causationId, connectorTrace.payload.id);
  assert.equal(outcomeTrace.payload.actionRequestId, actionTrace.payload.id);
  assert.equal(outcomeTrace.payload.status, "succeeded");
  assert.equal(outcomeTrace.payload.effectStatus, "completed");
  const outcomeData = outcomeTrace.payload.data as FilesystemWriteOutcomeData;
  assert.equal(outcomeData.bytesWritten, 20);
  assert.equal(
    outcomeData.contentHash,
    createHash("sha256").update("PANDA v0.1 completed").digest("hex"),
  );
  assert.equal(actionTrace.causationId?.startsWith("trace_"), true);
  assert.equal(connectorTrace.causationId, actionTrace.id);
  assert.equal(outcomeTrace.causationId, connectorTrace.id);
  const wait = scenario.trace.at(-1);
  assert.ok(isRecord(wait?.payload));
  assert.equal(wait.payload.resumeOn, EFFECT_VERIFICATION_RESUME_EVENT);

  scenario.unregister();
  unregisterConnector();
});

test("turns an unknown connector into a structured failed outcome", async () => {
  const actionConnectorRegistry = new InMemoryActionConnectorRegistry();
  const scenario = await runScenario(
    "exe_phase_6_missing_connector",
    { path: "proof.txt", content: "PANDA v0.1 completed" },
    new V01PolicyEngine(),
    actionConnectorRegistry,
  );

  assert.deepEqual(invocationRoute(scenario.trace), [
    "perception",
    "analysis",
    "decision",
    "action",
    "decision",
  ]);
  assert.equal(scenario.result.execution.status, "failed");
  const outcomeTrace = scenario.trace.find(
    (record) => record.category === "outcome",
  );
  assert.ok(outcomeTrace);
  assert.ok(isRecord(outcomeTrace.payload));
  assert.equal(outcomeTrace.payload.status, "failed");
  assert.equal(outcomeTrace.payload.effectStatus, "none");
  assert.ok(isRecord(outcomeTrace.payload.error));
  assert.equal(
    outcomeTrace.payload.error.code,
    "ACTION_CONNECTOR_NOT_FOUND",
  );
  const connectorTrace = scenario.trace.find(
    (record) => record.category === "connector-invocation",
  );
  assert.equal(connectorTrace?.type, "connector.failed");
});

test("preserves unknown effect state when a dispatched connector throws", async () => {
  const actionConnectorRegistry = new InMemoryActionConnectorRegistry();
  actionConnectorRegistry.register({
    id: "filesystem",
    actionTypes: ["filesystem.write"],
    execute() {
      throw new Error("connector lost contact after dispatch");
    },
  });
  const scenario = await runScenario(
    "exe_phase_6_connector_throw",
    { path: "proof.txt", content: "PANDA v0.1 completed" },
    new V01PolicyEngine(),
    actionConnectorRegistry,
  );

  assert.equal(scenario.result.execution.status, "failed");
  const outcomeTrace = scenario.trace.find(
    (record) => record.category === "outcome",
  );
  assert.ok(outcomeTrace);
  assert.ok(isRecord(outcomeTrace.payload));
  assert.equal(outcomeTrace.payload.status, "indeterminate");
  assert.equal(outcomeTrace.payload.effectStatus, "unknown");
  assert.ok(isRecord(outcomeTrace.payload.error));
  assert.equal(outcomeTrace.payload.error.code, "ACTION_CONNECTOR_FAILED");
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
