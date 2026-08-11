import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  V01PolicyEngine,
  V01_FILESYSTEM_POLICY_ID,
  type ActionConnector,
  type EffectObserver,
  type PolicyEngine,
} from "@panda/core";
import {
  createOutcome,
  nowIso,
  type PandaExecutionView,
  type StoredPandaTraceRecord,
} from "@panda/shared";
import type { PandaDaemonRuntimeOptions } from "./execution-runtime.js";
import { createDaemon } from "./server.js";

const goldenPayload = {
  path: "proof.txt",
  content: "PANDA v0.1 completed",
} as const;

type RuntimeOptionsFactory = (
  dataDirectory: string,
) => Omit<PandaDaemonRuntimeOptions, "dataDirectory">;

async function withReleaseDaemon(
  context: test.TestContext,
  optionsFactory: RuntimeOptionsFactory = () => ({}),
) {
  const dataDirectory = await mkdtemp(join(tmpdir(), "panda-release-e2e-"));
  const daemon = await createDaemon({
    dataDirectory,
    ...optionsFactory(dataDirectory),
  });
  context.after(async () => {
    await daemon.app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });
  return { ...daemon, dataDirectory };
}

async function createExecution(
  app: Awaited<ReturnType<typeof createDaemon>>["app"],
  payload: { path?: string; content?: string },
): Promise<PandaExecutionView> {
  const response = await app.inject({
    method: "POST",
    url: "/executions",
    payload: { source: "phase-11-release-e2e", payload },
  });
  assert.equal(response.statusCode, 200);
  return response.json<PandaExecutionView>();
}

function invocationRoute(trace: readonly StoredPandaTraceRecord[]): string[] {
  return trace.flatMap((record) => {
    if (record.type !== "capability.started" || !isRecord(record.payload)) {
      return [];
    }
    return typeof record.payload.capability === "string"
      ? [record.payload.capability]
      : [];
  });
}

test("release: successful sandboxed execution is independently verified", async (context) => {
  const { app, runtime } = await withReleaseDaemon(context);
  const created = await createExecution(app, goldenPayload);
  const trace = runtime.getTrace(created.executionId) ?? [];

  assert.equal(created.status, "succeeded");
  assert.equal(created.execution.terminalOutcome, "succeeded");
  assert.equal(created.goal.status, "achieved");
  assert.equal(created.outcome?.status, "succeeded");
  assert.equal(created.outcome?.effectStatus, "completed");
  assert.equal(
    (created.verification?.result as { status?: string }).status,
    "verified",
  );
  assert.deepEqual(invocationRoute(trace), [
    "perception",
    "analysis",
    "decision",
    "action",
    "perception",
    "analysis",
  ]);
  assert.equal(
    await readFile(
      join(runtime.policyEngine.workspaceFor(created.executionId), "proof.txt"),
      "utf8",
    ),
    goldenPayload.content,
  );
  assert.ok(trace.find((record) => record.type === "policy.effect.allow"));
  assert.ok(trace.find((record) => record.type === "verification.verified"));
  assert.equal(trace.at(-1)?.type, "execution.succeeded");
});

test("release: missing information waits without Decision or Action", async (context) => {
  const { app, runtime } = await withReleaseDaemon(context);
  const created = await createExecution(app, { path: goldenPayload.path });
  const trace = runtime.getTrace(created.executionId) ?? [];

  assert.equal(created.status, "waiting");
  assert.equal(created.goal.status, "awaiting-human");
  assert.equal(created.outcome, undefined);
  assert.deepEqual(invocationRoute(trace), ["perception", "analysis"]);
  assert.equal(
    trace.some((record) =>
      ["decision", "action-request", "connector-invocation", "outcome"].includes(
        record.category,
      ),
    ),
    false,
  );
  assert.equal(trace.at(-1)?.category, "wait");
  await assert.rejects(
    readFile(
      join(runtime.policyEngine.workspaceFor(created.executionId), "proof.txt"),
      "utf8",
    ),
    (error: unknown) => isNodeError(error) && error.code === "ENOENT",
  );
});

