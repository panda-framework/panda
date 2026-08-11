import assert from "node:assert/strict";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createActionRequest,
  createExecutionContext,
  createPandaExecution,
  type ActionRequest,
  type PandaExecution,
} from "@panda/shared";
import {
  ExecutionCoordinator,
  InMemoryCapabilityRegistry,
} from "./coordinator.js";
import { InMemoryExecutionStore } from "./execution-store.js";
import {
  DEFAULT_V01_MAX_CONTENT_BYTES,
  V01PolicyEngine,
  V01_FILESYSTEM_POLICY_ID,
  V01_TRANSITION_POLICY_ID,
  evaluatePolicy,
  type EffectPolicyRequest,
  type PolicyEngine,
} from "./policy.js";

const fixedTime = "2026-08-10T14:00:00.000Z";
const producer = { kind: "runtime", component: "phase-5-test" } as const;

interface EffectFixtureOptions {
  readonly executionId?: string;
  readonly actionType?: string;
  readonly target?: string;
  readonly connectorId?: string;
  readonly parameters?: unknown;
}

function effectFixture(
  options: EffectFixtureOptions = {},
): EffectPolicyRequest {
  const executionId = options.executionId ?? "exe_phase_5_policy";
  const goalId = `goal_${executionId}`;
  const correlationId = `corr_${executionId}`;
  const context = createExecutionContext({
    executionId,
    goalId,
    correlationId,
    producer,
    timestamp: fixedTime,
    activeCapability: "action",
    principal: { id: "phase-5-service", type: "service" },
    invocationHistory: [],
    values: {},
  });
  const actionRequest = createActionRequest({
    executionId,
    goalId,
    correlationId,
    causationId: "dec_phase_5_policy",
    producer: { kind: "capability", capability: "decision" },
    timestamp: fixedTime,
    actionType: options.actionType ?? "filesystem.write",
    target: options.target ?? "execution-workspace",
    connectorId: options.connectorId ?? "filesystem",
    parameters:
      options.parameters ?? {
        path: "proof.txt",
        content: "PANDA v0.1 completed",
        encoding: "utf8",
      },
    idempotencyKey: `${executionId}:filesystem.write:proof.txt`,
  });

  return {
    point: "effect",
    executionId,
    goalId,
    correlationId,
    causationId: actionRequest.id,
    producer: { kind: "capability", capability: "action" },
    context,
    actionRequest: actionRequest as ActionRequest,
  };
}

function makeExecution(executionId: string): PandaExecution {
  return createPandaExecution({
    id: executionId,
    executionId,
    goalId: `goal_${executionId}`,
    correlationId: `corr_${executionId}`,
    producer,
    timestamp: fixedTime,
    status: "pending",
    activeCapability: "perception",
    goalIds: [`goal_${executionId}`],
    updatedAt: fixedTime,
  });
}

test("allows and records the exact contained v0.1 effect without retaining content", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-policy-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const request = effectFixture();
  const evaluation = await evaluatePolicy(engine, request, {
    now: () => fixedTime,
  });

  assert.equal(engine.maxContentBytes, DEFAULT_V01_MAX_CONTENT_BYTES);
  assert.equal(
    engine.workspaceFor(request.executionId),
    resolve(temporaryRoot, "runs", request.executionId, "workspace"),
  );
  assert.equal(evaluation.kind, "policy-evaluation");
  assert.equal(evaluation.point, "effect");
  assert.equal(evaluation.policyId, V01_FILESYSTEM_POLICY_ID);
  assert.equal(evaluation.result, "allow");
  assert.equal(evaluation.causationId, request.actionRequest.id);
  assert.equal(evaluation.inputs.relativePath, "proof.txt");
  assert.equal(evaluation.inputs.contentBytes, 20);
  assert.equal(evaluation.inputs.principalId, "phase-5-service");
  assert.equal(evaluation.inputs.principalType, "service");
  assert.equal("content" in evaluation.inputs, false);
  assert.equal(
    JSON.stringify(evaluation.inputs).includes("PANDA v0.1 completed"),
    false,
  );
  await assert.rejects(lstat(engine.workspaceFor(request.executionId)), {
    code: "ENOENT",
  });
});

