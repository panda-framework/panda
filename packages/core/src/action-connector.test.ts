import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createActionRequest,
  createExecutionContext,
  type ActionRequest,
  type ExecutionContext,
} from "@panda/shared";
import {
  ActionConnectorRegistryError,
  FilesystemActionConnector,
  InMemoryActionConnectorRegistry,
  type FilesystemWriteOutcomeData,
} from "./action-connector.js";
import {
  V01PolicyEngine,
  V01_FILESYSTEM_POLICY_ID,
  evaluatePolicy,
  type PolicyRequest,
} from "./policy.js";

const fixedTime = "2026-08-10T15:00:00.000Z";
const producer = { kind: "runtime", component: "phase-6-test" } as const;

async function authorizedFixture(
  engine: V01PolicyEngine,
  executionId = "exe_phase_6_connector",
  parameters: unknown = {
    path: "nested/proof.txt",
    content: "PANDA v0.1 completed",
    encoding: "utf8",
  },
): Promise<{
  readonly context: ExecutionContext;
  readonly request: ActionRequest;
}> {
  const goalId = `goal_${executionId}`;
  const correlationId = `corr_${executionId}`;
  const context = createExecutionContext({
    executionId,
    goalId,
    correlationId,
    producer,
    timestamp: fixedTime,
    activeCapability: "action",
    invocationHistory: [],
    values: {},
  });
  const candidate = createActionRequest({
    executionId,
    goalId,
    correlationId,
    causationId: "dec_phase_6_connector",
    producer: { kind: "capability", capability: "decision" },
    timestamp: fixedTime,
    actionType: "filesystem.write",
    target: "execution-workspace",
    connectorId: "filesystem",
    parameters,
    idempotencyKey: `${executionId}:filesystem.write:proof.txt`,
  });
  const evaluation = await evaluatePolicy(
    engine,
    {
      point: "effect",
      executionId,
      goalId,
      correlationId,
      causationId: candidate.id,
      producer: { kind: "capability", capability: "action" },
      context,
      actionRequest: candidate,
    },
    { now: () => fixedTime },
  );
  assert.equal(evaluation.result, "allow");
  return {
    context,
    request: createActionRequest({
      executionId,
      goalId,
      correlationId,
      causationId: evaluation.id,
      producer: { kind: "capability", capability: "action" },
      timestamp: fixedTime,
      actionType: candidate.actionType,
      target: candidate.target,
      connectorId: candidate.connectorId,
      parameters: candidate.parameters,
      authorization: {
        policyId: evaluation.policyId,
        evaluationId: evaluation.id,
      },
      idempotencyKey: candidate.idempotencyKey,
    }),
  };
}

test("registers connector ownership and rejects unsupported dispatch", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-connector-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const fixture = await authorizedFixture(engine);
  const connector = new FilesystemActionConnector({ policyEngine: engine });
  const registry = new InMemoryActionConnectorRegistry();
  const unregister = registry.register(connector);

  assert.equal(registry.has("filesystem"), true);
  assert.deepEqual(registry.list(), [connector]);
  assert.throws(
    () => registry.register(connector),
    (error) =>
      isRegistryError(error, "ACTION_CONNECTOR_ALREADY_REGISTERED"),
  );
  assert.throws(
    () =>
      registry.execute(
        { ...fixture.request, actionType: "process.exec" },
        {
          id: "conninv_unsupported",
          context: fixture.context,
          signal: new AbortController().signal,
        },
      ),
    (error) => isRegistryError(error, "ACTION_TYPE_UNSUPPORTED"),
  );

  unregister();
  assert.equal(registry.has("filesystem"), false);
});