test("release: policy denial performs no connector effect", async (context) => {
  const { app, runtime } = await withReleaseDaemon(context, (dataDirectory) => {
    const base = new V01PolicyEngine({ dataDirectory });
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
    return { executionPolicyEngine: denyingPolicy };
  });
  const created = await createExecution(app, goldenPayload);
  const trace = runtime.getTrace(created.executionId) ?? [];

  assert.equal(created.status, "failed");
  assert.equal(created.goal.status, "failed");
  assert.equal(created.outcome?.status, "rejected");
  assert.equal(created.outcome?.effectStatus, "none");
  assert.deepEqual(invocationRoute(trace), [
    "perception",
    "analysis",
    "decision",
    "action",
    "decision",
  ]);
  assert.ok(
    trace.find(
      (record) =>
        record.category === "policy-evaluation" &&
        isRecord(record.payload) &&
        record.payload.point === "effect" &&
        record.payload.result === "deny",
    ),
  );
  assert.equal(
    trace.some((record) => record.category === "connector-invocation"),
    false,
  );
  await assert.rejects(
    readFile(
      join(runtime.policyEngine.workspaceFor(created.executionId), "proof.txt"),
      "utf8",
    ),
    (error: unknown) => isNodeError(error) && error.code === "ENOENT",
  );
});

test("release: pre-effect connector failure returns to Decision and fails", async (context) => {
  const failingConnector: ActionConnector = {
    id: "filesystem",
    actionTypes: ["filesystem.write"],
    async execute(request, invocation) {
      const timestamp = nowIso();
      return createOutcome({
        executionId: request.executionId,
        goalId: request.goalId,
        correlationId: request.correlationId,
        causationId: invocation.id,
        producer: { kind: "connector", connectorId: "filesystem" },
        timestamp,
        actionRequestId: request.id,
        status: "failed",
        effectStatus: "none",
        startedAt: timestamp,
        endedAt: timestamp,
        error: {
          code: "RELEASE_FIXTURE_PRE_EFFECT_FAILURE",
          message: "The release fixture failed before opening the target.",
        },
      });
    },
  };
  const { app, runtime } = await withReleaseDaemon(context, () => ({
    actionConnector: failingConnector,
  }));
  const created = await createExecution(app, goldenPayload);
  const trace = runtime.getTrace(created.executionId) ?? [];

  assert.equal(created.status, "failed");
  assert.equal(created.goal.status, "failed");
  assert.equal(created.outcome?.status, "failed");
  assert.equal(created.outcome?.effectStatus, "none");
  assert.equal(created.outcome?.error?.code, "RELEASE_FIXTURE_PRE_EFFECT_FAILURE");
  assert.deepEqual(invocationRoute(trace), [
    "perception",
    "analysis",
    "decision",
    "action",
    "decision",
  ]);
  assert.equal(
    trace.filter((record) => record.category === "connector-invocation").length,
    1,
  );
  assert.equal(
    trace.some((record) => record.type.startsWith("verification.")),
    false,
  );
  await assert.rejects(
    readFile(
      join(runtime.policyEngine.workspaceFor(created.executionId), "proof.txt"),
      "utf8",
    ),
    (error: unknown) => isNodeError(error) && error.code === "ENOENT",
  );
});

test("release: verification mismatch cannot achieve the Goal", async (context) => {
  const mismatch = "PANDA v0.1 mismatch";
  const mismatchObserver: EffectObserver = {
    id: "release-mismatch-observer",
    async observe(request) {
      return {
        status: "observed",
        relativePath: request.relativePath,
        exists: true,
        content: mismatch,
        byteCount: Buffer.byteLength(mismatch, "utf8"),
        contentHash: createHash("sha256").update(mismatch).digest("hex"),
        hashAlgorithm: "sha256",
        observedAt: nowIso(),
      };
    },
  };
  const { app, runtime } = await withReleaseDaemon(context, () => ({
    effectObserver: mismatchObserver,
  }));
  const created = await createExecution(app, goldenPayload);
  const trace = runtime.getTrace(created.executionId) ?? [];

  assert.equal(created.status, "failed");
  assert.equal(created.goal.status, "failed");
  assert.equal(created.outcome?.status, "succeeded");
  assert.equal(created.outcome?.effectStatus, "completed");
  assert.equal(
    (created.verification?.result as { status?: string }).status,
    "mismatch",
  );
  assert.deepEqual(invocationRoute(trace), [
    "perception",
    "analysis",
    "decision",
    "action",
    "perception",
    "analysis",
    "decision",
  ]);
  assert.ok(trace.find((record) => record.type === "verification.failed"));
  assert.equal(
    trace.some((record) => record.type === "goal.achieved"),
    false,
  );
  assert.equal(
    trace.some((record) => record.type === "execution.succeeded"),
    false,
  );
});

