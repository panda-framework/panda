import assert from "node:assert/strict";
import test from "node:test";
import {
  createPandaExecution,
  type NextStep,
  type PandaCapability,
  type PandaExecution,
} from "@panda/shared";
import {
  CapabilityRegistryError,
  ExecutionCoordinator,
  ExecutionCoordinatorError,
  InMemoryCapabilityRegistry,
  type CapabilityImplementation,
  type CapabilityInvocation,
  type CapabilityResult,
} from "./coordinator.js";
import { InMemoryExecutionStore } from "./execution-store.js";

const producer = { kind: "runtime", component: "phase-3-test" } as const;

function makeExecution(
  executionId: string,
  activeCapability: PandaCapability = "perception",
  deadline?: string,
): PandaExecution {
  return createPandaExecution({
    id: executionId,
    executionId,
    goalId: `goal_${executionId}`,
    correlationId: `corr_${executionId}`,
    producer,
    status: "pending",
    activeCapability,
    goalIds: [`goal_${executionId}`],
    updatedAt: "2026-08-10T00:00:00.000Z",
    deadline,
  });
}

function capability(
  name: PandaCapability,
  invoke: CapabilityImplementation["invoke"],
): CapabilityImplementation {
  return { capability: name, invoke };
}

function assertRegistryError(
  error: unknown,
  code: CapabilityRegistryError["code"],
): boolean {
  assert.ok(error instanceof CapabilityRegistryError);
  assert.equal(error.code, code);
  return true;
}

function assertCoordinatorError(
  error: unknown,
  code: ExecutionCoordinatorError["code"],
): boolean {
  assert.ok(error instanceof ExecutionCoordinatorError);
  assert.equal(error.code, code);
  return true;
}

test("registers, invokes, lists, and independently removes capabilities", async () => {
  const registry = new InMemoryCapabilityRegistry();
  const implementation = capability("analysis", ({ input }) => ({
    output: { received: input },
    nextStep: {
      kind: "terminate",
      outcome: "succeeded",
      reason: "analysis complete",
    },
  }));
  const unregister = registry.register(implementation);

  assert.equal(registry.has("analysis"), true);
  assert.deepEqual(registry.list(), [implementation]);
  assert.deepEqual(
    await registry.invoke("analysis", {
      context: {
        id: "ctx_registry",
        schemaVersion: "0.1",
        executionId: "exe_registry",
        goalId: "goal_registry",
        correlationId: "corr_registry",
        producer,
        timestamp: "2026-08-10T00:00:00.000Z",
        invocationHistory: [],
        values: {},
      },
      input: "payload",
      signal: new AbortController().signal,
    }),
    {
      output: { received: "payload" },
      nextStep: {
        kind: "terminate",
        outcome: "succeeded",
        reason: "analysis complete",
      },
    },
  );
  assert.throws(
    () => registry.register(implementation),
    (error) => assertRegistryError(error, "CAPABILITY_ALREADY_REGISTERED"),
  );
  assert.throws(
    () =>
      registry.register({
        ...implementation,
        capability: "unknown" as PandaCapability,
      }),
    (error) => assertRegistryError(error, "CAPABILITY_INVALID"),
  );

  unregister();
  assert.equal(registry.has("analysis"), false);
  await assert.rejects(
    registry.invoke("analysis", {
      context: {
        id: "ctx_missing",
        schemaVersion: "0.1",
        executionId: "exe_registry",
        goalId: "goal_registry",
        correlationId: "corr_registry",
        producer,
        timestamp: "2026-08-10T00:00:00.000Z",
        invocationHistory: [],
        values: {},
      },
      input: undefined,
      signal: new AbortController().signal,
    }),
    (error) => assertRegistryError(error, "CAPABILITY_NOT_FOUND"),
  );
});

