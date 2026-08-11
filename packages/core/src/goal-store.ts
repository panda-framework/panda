import { resolve } from "node:path";
import { PANDA_SCHEMA_VERSION, type Goal } from "@panda/shared";
import {
  PANDA_LOCAL_STATE_VERSION,
  describePersistenceError,
  isRecord,
  listPersistedRecordFiles,
  persistedRecordPath,
  readPersistedJson,
  stateDirectory,
  writePersistedJson,
} from "./file-persistence.js";

export type GoalStoreErrorCode =
  | "GOAL_ALREADY_EXISTS"
  | "GOAL_NOT_FOUND"
  | "GOAL_IDENTITY_MISMATCH"
  | "GOAL_DEFINITION_MISMATCH"
  | "GOAL_REVISION_INVALID"
  | "GOAL_CONFLICT"
  | "PERSISTED_STATE_CORRUPT"
  | "PERSISTED_STATE_VERSION_UNSUPPORTED"
  | "PERSISTENCE_READ_FAILED"
  | "PERSISTENCE_WRITE_FAILED";

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

interface PersistedGoalEnvelope {
  readonly format: "panda.local-goal";
  readonly storageVersion: typeof PANDA_LOCAL_STATE_VERSION;
  readonly goal: Goal;
}

export interface FileGoalStoreOptions {
  readonly dataDirectory?: string;
}

/** Single-process, file-backed owner for canonical Goal snapshots. */
export class FileGoalStore implements GoalStore {
  readonly directory: string;
  private memory: InMemoryGoalStore;

  constructor(options: FileGoalStoreOptions = {}) {
    this.directory = stateDirectory(
      resolve(options.dataDirectory ?? ".panda"),
      "goals",
    );
    this.memory = this.load();
  }

  createGoal(goal: Goal): Goal {
    const created = this.memory.createGoal(goal);
    this.persistOrRestore(created.goalId);
    return snapshot(created);
  }

  getGoal(id: string): Goal | undefined {
    return this.memory.getGoal(id);
  }

  listGoals(): Goal[] {
    return this.memory.listGoals();
  }

  updateGoal(goal: Goal, expectedRevision?: number): Goal {
    const updated = this.memory.updateGoal(goal, expectedRevision);
    this.persistOrRestore(updated.goalId);
    return snapshot(updated);
  }

  private persistOrRestore(goalId: string): void {
    try {
      this.persist(goalId);
    } catch (error) {
      try {
        this.memory = this.load();
      } catch {
        // The write error remains the actionable failure for this operation.
      }
      throw new GoalStoreError(
        "PERSISTENCE_WRITE_FAILED",
        `Could not persist Goal ${goalId}: ${describePersistenceError(error)}`,
      );
    }
  }

  private persist(goalId: string): void {
    const goal = this.memory.getGoal(goalId);
    if (goal === undefined) {
      throw new GoalStoreError(
        "GOAL_NOT_FOUND",
        `Goal ${goalId} does not exist.`,
      );
    }
    const envelope: PersistedGoalEnvelope = {
      format: "panda.local-goal",
      storageVersion: PANDA_LOCAL_STATE_VERSION,
      goal,
    };
    writePersistedJson(persistedRecordPath(this.directory, goalId), envelope);
  }

  private load(): InMemoryGoalStore {
    const memory = new InMemoryGoalStore();
    let files: string[];
    try {
      files = listPersistedRecordFiles(this.directory);
    } catch (error) {
      throw new GoalStoreError(
        "PERSISTENCE_READ_FAILED",
        `Could not inspect persisted Goals: ${describePersistenceError(error)}`,
      );
    }

    for (const file of files) {
      const goal = readGoalEnvelope(file);
      try {
        memory.createGoal(goal);
      } catch (error) {
        if (error instanceof GoalStoreError) {
          throw corruptState(file, error.message);
        }
        throw error;
      }
    }
    return memory;
  }
}

function readGoalEnvelope(path: string): Goal {
  let value: unknown;
  try {
    value = readPersistedJson(path);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw new GoalStoreError(
        "PERSISTENCE_READ_FAILED",
        `Could not read persisted Goal state at ${path}: ${describePersistenceError(error)}`,
      );
    }
    throw corruptState(path, describePersistenceError(error));
  }
  if (!isRecord(value) || value.format !== "panda.local-goal") {
    throw corruptState(path, "the Goal envelope format is invalid");
  }
  if (value.storageVersion !== PANDA_LOCAL_STATE_VERSION) {
    throw new GoalStoreError(
      "PERSISTED_STATE_VERSION_UNSUPPORTED",
      `Persisted Goal state at ${path} uses unsupported storage version ${String(value.storageVersion)}.`,
    );
  }
  if (!isGoal(value.goal)) {
    throw corruptState(path, "the canonical Goal snapshot is invalid");
  }
  return value.goal;
}

function isGoal(value: unknown): value is Goal {
  return (
    isRecord(value) &&
    value.kind === "goal" &&
    value.schemaVersion === PANDA_SCHEMA_VERSION &&
    typeof value.id === "string" &&
    typeof value.goalId === "string" &&
    typeof value.executionId === "string" &&
    typeof value.correlationId === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.objective === "string" &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    Array.isArray(value.constraints) &&
    Array.isArray(value.successCriteria) &&
    Array.isArray(value.failureCriteria) &&
    Array.isArray(value.dependencyGoalIds) &&
    [
      "pending",
      "active",
      "suspended",
      "awaiting-human",
      "achieved",
      "failed",
      "cancelled",
    ].includes(String(value.status))
  );
}

function corruptState(path: string, reason: string): GoalStoreError {
  return new GoalStoreError(
    "PERSISTED_STATE_CORRUPT",
    `Persisted Goal state at ${path} is corrupt: ${reason}.`,
  );
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
