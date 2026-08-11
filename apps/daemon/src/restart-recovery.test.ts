import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createGoal,
  createPandaExecution,
  createTraceRecord,
  type PandaExecutionView,
} from "@panda/shared";
import {
  PandaDaemonRuntime,
  PandaDaemonRuntimeError,
} from "./execution-runtime.js";
import { createDaemon } from "./server.js";

async function withDataDirectory(context: test.TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "panda-restart-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("terminal execution, Goal, and trace remain authoritative after restart", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const first = await createDaemon({ dataDirectory });
  const response = await first.app.inject({
    method: "POST",
    url: "/executions",
    payload: {
      source: "restart-test",
      payload: { path: "durable.txt", content: "survives restart" },
    },
  });
  const created = response.json<PandaExecutionView>();
  const originalTrace = first.runtime.getTrace(created.executionId) ?? [];
  await first.app.close();

  const second = await createDaemon({ dataDirectory });
  context.after(() => second.app.close());
  const detail = await second.app.inject({
    method: "GET",
    url: `/executions/${created.executionId}`,
  });
  const trace = await second.app.inject({
    method: "GET",
    url: `/executions/${created.executionId}/trace`,
  });

  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json<PandaExecutionView>().status, "succeeded");
  assert.equal(detail.json<PandaExecutionView>().goal.status, "achieved");
  assert.deepEqual(trace.json(), JSON.parse(JSON.stringify(originalTrace)));
});

test("waiting work remains waiting across restart without automatic replay", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const first = await createDaemon({ dataDirectory });
  const response = await first.app.inject({
    method: "POST",
    url: "/executions",
    payload: { payload: { path: "needs-content.txt" } },
  });
  const created = response.json<PandaExecutionView>();
  const originalTraceLength =
    first.runtime.getTrace(created.executionId)?.length ?? 0;
  await first.app.close();

  const second = await createDaemon({ dataDirectory });
  context.after(() => second.app.close());
  const recovered = second.runtime.getExecutionView(created.executionId);

  assert.equal(recovered?.status, "waiting");
  assert.equal(recovered?.goal.status, "awaiting-human");
  assert.equal(second.runtime.getTrace(created.executionId)?.length, originalTraceLength);
  assert.equal(
    second.runtime
      .getTrace(created.executionId)
      ?.some((record) => record.type === "failure.process_restart_interrupted"),
    false,
  );
});