test("routes dynamically through self and non-adjacent transitions", async () => {
  const store = new InMemoryExecutionStore();
  const registry = new InMemoryCapabilityRegistry();
  const execution = makeExecution("exe_dynamic");
  const route: PandaCapability[] = [];
  store.createExecution(execution);

  registry.register(
    capability("perception", ({ input }) => {
      route.push("perception");
      const visit = typeof input === "number" ? input : 0;
      return visit === 0
        ? {
            output: 1,
            nextStep: {
              kind: "invoke",
              target: "perception",
              reason: "self-check once",
            },
          }
        : {
            output: "ready",
            nextStep: {
              kind: "invoke",
              target: "action",
              reason: "skip directly to the selected responsibility",
            },
          };
    }),
  );
  registry.register(
    capability("action", ({ input }) => {
      route.push("action");
      assert.equal(input, "ready");
      return {
        output: "effect-observed",
        nextStep: {
          kind: "invoke",
          target: "analysis",
          reason: "inspect the returned result",
        },
      };
    }),
  );
  registry.register(
    capability("analysis", ({ input }) => {
      route.push("analysis");
      assert.equal(input, "effect-observed");
      return {
        output: "verified",
        nextStep: {
          kind: "terminate",
          outcome: "succeeded",
          reason: "test route verified",
        },
      };
    }),
  );

  const result = await new ExecutionCoordinator(store, registry).run({
    executionId: execution.executionId,
    input: 0,
  });

  assert.deepEqual(route, ["perception", "perception", "action", "analysis"]);
  assert.equal(result.execution.status, "succeeded");
  assert.equal(result.execution.activeCapability, undefined);
  assert.equal(result.invocationCount, 4);
  assert.equal(result.lastOutput, "verified");

  const trace = store.getTrace(execution.executionId);
  assert.equal(
    trace.filter((record) => record.type === "capability.started").length,
    4,
  );
  assert.equal(
    trace.filter((record) => record.type === "capability.completed").length,
    4,
  );
  assert.equal(
    trace.filter((record) => record.type === "transition.requested").length,
    4,
  );
  assert.equal(
    trace.filter((record) => record.type === "transition.committed").length,
    4,
  );
  assert.equal(trace.at(-1)?.category, "termination");

  const records = new Map(trace.map((record) => [record.id, record]));
  let current = trace.at(-1);
  let causalLength = 0;
  while (current !== undefined) {
    causalLength += 1;
    current = current.causationId
      ? records.get(current.causationId)
      : undefined;
  }
  assert.equal(causalLength, trace.length);
});

test("commits wait and resumes the same execution without a fixed route", async () => {
  const store = new InMemoryExecutionStore();
  const registry = new InMemoryCapabilityRegistry();
  const execution = makeExecution("exe_wait", "analysis");
  let calls = 0;
  store.createExecution(execution);
  registry.register(
    capability("analysis", ({ input, context }) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(input, "incomplete");
        return {
          output: { missing: "content" },
          nextStep: {
            kind: "wait",
            reason: "content is required",
            resumeOn: "content.supplied",
          },
        };
      }

      assert.equal(input, "complete");
      assert.equal(context.activeCapability, "analysis");
      assert.equal(context.invocationHistory.length, 1);
      return {
        output: "done",
        nextStep: {
          kind: "terminate",
          outcome: "succeeded",
          reason: "missing content arrived",
        },
      };
    }),
  );
  const coordinator = new ExecutionCoordinator(store, registry);

  const waiting = await coordinator.run({
    executionId: execution.executionId,
    input: "incomplete",
  });
  assert.equal(waiting.execution.status, "waiting");
  assert.equal(waiting.execution.activeCapability, "analysis");
  assert.equal(store.getTrace(execution.executionId).at(-1)?.category, "wait");

  const resumed = await coordinator.run({
    executionId: execution.executionId,
    input: "complete",
    expectedUpdatedAt: waiting.execution.updatedAt,
  });
  assert.equal(resumed.execution.status, "succeeded");
  assert.equal(calls, 2);
  const trace = store.getTrace(execution.executionId);
  const records = new Map(trace.map((record) => [record.id, record]));
  let current = trace.at(-1);
  let causalLength = 0;
  while (current !== undefined) {
    causalLength += 1;
    current = current.causationId
      ? records.get(current.causationId)
      : undefined;
  }
  assert.equal(causalLength, trace.length);
});

test("rejects an unregistered target and records a structured failure", async () => {
  const store = new InMemoryExecutionStore();
  const registry = new InMemoryCapabilityRegistry();
  const execution = makeExecution("exe_unknown");
  store.createExecution(execution);
  registry.register(
    capability("perception", () => ({
      output: undefined,
      nextStep: {
        kind: "invoke",
        target: "not-a-capability",
        reason: "exercise runtime validation",
      } as unknown as NextStep,
    })),
  );

  const result = await new ExecutionCoordinator(store, registry).run({
    executionId: execution.executionId,
    input: undefined,
  });

  assert.equal(result.execution.status, "failed");
  assert.equal(result.failure?.code, "CAPABILITY_NOT_REGISTERED");
  const trace = store.getTrace(execution.executionId);
  assert.equal(
    trace.find((record) => record.type === "transition.rejected")?.category,
    "transition",
  );
  assert.equal(trace.at(-2)?.category, "failure");
  assert.equal(trace.at(-1)?.category, "termination");
});

test("converts thrown and invalid capability results into structured failures", async (t) => {
  await t.test("thrown invocation", async () => {
    const store = new InMemoryExecutionStore();
    const registry = new InMemoryCapabilityRegistry();
    const execution = makeExecution("exe_throw");
    store.createExecution(execution);
    registry.register(
      capability("perception", () => {
        throw new Error("capability exploded");
      }),
    );

    const result = await new ExecutionCoordinator(store, registry).run({
      executionId: execution.executionId,
      input: undefined,
    });
    assert.equal(result.execution.status, "failed");
    assert.equal(result.failure?.category, "perception");
    assert.equal(result.failure?.code, "CAPABILITY_INVOCATION_FAILED");
    assert.equal(result.failure?.cause?.message, "capability exploded");
  });

  await t.test("invalid next step", async () => {
    const store = new InMemoryExecutionStore();
    const registry = new InMemoryCapabilityRegistry();
    const execution = makeExecution("exe_invalid_result");
    store.createExecution(execution);
    registry.register(
      capability("perception", () => ({
        output: undefined,
        nextStep: { kind: "unknown" } as unknown as NextStep,
      })),
    );

    const result = await new ExecutionCoordinator(store, registry).run({
      executionId: execution.executionId,
      input: undefined,
    });
    assert.equal(result.execution.status, "failed");
    assert.equal(result.failure?.code, "INVALID_NEXT_STEP");
  });
});