test("release: invocation limit terminates with a structured failure", async (context) => {
  const { app, runtime } = await withReleaseDaemon(context, () => ({
    maxInvocations: 1,
  }));
  const created = await createExecution(app, goldenPayload);
  const trace = runtime.getTrace(created.executionId) ?? [];
  const failure = trace.find(
    (record) =>
      record.category === "failure" &&
      isRecord(record.payload) &&
      record.payload.code === "INVOCATION_LIMIT_REACHED",
  );

  assert.equal(created.status, "failed");
  assert.notEqual(created.goal.status, "achieved");
  assert.deepEqual(invocationRoute(trace), ["perception"]);
  assert.ok(failure);
  assert.equal(trace.at(-1)?.type, "execution.failed");
  assert.equal(
    trace.some((record) => record.category === "action-request"),
    false,
  );
});

test("release: concurrent executions isolate identity, files, and traces", async (context) => {
  const { app, runtime } = await withReleaseDaemon(context);
  const [first, second] = await Promise.all([
    createExecution(app, { path: "proof.txt", content: "first release" }),
    createExecution(app, { path: "proof.txt", content: "second release" }),
  ]);
  const firstTrace = runtime.getTrace(first.executionId) ?? [];
  const secondTrace = runtime.getTrace(second.executionId) ?? [];

  assert.equal(first.status, "succeeded");
  assert.equal(second.status, "succeeded");
  assert.notEqual(first.executionId, second.executionId);
  assert.notEqual(first.goal.id, second.goal.id);
  assert.notEqual(first.execution.correlationId, second.execution.correlationId);
  assert.equal(
    await readFile(
      join(runtime.policyEngine.workspaceFor(first.executionId), "proof.txt"),
      "utf8",
    ),
    "first release",
  );
  assert.equal(
    await readFile(
      join(runtime.policyEngine.workspaceFor(second.executionId), "proof.txt"),
      "utf8",
    ),
    "second release",
  );
  assert.ok(firstTrace.every((record) => record.executionId === first.executionId));
  assert.ok(secondTrace.every((record) => record.executionId === second.executionId));
});

test("release: the retrieved trace reconstructs the complete causal chain", async (context) => {
  const { app } = await withReleaseDaemon(context);
  const created = await createExecution(app, goldenPayload);
  const response = await app.inject({ method: "GET", url: created.traceUrl });
  const trace = response.json<StoredPandaTraceRecord[]>();
  const byId = new Map(trace.map((record) => [record.id, record]));

  assert.equal(response.statusCode, 200);
  assert.equal(trace.length, 43);
  assert.deepEqual(
    trace.map((record) => record.sequence),
    trace.map((_record, index) => index + 1),
  );
  for (const [index, record] of trace.entries()) {
    assert.equal(record.executionId, created.executionId);
    assert.equal(record.goalId, created.goal.id);
    assert.equal(record.correlationId, created.execution.correlationId);
    if (index === 0) {
      assert.equal(record.causationId, undefined);
      continue;
    }
    assert.equal(typeof record.causationId, "string");
    const cause = byId.get(record.causationId ?? "");
    assert.ok(cause, `missing cause ${record.causationId} for ${record.id}`);
    assert.ok(cause.sequence < record.sequence);
  }

  const requiredTypes = [
    "signal.accepted",
    "goal.created",
    "decision.created",
    "policy.effect.allow",
    "action.authorized",
    "connector.completed",
    "action.succeeded",
    "verification.observed",
    "verification.verified",
    "goal.achieved",
    "execution.succeeded",
  ];
  let previousIndex = -1;
  for (const type of requiredTypes) {
    const index = trace.findIndex((record) => record.type === type);
    assert.ok(index > previousIndex, `${type} must follow its prerequisite`);
    previousIndex = index;
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