test("startup terminates interrupted active work without replaying Action", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const executionId = "exe_interrupted";
  const goalId = "goal_interrupted";
  const correlationId = "corr_interrupted";
  const timestamp = "2026-08-10T19:00:00.000Z";
  const producer = { kind: "runtime", component: "restart-fixture" } as const;
  const first = new PandaDaemonRuntime({ dataDirectory });
  first.executionStore.createExecution(
    createPandaExecution({
      id: executionId,
      executionId,
      goalId,
      correlationId,
      producer,
      timestamp,
      status: "running",
      activeCapability: "action",
      goalIds: [goalId],
      startedAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  first.goalStore.createGoal(
    createGoal({
      id: goalId,
      goalId,
      executionId,
      correlationId,
      producer,
      timestamp,
      objective: "Do not replay an interrupted Action.",
      priority: 1,
      constraints: [],
      successCriteria: [],
      failureCriteria: [],
      status: "active",
      owner: { id: "panda", type: "system" },
      dependencyGoalIds: [],
    }),
  );
  const signal = first.executionStore.appendTrace(
    createTraceRecord({
      id: "trace_interrupted_signal",
      executionId,
      goalId,
      correlationId,
      producer,
      timestamp,
      category: "signal",
      type: "signal.accepted",
      payload: { path: "uncertain.txt" },
    }),
  );
  first.executionStore.appendTrace(
    createTraceRecord({
      id: "trace_interrupted_action",
      executionId,
      goalId,
      correlationId,
      causationId: signal.id,
      producer: { kind: "capability", capability: "action" },
      timestamp,
      category: "action-request",
      type: "action.authorized",
      payload: { actionRequestId: "act_interrupted" },
    }),
  );

  const second = new PandaDaemonRuntime({
    dataDirectory,
    now: () => "2026-08-10T19:00:01.000Z",
  });
  const recovered = second.getExecutionView(executionId);
  const trace = second.getTrace(executionId) ?? [];
  const failure = trace.find(
    (record) => record.type === "failure.process_restart_interrupted",
  );

  assert.equal(recovered?.status, "failed");
  assert.equal(recovered?.execution.activeCapability, undefined);
  assert.equal(recovered?.execution.terminalOutcome, "failed");
  assert.equal(recovered?.goal.status, "failed");
  assert.equal((failure?.payload as { effectStatus?: string }).effectStatus, "unknown");
  assert.equal(trace.at(-1)?.type, "execution.failed");
  assert.deepEqual(
    trace.map((record) => record.sequence),
    trace.map((_record, index) => index + 1),
  );
});

test("startup finalizes an active Execution whose Goal was already terminal", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const executionId = "exe_goal_complete";
  const goalId = "goal_complete";
  const correlationId = "corr_goal_complete";
  const producer = { kind: "runtime", component: "restart-fixture" } as const;
  const first = new PandaDaemonRuntime({ dataDirectory });
  first.executionStore.createExecution(
    createPandaExecution({
      id: executionId,
      executionId,
      goalId,
      correlationId,
      producer,
      status: "running",
      activeCapability: "analysis",
      goalIds: [goalId],
      startedAt: "2026-08-10T19:30:00.000Z",
      updatedAt: "2026-08-10T19:30:01.000Z",
    }),
  );
  first.goalStore.createGoal(
    createGoal({
      id: goalId,
      goalId,
      executionId,
      correlationId,
      producer: { kind: "capability", capability: "analysis" },
      objective: "Finalize already verified work after restart.",
      priority: 1,
      constraints: [],
      successCriteria: [],
      failureCriteria: [],
      status: "achieved",
      statusReason: "Verification committed before interruption.",
      owner: { id: "panda", type: "system" },
      dependencyGoalIds: [],
    }),
  );

  const second = new PandaDaemonRuntime({ dataDirectory });
  const recovered = second.getExecutionView(executionId);
  const trace = second.getTrace(executionId) ?? [];

  assert.equal(recovered?.status, "succeeded");
  assert.equal(recovered?.goal.status, "achieved");
  assert.equal(
    trace.some((record) => record.type === "failure.process_restart_interrupted"),
    false,
  );
  assert.equal(
    (trace.at(-1)?.payload as { code?: string }).code,
    "PROCESS_RESTART_FINALIZED_TERMINAL_GOAL",
  );
});

test("memory persistence remains available for explicitly ephemeral daemons", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const first = await createDaemon({ dataDirectory, persistence: "memory" });
  const response = await first.app.inject({
    method: "POST",
    url: "/executions",
    payload: { payload: { path: "ephemeral.txt", content: "temporary" } },
  });
  const created = response.json<PandaExecutionView>();
  await first.app.close();

  const second = await createDaemon({ dataDirectory, persistence: "memory" });
  context.after(() => second.app.close());
  assert.equal(second.runtime.getExecutionView(created.executionId), undefined);
  assert.equal(
    (await second.app.inject({ method: "GET", url: "/health" })).json().persistence,
    "memory",
  );
});

test("startup rejects an incomplete Execution and Goal persistence pair", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const first = new PandaDaemonRuntime({ dataDirectory });
  first.executionStore.createExecution(
    createPandaExecution({
      id: "exe_incomplete",
      executionId: "exe_incomplete",
      goalId: "goal_missing",
      correlationId: "corr_incomplete",
      producer: { kind: "runtime", component: "incomplete-fixture" },
      status: "waiting",
      activeCapability: "perception",
      goalIds: ["goal_missing"],
      updatedAt: "2026-08-10T20:00:00.000Z",
    }),
  );

  assert.throws(
    () => new PandaDaemonRuntime({ dataDirectory }),
    (error: unknown) => {
      assert.ok(error instanceof PandaDaemonRuntimeError);
      assert.equal(error.code, "PERSISTED_RUNTIME_STATE_INCOMPLETE");
      return true;
    },
  );
});