test("denies unsupported, escaping, malformed, and oversized effect candidates", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-policy-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({
    dataDirectory: temporaryRoot,
    maxContentBytes: 4,
  });
  const mismatchedContext = effectFixture();
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly request: EffectPolicyRequest;
    readonly reason: RegExp;
  }> = [
    {
      name: "POSIX absolute path",
      request: effectFixture({
        parameters: { path: "/tmp/proof.txt", content: "ok", encoding: "utf8" },
      }),
      reason: /Absolute/,
    },
    {
      name: "Windows absolute path",
      request: effectFixture({
        parameters: {
          path: "C:\\temp\\proof.txt",
          content: "ok",
          encoding: "utf8",
        },
      }),
      reason: /Absolute/,
    },
    {
      name: "empty path",
      request: effectFixture({
        parameters: { path: " ", content: "ok", encoding: "utf8" },
      }),
      reason: /non-empty/,
    },
    {
      name: "workspace root",
      request: effectFixture({
        parameters: { path: ".", content: "ok", encoding: "utf8" },
      }),
      reason: /below the execution workspace/,
    },
    {
      name: "explicit traversal",
      request: effectFixture({
        parameters: {
          path: "notes/../proof.txt",
          content: "ok",
          encoding: "utf8",
        },
      }),
      reason: /traversal/,
    },
    {
      name: "unsupported action",
      request: effectFixture({ actionType: "process.exec" }),
      reason: /only filesystem\.write/,
    },
    {
      name: "wrong connector",
      request: effectFixture({ connectorId: "github" }),
      reason: /filesystem connector/,
    },
    {
      name: "wrong target",
      request: effectFixture({ target: "repository" }),
      reason: /current execution workspace/,
    },
    {
      name: "invalid encoding",
      request: effectFixture({
        parameters: { path: "proof.txt", content: "ok", encoding: "base64" },
      }),
      reason: /UTF-8 string content/,
    },
    {
      name: "one byte above configured maximum",
      request: effectFixture({
        parameters: { path: "proof.txt", content: "12345", encoding: "utf8" },
      }),
      reason: /4-byte/,
    },
    {
      name: "unsafe execution identifier",
      request: effectFixture({ executionId: "../escape" }),
      reason: /execution identifier/,
    },
    {
      name: "mismatched execution context",
      request: {
        ...mismatchedContext,
        context: {
          ...mismatchedContext.context,
          executionId: "exe_other_context",
        },
      },
      reason: /policy context identity/,
    },
    {
      name: "missing effect principal",
      request: {
        ...mismatchedContext,
        context: {
          ...mismatchedContext.context,
          principal: undefined,
        },
      },
      reason: /requires a valid authenticated or runtime principal/,
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const decision = await engine.evaluate(fixture.request);
      assert.equal(decision.policyId, V01_FILESYSTEM_POLICY_ID);
      assert.equal(decision.result, "deny");
      assert.match(decision.reason, fixture.reason);
    });
  }
});

test("denies an existing symbolic-link escape", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-policy-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const workspace = engine.workspaceFor("exe_phase_5_policy");
  const outside = join(temporaryRoot, "outside");
  await mkdir(workspace, { recursive: true });
  await mkdir(outside, { recursive: true });
  await symlink(outside, join(workspace, "escape"), "dir");

  const decision = await engine.evaluate(
    effectFixture({
      parameters: {
        path: "escape/proof.txt",
        content: "PANDA v0.1 completed",
        encoding: "utf8",
      },
    }),
  );

  assert.equal(decision.result, "deny");
  assert.match(decision.reason, /Symbolic-link or equivalent/);
});