test("writes exact UTF-8 bytes and returns a hashed completed outcome", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-connector-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const fixture = await authorizedFixture(engine);
  const connector = new FilesystemActionConnector({
    policyEngine: engine,
    now: () => fixedTime,
  });
  const outcome = await connector.execute(fixture.request, {
    id: "conninv_phase_6_success",
    context: fixture.context,
    signal: new AbortController().signal,
  });

  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.effectStatus, "completed");
  assert.equal(outcome.causationId, "conninv_phase_6_success");
  assert.equal(outcome.actionRequestId, fixture.request.id);
  assert.equal(outcome.producer.kind, "connector");
  assert.equal(
    await readFile(
      join(
        engine.workspaceFor(fixture.context.executionId),
        "nested",
        "proof.txt",
      ),
      "utf8",
    ),
    "PANDA v0.1 completed",
  );
  const data = outcome.data as FilesystemWriteOutcomeData;
  assert.equal(data.relativePath, "nested/proof.txt");
  assert.equal(
    data.resolvedPath,
    resolve(
      temporaryRoot,
      "runs",
      fixture.context.executionId,
      "workspace",
      "nested",
      "proof.txt",
    ),
  );
  assert.equal(data.bytesWritten, 20);
  assert.equal(data.hashAlgorithm, "sha256");
  assert.equal(
    data.contentHash,
    createHash("sha256").update("PANDA v0.1 completed").digest("hex"),
  );
  assert.equal(
    data.authorizationEvaluationId,
    fixture.request.authorization?.evaluationId,
  );
  assert.equal(data.boundaryPolicyId, V01_FILESYSTEM_POLICY_ID);
});

test("rejects missing authorization and traversal before creating a workspace", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-connector-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const fixture = await authorizedFixture(engine);
  const connector = new FilesystemActionConnector({ policyEngine: engine });
  const invocation = {
    id: "conninv_phase_6_rejected",
    context: fixture.context,
    signal: new AbortController().signal,
  };

  const unauthorized = await connector.execute(
    { ...fixture.request, authorization: undefined },
    invocation,
  );
  assert.equal(unauthorized.status, "rejected");
  assert.equal(unauthorized.effectStatus, "none");
  assert.equal(unauthorized.error?.code, "ACTION_AUTHORIZATION_REQUIRED");

  const traversal = await connector.execute(
    {
      ...fixture.request,
      parameters: {
        path: "../escape.txt",
        content: "blocked",
        encoding: "utf8",
      },
    },
    invocation,
  );
  assert.equal(traversal.status, "rejected");
  assert.equal(traversal.effectStatus, "none");
  assert.equal(traversal.error?.code, "FILESYSTEM_BOUNDARY_DENIED");
  await assert.rejects(lstat(engine.workspaceFor(fixture.context.executionId)), {
    code: "ENOENT",
  });
});

test("reports pre-effect I/O failure and cancellation without success", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-connector-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const dataFile = join(temporaryRoot, "not-a-directory");
  await writeFile(dataFile, "occupied", "utf8");
  const engine = new V01PolicyEngine({ dataDirectory: dataFile });
  const fixture = await authorizedFixture(
    new V01PolicyEngine({ dataDirectory: temporaryRoot }),
    "exe_phase_6_io_failure",
  );
  const connector = new FilesystemActionConnector({ policyEngine: engine });
  const failed = await connector.execute(fixture.request, {
    id: "conninv_phase_6_io_failure",
    context: fixture.context,
    signal: new AbortController().signal,
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.effectStatus, "none");
  assert.equal(failed.error?.code, "FILESYSTEM_WRITE_FAILED");

  const cancelledController = new AbortController();
  cancelledController.abort("test cancellation");
  const cancelled = await connector.execute(fixture.request, {
    id: "conninv_phase_6_cancelled",
    context: fixture.context,
    signal: cancelledController.signal,
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.effectStatus, "none");
  assert.equal(cancelled.error?.code, "ACTION_CANCELLED");
});

test("reports an expired request timeout distinctly", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-connector-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  class DelayedPolicyEngine extends V01PolicyEngine {
    override async evaluate(request: PolicyRequest, signal?: AbortSignal) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
      return super.evaluate(request, signal);
    }
  }
  const engine = new DelayedPolicyEngine({ dataDirectory: temporaryRoot });
  const fixture = await authorizedFixture(
    new V01PolicyEngine({ dataDirectory: temporaryRoot }),
    "exe_phase_6_timeout",
  );
  const connector = new FilesystemActionConnector({ policyEngine: engine });
  const outcome = await connector.execute(
    { ...fixture.request, timeoutMs: 1 },
    {
      id: "conninv_phase_6_timeout",
      context: fixture.context,
      signal: new AbortController().signal,
    },
  );

  assert.equal(outcome.status, "timeout");
  assert.equal(outcome.effectStatus, "none");
  assert.equal(outcome.error?.code, "ACTION_TIMEOUT");
});

function isRegistryError(
  error: unknown,
  code: ActionConnectorRegistryError["code"],
): boolean {
  assert.ok(error instanceof ActionConnectorRegistryError);
  assert.equal(error.code, code);
  return true;
}
