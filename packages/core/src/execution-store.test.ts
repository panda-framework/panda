import assert from "node:assert/strict";
import test from "node:test";
import {
  createPandaExecution,
  createTraceRecord,
  type PandaCapability,
  type PandaExecution,
  type TraceCategory,
  type TraceRecord,
} from "@panda/shared";
import {
  ExecutionStoreError,
  InMemoryExecutionStore,
} from "./execution-store.js";

const correlationId = "corr_phase_2";
const producer = { kind: "runtime", component: "phase-2-test" } as const;

function makeExecution(
  executionId: string,
  activeCapability: PandaCapability = "perception",
): PandaExecution {
  return createPandaExecution({
    id: executionId,
    executionId,
    goalId: `goal_${executionId}`,
    correlationId,
    producer,
    status: "running",
    activeCapability,
    goalIds: [`goal_${executionId}`],
    startedAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  });
}

function makeTrace(
  execution: PandaExecution,
  id: string,
  category: TraceCategory,
  causationId?: string,
): TraceRecord<{ label: string }> {
  return createTraceRecord({
    id,
    executionId: execution.executionId,
    goalId: execution.goalId,
    correlationId: execution.correlationId,
    causationId,
    producer,
    category,
    type: `test.${category}`,
    payload: { label: id },
  });
}

function assertStoreError(
  error: unknown,
  code: ExecutionStoreError["code"],
): boolean {
  assert.ok(error instanceof ExecutionStoreError);
  assert.equal(error.code, code);
  return true;
}

test("creates, retrieves, lists, and updates independent executions", () => {
  const store = new InMemoryExecutionStore();
  const first = makeExecution("exe_first");
  const second = makeExecution("exe_second", "analysis");

  store.createExecution(first);
  store.createExecution(second);
  (second.goalIds as string[]).push("goal_mutated_after_create");
  store.updateExecution({
    ...first,
    activeCapability: "decision",
    updatedAt: "2026-08-10T00:00:01.000Z",
  });

  assert.equal(store.getExecution(first.executionId)?.activeCapability, "decision");
  assert.equal(store.getExecution(second.executionId)?.activeCapability, "analysis");
  assert.deepEqual(store.getExecution(second.executionId)?.goalIds, [
    `goal_${second.executionId}`,
  ]);
  assert.deepEqual(
    store.listExecutions().map((execution) => execution.executionId),
    [first.executionId, second.executionId],
  );
  assert.throws(
    () => store.createExecution(first),
    (error) => assertStoreError(error, "EXECUTION_ALREADY_EXISTS"),
  );
  assert.throws(
    () => store.updateExecution({ ...first, id: "exe_replacement" }),
    (error) => assertStoreError(error, "EXECUTION_IDENTITY_MISMATCH"),
  );
});

test("reports missing executions without conflating them with empty traces", () => {
  const store = new InMemoryExecutionStore();
  const missing = makeExecution("exe_missing");

  assert.equal(store.getExecution(missing.executionId), undefined);
  assert.throws(
    () => store.updateExecution(missing),
    (error) => assertStoreError(error, "EXECUTION_NOT_FOUND"),
  );
  assert.throws(
    () => store.getTrace(missing.executionId),
    (error) => assertStoreError(error, "EXECUTION_NOT_FOUND"),
  );
  assert.throws(
    () => store.appendTrace(makeTrace(missing, "trace_missing", "signal")),
    (error) => assertStoreError(error, "EXECUTION_NOT_FOUND"),
  );
});

test("assigns monotonic per-execution sequence numbers for interleaved traces", () => {
  const store = new InMemoryExecutionStore();
  const first = makeExecution("exe_first");
  const second = makeExecution("exe_second");
  store.createExecution(first);
  store.createExecution(second);

  const firstRoot = store.appendTrace(
    makeTrace(first, "trace_first_root", "signal"),
  );
  const secondRoot = store.appendTrace(
    makeTrace(second, "trace_second_root", "observation"),
  );
  const firstLatest = store.appendTrace(
    makeTrace(first, "trace_first_latest", "assessment", firstRoot.id),
  );
  const secondLatest = store.appendTrace(
    makeTrace(second, "trace_second_latest", "decision", secondRoot.id),
  );

  assert.equal(firstRoot.sequence, 1);
  assert.equal(firstLatest.sequence, 2);
  assert.equal(secondRoot.sequence, 1);
  assert.equal(secondLatest.sequence, 2);
  assert.deepEqual(
    store.getTrace(first.executionId).map((record) => record.sequence),
    [1, 2],
  );
  assert.deepEqual(
    store.getTrace(second.executionId).map((record) => record.sequence),
    [1, 2],
  );
});

test("retains a traversable same-execution causal chain", () => {
  const store = new InMemoryExecutionStore();
  const execution = makeExecution("exe_chain");
  store.createExecution(execution);

  const signal = store.appendTrace(
    makeTrace(execution, "trace_signal", "signal"),
  );
  const observation = store.appendTrace(
    makeTrace(execution, "trace_observation", "observation", signal.id),
  );
  const assessment = store.appendTrace(
    makeTrace(
      execution,
      "trace_assessment",
      "assessment",
      observation.id,
    ),
  );
  const decision = store.appendTrace(
    makeTrace(execution, "trace_decision", "decision", assessment.id),
  );

  const records = new Map(
    store.getTrace(execution.executionId).map((record) => [record.id, record]),
  );
  const traversed: string[] = [];
  let current: TraceRecord | undefined = records.get(decision.id);

  while (current !== undefined) {
    traversed.push(current.id);
    current = current.causationId
      ? records.get(current.causationId)
      : undefined;
  }

  assert.deepEqual(traversed, [
    decision.id,
    assessment.id,
    observation.id,
    signal.id,
  ]);
});

test("rejects missing and cross-execution causal links", () => {
  const store = new InMemoryExecutionStore();
  const first = makeExecution("exe_first");
  const second = makeExecution("exe_second");
  store.createExecution(first);
  store.createExecution(second);
  const firstRoot = store.appendTrace(
    makeTrace(first, "trace_first_root", "signal"),
  );

  assert.throws(
    () =>
      store.appendTrace(
        makeTrace(second, "trace_unknown_cause", "assessment", "trace_unknown"),
      ),
    (error) => assertStoreError(error, "TRACE_CAUSATION_NOT_FOUND"),
  );
  assert.throws(
    () =>
      store.appendTrace(
        makeTrace(second, "trace_cross_execution", "decision", firstRoot.id),
      ),
    (error) =>
      assertStoreError(error, "TRACE_CROSS_EXECUTION_CAUSATION"),
  );
  assert.deepEqual(store.getTrace(second.executionId), []);
});

test("keeps trace history append-only and store-assigned", () => {
  const store = new InMemoryExecutionStore();
  const execution = makeExecution("exe_append_only");
  store.createExecution(execution);
  const input = makeTrace(execution, "trace_root", "signal");
  store.appendTrace(input);

  input.payload.label = "changed after append";
  const returned = store.getTrace(execution.executionId);
  (returned[0].payload as { label: string }).label = "changed after read";

  assert.deepEqual(store.getTrace(execution.executionId)[0].payload, {
    label: "trace_root",
  });
  assert.throws(
    () => store.appendTrace(input),
    (error) => assertStoreError(error, "TRACE_ALREADY_EXISTS"),
  );

  const presequenced = {
    ...makeTrace(execution, "trace_presequenced", "observation", input.id),
    sequence: 99,
  };
  assert.throws(
    () => store.appendTrace(presequenced),
    (error) => assertStoreError(error, "TRACE_SEQUENCE_MANAGED"),
  );
});
