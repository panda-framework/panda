import { resolve } from "node:path";
import {
  PANDA_SCHEMA_VERSION,
  type PandaExecution,
  type TraceRecord,
} from "@panda/shared";
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

export type ExecutionStoreErrorCode =
  | "EXECUTION_ALREADY_EXISTS"
  | "EXECUTION_NOT_FOUND"
  | "EXECUTION_IDENTITY_MISMATCH"
  | "TRACE_ALREADY_EXISTS"
  | "TRACE_SEQUENCE_MANAGED"
  | "TRACE_CAUSATION_NOT_FOUND"
  | "TRACE_CROSS_EXECUTION_CAUSATION"
  | "PERSISTED_STATE_CORRUPT"
  | "PERSISTED_STATE_VERSION_UNSUPPORTED"
  | "PERSISTENCE_READ_FAILED"
  | "PERSISTENCE_WRITE_FAILED";

export class ExecutionStoreError extends Error {
  constructor(
    readonly code: ExecutionStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionStoreError";
  }
}

export type StoredTraceRecord<TPayload = unknown> = TraceRecord<TPayload> & {
  readonly sequence: number;
};

export type TraceRecordListener = (record: StoredTraceRecord) => void;

/**
 * Execution-scoped persistence boundary for canonical runtime state and trace
 * history. Implementations own trace sequence assignment and must not expose
 * mutable references to retained values.
 */
export interface ExecutionStore {
  createExecution(execution: PandaExecution): PandaExecution;
  getExecution(id: string): PandaExecution | undefined;
  listExecutions(): PandaExecution[];
  updateExecution(execution: PandaExecution): PandaExecution;
  appendTrace<TPayload>(
    record: TraceRecord<TPayload>,
  ): StoredTraceRecord<TPayload>;
  getTrace(executionId: string): StoredTraceRecord[];
}

export interface SubscribableExecutionStore extends ExecutionStore {
  subscribe(listener: TraceRecordListener): () => void;
}

interface TraceLocation {
  readonly executionId: string;
}

/**
 * Process-local Phase 2 store. State is intentionally lost on restart; the
 * port allows a durable implementation to replace it in a later release.
 */
export class InMemoryExecutionStore implements SubscribableExecutionStore {
  private readonly executions = new Map<string, PandaExecution>();
  private readonly traces = new Map<string, StoredTraceRecord[]>();
  private readonly traceLocations = new Map<string, TraceLocation>();
  private readonly traceListeners = new Set<TraceRecordListener>();

  subscribe(listener: TraceRecordListener): () => void {
    this.traceListeners.add(listener);
    return () => this.traceListeners.delete(listener);
  }

  createExecution(execution: PandaExecution): PandaExecution {
    if (this.executions.has(execution.executionId)) {
      throw new ExecutionStoreError(
        "EXECUTION_ALREADY_EXISTS",
        `Execution ${execution.executionId} already exists.`,
      );
    }

    const retained = snapshot(execution);
    this.executions.set(retained.executionId, retained);
    this.traces.set(retained.executionId, []);
    return snapshot(retained);
  }

  getExecution(id: string): PandaExecution | undefined {
    const execution = this.executions.get(id);
    return execution === undefined ? undefined : snapshot(execution);
  }

  listExecutions(): PandaExecution[] {
    return [...this.executions.values()].map(snapshot);
  }

  updateExecution(execution: PandaExecution): PandaExecution {
    const current = this.requireExecution(execution.executionId);

    if (execution.id !== current.id) {
      throw new ExecutionStoreError(
        "EXECUTION_IDENTITY_MISMATCH",
        `Execution ${execution.executionId} cannot change its record identity.`,
      );
    }

    const retained = snapshot(execution);
    this.executions.set(retained.executionId, retained);
    return snapshot(retained);
  }

  appendTrace<TPayload>(
    record: TraceRecord<TPayload>,
  ): StoredTraceRecord<TPayload> {
    this.requireExecution(record.executionId);

    if (record.sequence !== undefined) {
      throw new ExecutionStoreError(
        "TRACE_SEQUENCE_MANAGED",
        "Trace sequence numbers are assigned by the execution store.",
      );
    }

    if (this.traceLocations.has(record.id)) {
      throw new ExecutionStoreError(
        "TRACE_ALREADY_EXISTS",
        `Trace record ${record.id} already exists.`,
      );
    }

    this.validateCausation(record);

    const trace = this.traces.get(record.executionId);
    if (trace === undefined) {
      throw new ExecutionStoreError(
        "EXECUTION_NOT_FOUND",
        `Execution ${record.executionId} does not exist.`,
      );
    }

    const retained = snapshot({
      ...record,
      sequence: trace.length + 1,
    }) as StoredTraceRecord<TPayload>;

    trace.push(retained);
    this.traceLocations.set(retained.id, {
      executionId: retained.executionId,
    });

    for (const listener of this.traceListeners) {
      try {
        listener(snapshot(retained));
      } catch {
        // Observers cannot roll back an already committed trace record.
      }
    }

    return snapshot(retained);
  }

