import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createGoal,
  createPandaExecution,
  createTraceRecord,
} from "@panda/shared";
import {
  ExecutionStoreError,
  FileExecutionStore,
} from "./execution-store.js";
import { FileGoalStore, GoalStoreError } from "./goal-store.js";

const timestamp = "2026-08-10T18:00:00.000Z";
const executionId = "exe_file_store";
const goalId = "goal_file_store";
const correlationId = "corr_file_store";
const producer = { kind: "runtime", component: "file-store-test" } as const;

async function withDataDirectory(context: test.TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "panda-file-store-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function makeExecution(status: "running" | "waiting" = "running") {
  return createPandaExecution({
    id: executionId,
    executionId,
    goalId,
    correlationId,
    producer,
    timestamp,
    status,
    activeCapability: "perception",
    goalIds: [goalId],
    startedAt: timestamp,
    updatedAt: timestamp,
  });
}

function makeGoal() {
  return createGoal({
    id: goalId,
    goalId,
    executionId,
    correlationId,
    producer,
    timestamp,
    objective: "Retain a canonical Goal across restart.",
    priority: 1,
    constraints: [],
    successCriteria: [],
    failureCriteria: [],
    status: "active",
    owner: { id: "panda", type: "system" },
    dependencyGoalIds: [],
  });
}

test("file execution store rehydrates state and continues trace sequence", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const first = new FileExecutionStore({ dataDirectory });
  const execution = first.createExecution(makeExecution());
  const root = first.appendTrace(
    createTraceRecord({
      id: "trace_file_root",
      executionId,
      goalId,
      correlationId,
      producer,
      timestamp,
      category: "signal",
      type: "signal.accepted",
      payload: { retained: true },
    }),
  );
  first.updateExecution({
    ...execution,
    status: "waiting",
    updatedAt: "2026-08-10T18:00:01.000Z",
    statusReason: "Waiting across restart.",
  });

  const second = new FileExecutionStore({ dataDirectory });
  const events: string[] = [];
  second.subscribe((record) => events.push(record.id));
  const resumed = second.appendTrace(
    createTraceRecord({
      id: "trace_file_resumed",
      executionId,
      goalId,
      correlationId,
      causationId: root.id,
      producer,
      timestamp: "2026-08-10T18:00:02.000Z",
      category: "wait",
      type: "execution.waiting",
      payload: { reason: "Still waiting." },
    }),
  );

  assert.equal(second.getExecution(executionId)?.status, "waiting");
  assert.deepEqual(
    second.getTrace(executionId).map((record) => record.sequence),
    [1, 2],
  );
  assert.equal(resumed.sequence, 2);
  assert.deepEqual(events, [resumed.id]);
});

test("file Goal store rehydrates the latest revision", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const first = new FileGoalStore({ dataDirectory });
  const goal = first.createGoal(makeGoal());
  first.updateGoal(
    {
      ...goal,
      revision: 1,
      status: "awaiting-human",
      timestamp: "2026-08-10T18:00:01.000Z",
      statusReason: "Need operator input.",
    },
    0,
  );

  const second = new FileGoalStore({ dataDirectory });
  assert.equal(second.getGoal(goalId)?.revision, 1);
  assert.equal(second.getGoal(goalId)?.status, "awaiting-human");
});

test("file stores reject corrupt persisted state before use", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const executions = new FileExecutionStore({ dataDirectory });
  const goals = new FileGoalStore({ dataDirectory });
  await writeFile(join(executions.directory, "corrupt.json"), "{not-json", "utf8");
  await writeFile(join(goals.directory, "corrupt.json"), "[]\n", "utf8");

  assert.throws(
    () => new FileExecutionStore({ dataDirectory }),
    (error: unknown) => {
      assert.ok(error instanceof ExecutionStoreError);
      assert.equal(error.code, "PERSISTED_STATE_CORRUPT");
      return true;
    },
  );
  assert.throws(
    () => new FileGoalStore({ dataDirectory }),
    (error: unknown) => {
      assert.ok(error instanceof GoalStoreError);
      assert.equal(error.code, "PERSISTED_STATE_CORRUPT");
      return true;
    },
  );
});

test("file stores reject unsupported persistence versions", async (context) => {
  const dataDirectory = await withDataDirectory(context);
  const executions = new FileExecutionStore({ dataDirectory });
  const goals = new FileGoalStore({ dataDirectory });
  await writeFile(
    join(executions.directory, "future.json"),
    JSON.stringify({
      format: "panda.local-execution",
      storageVersion: 2,
      execution: makeExecution(),
      trace: [],
    }),
    "utf8",
  );
  await writeFile(
    join(goals.directory, "future.json"),
    JSON.stringify({
      format: "panda.local-goal",
      storageVersion: 2,
      goal: makeGoal(),
    }),
    "utf8",
  );

  assert.throws(
    () => new FileExecutionStore({ dataDirectory }),
    (error: unknown) => {
      assert.ok(error instanceof ExecutionStoreError);
      assert.equal(error.code, "PERSISTED_STATE_VERSION_UNSUPPORTED");
      return true;
    },
  );
  assert.throws(
    () => new FileGoalStore({ dataDirectory }),
    (error: unknown) => {
      assert.ok(error instanceof GoalStoreError);
      assert.equal(error.code, "PERSISTED_STATE_VERSION_UNSUPPORTED");
      return true;
    },
  );
});
