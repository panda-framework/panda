import assert from "node:assert/strict";
import test from "node:test";
import { createGoal, type Goal } from "@panda/shared";
import {
  GoalStoreError,
  InMemoryGoalStore,
} from "./goal-store.js";

const fixedTime = "2026-08-10T16:00:00.000Z";
const producer = { kind: "runtime", component: "phase-7-test" } as const;

function makeGoal(goalId = "goal_phase_7"): Goal {
  return createGoal({
    id: goalId,
    goalId,
    executionId: "exe_phase_7",
    correlationId: "corr_phase_7",
    producer,
    timestamp: fixedTime,
    objective: "Create and independently verify proof.txt.",
    priority: 1,
    constraints: ["execution-workspace-only"],
    successCriteria: [
      {
        id: "criterion_path",
        description: "Observed relative path matches.",
        evidenceType: "filesystem.relative-path",
        expected: "proof.txt",
      },
    ],
    failureCriteria: [],
    status: "active",
    owner: { id: "panda", type: "system" },
    dependencyGoalIds: [],
  });
}

function isStoreError(
  error: unknown,
  code: GoalStoreError["code"],
): boolean {
  assert.ok(error instanceof GoalStoreError);
  assert.equal(error.code, code);
  return true;
}

test("creates, snapshots, lists, and updates goal status", () => {
  const store = new InMemoryGoalStore();
  const goal = makeGoal();
  const created = store.createGoal(goal);
  (goal.constraints as string[]).push("mutated-after-create");

  assert.deepEqual(store.listGoals(), [created]);
  assert.deepEqual(store.getGoal(goal.goalId)?.constraints, [
    "execution-workspace-only",
  ]);
  const achieved = store.updateGoal({
    ...created,
    revision: created.revision + 1,
    causationId: "asm_verified",
    producer: { kind: "capability", capability: "analysis" },
    timestamp: "2026-08-10T16:00:01.000Z",
    status: "achieved",
    statusReason: "All explicit criteria matched observed evidence.",
  });
  assert.equal(achieved.status, "achieved");
  assert.equal(store.getGoal(goal.goalId)?.causationId, "asm_verified");

  (
    achieved.successCriteria as unknown as Array<{ expected?: unknown }>
  )[0].expected = "changed-after-read";
  assert.equal(
    store.getGoal(goal.goalId)?.successCriteria[0].expected,
    "proof.txt",
  );
});

test("rejects duplicate, missing, identity, and definition changes", () => {
  const store = new InMemoryGoalStore();
  const goal = store.createGoal(makeGoal());
  assert.throws(
    () => store.createGoal(goal),
    (error) => isStoreError(error, "GOAL_ALREADY_EXISTS"),
  );
  assert.throws(
    () => store.updateGoal(makeGoal("goal_missing")),
    (error) => isStoreError(error, "GOAL_NOT_FOUND"),
  );
  assert.throws(
    () => store.updateGoal({ ...goal, id: "goal_replacement" }),
    (error) => isStoreError(error, "GOAL_IDENTITY_MISMATCH"),
  );
  assert.throws(
    () =>
      store.updateGoal({
        ...goal,
        revision: goal.revision + 1,
        objective: "Changed objective",
      }),
    (error) => isStoreError(error, "GOAL_DEFINITION_MISMATCH"),
  );
  assert.throws(
    () =>
      store.updateGoal(
        {
          ...goal,
          revision: goal.revision + 1,
          status: "failed",
          timestamp: "2026-08-10T16:00:02.000Z",
        },
        goal.revision - 1,
      ),
    (error) => isStoreError(error, "GOAL_CONFLICT"),
  );
  assert.throws(
    () =>
      store.updateGoal({
        ...goal,
        revision: goal.revision + 2,
        status: "failed",
      }),
    (error) => isStoreError(error, "GOAL_REVISION_INVALID"),
  );
});