  getTrace(executionId: string): StoredTraceRecord[] {
    this.requireExecution(executionId);
    const trace = this.traces.get(executionId);
    if (trace === undefined) {
      throw new ExecutionStoreError(
        "EXECUTION_NOT_FOUND",
        `Execution ${executionId} does not exist.`,
      );
    }

    return trace.map(snapshot);
  }

  private requireExecution(executionId: string): PandaExecution {
    const execution = this.executions.get(executionId);
    if (execution === undefined) {
      throw new ExecutionStoreError(
        "EXECUTION_NOT_FOUND",
        `Execution ${executionId} does not exist.`,
      );
    }

    return execution;
  }

  private validateCausation(record: TraceRecord): void {
    if (record.causationId === undefined) {
      return;
    }

    const cause = this.traceLocations.get(record.causationId);
    if (cause === undefined) {
      throw new ExecutionStoreError(
        "TRACE_CAUSATION_NOT_FOUND",
        `Causal trace record ${record.causationId} does not exist.`,
      );
    }

    if (cause.executionId !== record.executionId) {
      throw new ExecutionStoreError(
        "TRACE_CROSS_EXECUTION_CAUSATION",
        `Trace record ${record.id} cannot reference a cause from execution ${cause.executionId}.`,
      );
    }
  }
}

interface PersistedExecutionEnvelope {
  readonly format: "panda.local-execution";
  readonly storageVersion: typeof PANDA_LOCAL_STATE_VERSION;
  readonly execution: PandaExecution;
  readonly trace: readonly StoredTraceRecord[];
}

export interface FileExecutionStoreOptions {
  readonly dataDirectory?: string;
}

/**
 * Single-process, file-backed execution and trace store. Each execution and its
 * complete trace share one atomically replaced snapshot so sequence and causal
 * history cannot be committed independently of one another on disk.
 */
export class FileExecutionStore implements SubscribableExecutionStore {
  readonly directory: string;
  private memory: InMemoryExecutionStore;
  private readonly traceListeners = new Set<TraceRecordListener>();

  constructor(options: FileExecutionStoreOptions = {}) {
    this.directory = stateDirectory(
      resolve(options.dataDirectory ?? ".panda"),
      "executions",
    );
    this.memory = this.load();
  }

  subscribe(listener: TraceRecordListener): () => void {
    this.traceListeners.add(listener);
    return () => this.traceListeners.delete(listener);
  }

  createExecution(execution: PandaExecution): PandaExecution {
    const created = this.memory.createExecution(execution);
    this.persistOrRestore(created.executionId);
    return snapshot(created);
  }

  getExecution(id: string): PandaExecution | undefined {
    return this.memory.getExecution(id);
  }

  listExecutions(): PandaExecution[] {
    return this.memory.listExecutions();
  }

  updateExecution(execution: PandaExecution): PandaExecution {
    const updated = this.memory.updateExecution(execution);
    this.persistOrRestore(updated.executionId);
    return snapshot(updated);
  }

  appendTrace<TPayload>(
    record: TraceRecord<TPayload>,
  ): StoredTraceRecord<TPayload> {
    const appended = this.memory.appendTrace(record);
    this.persistOrRestore(appended.executionId);

    for (const listener of this.traceListeners) {
      try {
        listener(snapshot(appended));
      } catch {
        // Observers cannot roll back an already durable trace record.
      }
    }

    return snapshot(appended);
  }

  getTrace(executionId: string): StoredTraceRecord[] {
    return this.memory.getTrace(executionId);
  }

  private persistOrRestore(executionId: string): void {
    try {
      this.persist(executionId);
    } catch (error) {
      try {
        this.memory = this.load();
      } catch {
        // The write error remains the actionable failure for this operation.
      }
      throw new ExecutionStoreError(
        "PERSISTENCE_WRITE_FAILED",
        `Could not persist execution ${executionId}: ${describePersistenceError(error)}`,
      );
    }
  }