test("stops an unbounded self-transition at the invocation limit", async () => {
  const store = new InMemoryExecutionStore();
  const registry = new InMemoryCapabilityRegistry();
  const execution = makeExecution("exe_limit", "decision");
  store.createExecution(execution);
  registry.register(
    capability("decision", () => ({
      output: "again",
      nextStep: {
        kind: "invoke",
        target: "decision",
        reason: "continue indefinitely",
      },
    })),
  );

  const result = await new ExecutionCoordinator(store, registry, {
    maxInvocations: 3,
  }).run({
    executionId: execution.executionId,
    input: undefined,
  });

  assert.equal(result.invocationCount, 3);
  assert.equal(result.execution.status, "failed");
  assert.equal(result.failure?.code, "INVOCATION_LIMIT_REACHED");
  const trace = store.getTrace(execution.executionId);
  assert.equal(
    trace.filter((record) => record.type === "capability.started").length,
    3,
  );
  assert.equal(
    trace.filter((record) => record.type === "transition.rejected").length,
    1,
  );
});

test("enforces deadlines and cancellation signals", async (t) => {
  await t.test("expired deadline", async () => {
    const store = new InMemoryExecutionStore();
    const registry = new InMemoryCapabilityRegistry();
    const execution = makeExecution(
      "exe_deadline",
      "perception",
      "2026-08-09T23:59:59.000Z",
    );
    store.createExecution(execution);

    const result = await new ExecutionCoordinator(store, registry, {
      now: () => "2026-08-10T00:00:00.000Z",
    }).run({
      executionId: execution.executionId,
      input: undefined,
    });
    assert.equal(result.invocationCount, 0);
    assert.equal(result.execution.status, "failed");
    assert.equal(result.failure?.code, "EXECUTION_DEADLINE_EXCEEDED");
  });

  await t.test("in-flight cancellation", async () => {
    const store = new InMemoryExecutionStore();
    const registry = new InMemoryCapabilityRegistry();
    const execution = makeExecution("exe_cancel");
    const controller = new AbortController();
    let invocationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      invocationStarted = resolve;
    });
    store.createExecution(execution);
    registry.register(
      capability("perception", async ({ signal }) => {
        invocationStarted();
        await new Promise<void>(() => {
          assert.equal(signal.aborted, false);
        });
        return {
          output: undefined,
          nextStep: {
            kind: "terminate",
            outcome: "succeeded",
            reason: "unreachable",
          },
        };
      }),
    );

    const running = new ExecutionCoordinator(store, registry).run({
      executionId: execution.executionId,
      input: undefined,
      signal: controller.signal,
    });
    await started;
    controller.abort("test cancellation");
    const result = await running;

    assert.equal(result.invocationCount, 1);
    assert.equal(result.execution.status, "cancelled");
    assert.equal(result.failure?.code, "COORDINATION_CANCELLED");
  });
});

test("rejects a stale transition without overwriting newer execution state", async () => {
  const store = new InMemoryExecutionStore();
  const registry = new InMemoryCapabilityRegistry();
  const execution = makeExecution("exe_stale");
  let invocationStarted!: () => void;
  let finishInvocation!: (result: CapabilityResult) => void;
  const started = new Promise<void>((resolve) => {
    invocationStarted = resolve;
  });
  const resultFromCapability = new Promise<CapabilityResult>((resolve) => {
    finishInvocation = resolve;
  });
  store.createExecution(execution);
  registry.register(
    capability("perception", async (_invocation: CapabilityInvocation) => {
      invocationStarted();
      return resultFromCapability;
    }),
  );

  const running = new ExecutionCoordinator(store, registry).run({
    executionId: execution.executionId,
    input: undefined,
  });
  await started;
  const current = store.getExecution(execution.executionId);
  assert.ok(current);
  store.updateExecution({
    ...current,
    activeCapability: "decision",
    updatedAt: "2026-08-10T00:00:30.000Z",
    statusReason: "newer owner changed the route",
  });
  finishInvocation({
    output: undefined,
    nextStep: {
      kind: "terminate",
      outcome: "succeeded",
      reason: "stale result must not win",
    },
  });

  await assert.rejects(running, (error) =>
    assertCoordinatorError(error, "STALE_EXECUTION"),
  );
  assert.equal(
    store.getExecution(execution.executionId)?.activeCapability,
    "decision",
  );
  assert.equal(
    store
      .getTrace(execution.executionId)
      .filter((record) => record.type === "transition.rejected").length,
    1,
  );
});