test("denies an existing hard-link target with an external alias", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-policy-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const workspace = engine.workspaceFor("exe_phase_5_policy");
  const outsideFile = join(temporaryRoot, "external.txt");
  await mkdir(workspace, { recursive: true });
  await writeFile(outsideFile, "external", "utf8");
  await link(outsideFile, join(workspace, "proof.txt"));

  const decision = await engine.evaluate(effectFixture());

  assert.equal(decision.result, "deny");
  assert.match(decision.reason, /Symbolic-link or equivalent/);
});

test("rejects a transition denied by policy before invoking its target", async () => {
  const store = new InMemoryExecutionStore();
  const registry = new InMemoryCapabilityRegistry();
  const execution = store.createExecution(
    makeExecution("exe_phase_5_transition_denial"),
  );
  let actionInvocations = 0;
  registry.register({
    capability: "perception",
    invoke: () => ({
      output: "candidate",
      nextStep: {
        kind: "invoke",
        target: "action",
        reason: "request a policy-controlled target",
      },
    }),
  });
  registry.register({
    capability: "action",
    invoke: () => {
      actionInvocations += 1;
      return {
        output: undefined,
        nextStep: {
          kind: "terminate",
          outcome: "succeeded",
          reason: "must not run",
        },
      };
    },
  });
  const policyEngine: PolicyEngine = {
    evaluate(request) {
      return {
        policyId: V01_TRANSITION_POLICY_ID,
        result: request.point === "transition" ? "deny" : "allow",
        reason: "phase-5 transition denial fixture",
        inputs: { point: request.point },
      };
    },
  };

  const result = await new ExecutionCoordinator(store, registry, {
    now: () => fixedTime,
    policyEngine,
  }).run({ executionId: execution.executionId, input: "signal" });

  assert.equal(result.execution.status, "failed");
  assert.equal(result.failure?.category, "policy-violation");
  assert.equal(result.failure?.code, "TRANSITION_POLICY_DENIED");
  assert.equal(actionInvocations, 0);
  const trace = store.getTrace(execution.executionId);
  const evaluation = trace.find(
    (record) => record.type === "policy.transition.deny",
  );
  const rejected = trace.find(
    (record) => record.type === "transition.rejected",
  );
  assert.ok(evaluation);
  assert.ok(rejected);
  assert.ok(isRecord(evaluation.payload));
  assert.ok(isRecord(rejected.payload));
  assert.ok(isRecord(rejected.payload.policy));
  assert.equal(rejected.payload.policy.evaluationId, evaluation.payload.id);
  assert.equal(rejected.payload.policy.result, "deny");
});

test("cancels coordination while transition policy evaluation is pending", async () => {
  const store = new InMemoryExecutionStore();
  const registry = new InMemoryCapabilityRegistry();
  const execution = store.createExecution(
    makeExecution("exe_phase_5_policy_cancellation"),
  );
  registry.register({
    capability: "perception",
    invoke: () => ({
      output: "ready",
      nextStep: {
        kind: "terminate",
        outcome: "succeeded",
        reason: "subject to transition policy",
      },
    }),
  });
  let policyStarted!: () => void;
  const started = new Promise<void>((resolveStarted) => {
    policyStarted = resolveStarted;
  });
  const policyEngine: PolicyEngine = {
    evaluate() {
      policyStarted();
      return new Promise<never>(() => undefined);
    },
  };
  const controller = new AbortController();
  const running = new ExecutionCoordinator(store, registry, {
    now: () => fixedTime,
    policyEngine,
  }).run({
    executionId: execution.executionId,
    input: "signal",
    signal: controller.signal,
  });

  await started;
  controller.abort("phase-5 policy cancellation fixture");
  const result = await running;

  assert.equal(result.execution.status, "cancelled");
  assert.equal(result.failure?.category, "cancellation");
  assert.equal(result.failure?.code, "COORDINATION_CANCELLED");
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