  private persist(executionId: string): void {
    const execution = this.memory.getExecution(executionId);
    if (execution === undefined) {
      throw new ExecutionStoreError(
        "EXECUTION_NOT_FOUND",
        `Execution ${executionId} does not exist.`,
      );
    }
    const envelope: PersistedExecutionEnvelope = {
      format: "panda.local-execution",
      storageVersion: PANDA_LOCAL_STATE_VERSION,
      execution,
      trace: this.memory.getTrace(executionId),
    };
    writePersistedJson(
      persistedRecordPath(this.directory, executionId),
      envelope,
    );
  }

  private load(): InMemoryExecutionStore {
    const memory = new InMemoryExecutionStore();
    let files: string[];
    try {
      files = listPersistedRecordFiles(this.directory);
    } catch (error) {
      throw new ExecutionStoreError(
        "PERSISTENCE_READ_FAILED",
        `Could not inspect persisted executions: ${describePersistenceError(error)}`,
      );
    }

    for (const file of files) {
      const envelope = readExecutionEnvelope(file);
      try {
        memory.createExecution(envelope.execution);
        for (const persisted of envelope.trace) {
          const { sequence, ...record } = persisted;
          const appended = memory.appendTrace(record);
          if (appended.sequence !== sequence) {
            throw corruptState(
              file,
              `trace ${persisted.id} has non-consecutive sequence ${sequence}`,
            );
          }
        }
      } catch (error) {
        if (error instanceof ExecutionStoreError) {
          throw corruptState(file, error.message);
        }
        throw error;
      }
    }
    return memory;
  }
}

function readExecutionEnvelope(path: string): PersistedExecutionEnvelope {
  let value: unknown;
  try {
    value = readPersistedJson(path);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw new ExecutionStoreError(
        "PERSISTENCE_READ_FAILED",
        `Could not read persisted execution state at ${path}: ${describePersistenceError(error)}`,
      );
    }
    throw corruptState(path, describePersistenceError(error));
  }

  if (!isRecord(value) || value.format !== "panda.local-execution") {
    throw corruptState(path, "the execution envelope format is invalid");
  }
  if (value.storageVersion !== PANDA_LOCAL_STATE_VERSION) {
    throw new ExecutionStoreError(
      "PERSISTED_STATE_VERSION_UNSUPPORTED",
      `Persisted execution state at ${path} uses unsupported storage version ${String(value.storageVersion)}.`,
    );
  }
  if (!isPandaExecution(value.execution)) {
    throw corruptState(path, "the canonical Execution snapshot is invalid");
  }
  const execution = value.execution;
  if (!Array.isArray(value.trace)) {
    throw corruptState(path, "the trace snapshot is not an array");
  }

  const trace = value.trace.map((record, index) => {
    if (!isStoredTraceRecord(record)) {
      throw corruptState(path, `trace entry ${index + 1} is invalid`);
    }
    if (
      record.executionId !== execution.executionId ||
      record.goalId !== execution.goalId ||
      record.correlationId !== execution.correlationId
    ) {
      throw corruptState(
        path,
        `trace ${record.id} does not match its Execution identity`,
      );
    }
    if (record.sequence !== index + 1) {
      throw corruptState(
        path,
        `trace ${record.id} has non-consecutive sequence ${record.sequence}`,
      );
    }
    return record;
  });

  return {
    format: "panda.local-execution",
    storageVersion: PANDA_LOCAL_STATE_VERSION,
    execution,
    trace,
  };
}

function isPandaExecution(value: unknown): value is PandaExecution {
  return (
    isRecord(value) &&
    value.kind === "execution" &&
    value.schemaVersion === PANDA_SCHEMA_VERSION &&
    typeof value.id === "string" &&
    typeof value.executionId === "string" &&
    typeof value.goalId === "string" &&
    typeof value.correlationId === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.goalIds) &&
    [
      "pending",
      "running",
      "waiting",
      "succeeded",
      "failed",
      "cancelled",
    ].includes(String(value.status))
  );
}

function isStoredTraceRecord(value: unknown): value is StoredTraceRecord {
  return (
    isRecord(value) &&
    value.kind === "trace-record" &&
    value.schemaVersion === PANDA_SCHEMA_VERSION &&
    typeof value.id === "string" &&
    typeof value.executionId === "string" &&
    typeof value.goalId === "string" &&
    typeof value.correlationId === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.category === "string" &&
    typeof value.type === "string" &&
    Number.isSafeInteger(value.sequence) &&
    Number(value.sequence) > 0
  );
}

function corruptState(path: string, reason: string): ExecutionStoreError {
  return new ExecutionStoreError(
    "PERSISTED_STATE_CORRUPT",
    `Persisted execution state at ${path} is corrupt: ${reason}.`,
  );
}

function snapshot<T>(value: T): T {
  return structuredClone(value);
}
