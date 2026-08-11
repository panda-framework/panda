import assert from "node:assert/strict";
import test from "node:test";
import {
  createTraceRecord,
  type StoredPandaTraceRecord,
  type TraceCategory,
} from "@panda/shared";
import {
  capabilityRoute,
  executionInsights,
  orderTrace,
  traceCause,
  traceVisualKind,
} from "./trace-view.js";

const producer = { kind: "runtime", component: "dashboard-test" } as const;

function record(
  sequence: number,
  category: TraceCategory,
  type: string,
  payload: unknown,
  causationId?: string,
): StoredPandaTraceRecord {
  return {
    ...createTraceRecord({
      id: `trace_${sequence}`,
      executionId: "exe_dashboard",
      goalId: "goal_dashboard",
      correlationId: "corr_dashboard",
      causationId,
      producer,
      category,
      type,
      payload,
    }),
    sequence,
  };
}

test("orders trace snapshots by their store-assigned sequence", () => {
  const input = [
    record(3, "decision", "decision.created", {}),
    record(1, "signal", "signal.accepted", {}),
    record(2, "assessment", "assessment.created", {}),
  ];

  assert.deepEqual(
    orderTrace(input).map((item) => item.sequence),
    [1, 2, 3],
  );
  assert.deepEqual(
    input.map((item) => item.sequence),
    [3, 1, 2],
  );
});

test("resolves root, direct, and unresolved causes without inventing links", () => {
  const root = record(1, "signal", "signal.accepted", {});
  const child = record(2, "observation", "observation.created", {}, root.id);
  const broken = record(3, "failure", "failure.created", {}, "trace_missing");
  const trace = [root, child, broken];

  assert.deepEqual(traceCause(root, trace), { state: "root" });
  assert.deepEqual(traceCause(child, trace), {
    state: "resolved",
    id: root.id,
    sequence: 1,
  });
  assert.deepEqual(traceCause(broken, trace), {
    state: "unresolved",
    id: "trace_missing",
  });
});

test("extracts the actual repeated capability route in sequence order", () => {
  const trace = [
    record(2, "capability-invocation", "capability.started", {
      capability: "analysis",
    }),
    record(1, "capability-invocation", "capability.started", {
      capability: "perception",
    }),
    record(3, "capability-invocation", "capability.completed", {
      capability: "analysis",
    }),
  ];

  assert.deepEqual(capabilityRoute(trace), ["perception", "analysis"]);
});

test("derives operator insights only from stored payload fields", () => {
  const trace = [
    record(1, "signal", "signal.accepted", {
      type: "demo.file.requested",
      payload: { path: "proof.txt", content: "ok" },
    }),
    record(2, "capability-invocation", "capability.started", {
      capability: "perception",
    }),
    record(3, "decision", "decision.created", {
      rationale: "Evidence supports the bounded write.",
      selectedOption: { description: "Write the requested file." },
    }),
    record(4, "policy-evaluation", "policy.effect.allow", {
      point: "effect",
      result: "allow",
      policyId: "panda.v0.1.filesystem-write",
      reason: "Contained request.",
    }),
    record(5, "action-request", "action.authorized", {
      actionType: "filesystem.write",
      connectorId: "filesystem",
      parameters: { path: "proof.txt" },
    }),
    record(6, "observation", "verification.observed", {
      payload: { status: "observed", relativePath: "proof.txt", byteCount: 2 },
    }),
    record(7, "assessment", "verification.verified", {
      summary: "Every criterion matched.",
      result: { kind: "effect-verification", status: "verified" },
    }),
  ];
  const insights = executionInsights(trace);

  assert.equal(insights.find((item) => item.id === "input")?.value, "proof.txt · 2 UTF-8 bytes");
  assert.equal(insights.find((item) => item.id === "decision")?.value, "Evidence supports the bounded write.");
  assert.equal(insights.find((item) => item.id === "authorization")?.value, "ALLOW · panda.v0.1.filesystem-write");
  assert.equal(insights.find((item) => item.id === "effect")?.value, "observed · 2 bytes");
  assert.equal(insights.find((item) => item.id === "verification")?.value, "verified");
});

test("classifies every trace category into an explicit semantic kind", () => {
  assert.equal(traceVisualKind("signal"), "observed");
  assert.equal(traceVisualKind("assessment"), "inference");
  assert.equal(traceVisualKind("decision"), "decision");
  assert.equal(traceVisualKind("policy-evaluation"), "authorization");
  assert.equal(traceVisualKind("outcome"), "effect");
  assert.equal(traceVisualKind("failure"), "failure");
  assert.equal(traceVisualKind("termination"), "runtime");
});
