import type { Goal } from "@panda/shared";

export type GoalStoreErrorCode =
  | "GOAL_ALREADY_EXISTS"
  | "GOAL_NOT_FOUND"
  | "GOAL_IDENTITY_MISMATCH"
  | "GOAL_DEFINITION_MISMATCH"
  | "GOAL_REVISION_INVALID"
  | "GOAL_CONFLICT";

export class GoalStoreError extends Error {
  constructor(
    readonly code: GoalStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoalStoreError";
  }
}

export interface GoalStore {
  createGoal(goal: Goal): Goal;
  getGoal(id: string): Goal | undefined;
  listGoals(): Goal[];
  updateGoal(goal: Goal, expectedRevision?: number): Goal;
}

/** Process-local Goal ownership for the embedded v0.1 runtime profile. */
export class InMemoryGoalStore implements GoalStore {
  private readonly goals = new Map<string, Goal>();

  createGoal(goal: Goal): Goal {
    if (this.goals.has(goal.goalId)) {
      throw new GoalStoreError(
        "GOAL_ALREADY_EXISTS",
        `Goal ${goal.goalId} already exists.`,
      );
    }
    if (!Number.isSafeInteger(goal.revision) || goal.revision < 0) {
      throw new GoalStoreError(
        "GOAL_REVISION_INVALID",
        "A new Goal revision must be a non-negative safe integer.",
      );
    }
    const retained = snapshot(goal);
    this.goals.set(retained.goalId, retained);
    return snapshot(retained);
  }

  getGoal(id: string): Goal | undefined {
    const goal = this.goals.get(id);
    return goal === undefined ? undefined : snapshot(goal);
  }

  listGoals(): Goal[] {
    return [...this.goals.values()].map(snapshot);
  }

  updateGoal(goal: Goal, expectedRevision?: number): Goal {
    const current = this.goals.get(goal.goalId);
    if (current === undefined) {
      throw new GoalStoreError(
        "GOAL_NOT_FOUND",
        `Goal ${goal.goalId} does not exist.`,
      );
    }
    if (goal.id !== current.id || goal.goalId !== current.goalId) {
      throw new GoalStoreError(
        "GOAL_IDENTITY_MISMATCH",
        `Goal ${current.goalId} cannot change its record identity.`,
      );
    }
    if (
      expectedRevision !== undefined &&
      current.revision !== expectedRevision
    ) {
      throw new GoalStoreError(
        "GOAL_CONFLICT",
        `Goal ${current.goalId} changed after the caller read it.`,
      );
    }
    if (goal.revision !== current.revision + 1) {
      throw new GoalStoreError(
        "GOAL_REVISION_INVALID",
        `Goal ${current.goalId} must advance exactly one revision.`,
      );
    }
    if (!sameGoalDefinition(current, goal)) {
      throw new GoalStoreError(
        "GOAL_DEFINITION_MISMATCH",
        `Goal ${current.goalId} cannot change its definition through a status update.`,
      );
    }
    const retained = snapshot(goal);
    this.goals.set(retained.goalId, retained);
    return snapshot(retained);
  }
}

export function sameGoalDefinition(first: Goal, second: Goal): boolean {
  return (
    first.executionId === second.executionId &&
    first.goalId === second.goalId &&
    first.correlationId === second.correlationId &&
    first.objective === second.objective &&
    first.priority === second.priority &&
    JSON.stringify(first.constraints) === JSON.stringify(second.constraints) &&
    JSON.stringify(first.successCriteria) ===
      JSON.stringify(second.successCriteria) &&
    JSON.stringify(first.failureCriteria) ===
      JSON.stringify(second.failureCriteria) &&
    JSON.stringify(first.owner) === JSON.stringify(second.owner) &&
    first.parentGoalId === second.parentGoalId &&
    JSON.stringify(first.dependencyGoalIds) ===
      JSON.stringify(second.dependencyGoalIds) &&
    first.deadline === second.deadline
  );
}

function snapshot<T>(value: T): T {
  return structuredClone(value);
}
