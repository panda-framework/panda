import type { PandaExecution, TraceRecord } from "@panda/shared";

export type ExecutionStoreErrorCode =
  | "EXECUTION_ALREADY_EXISTS"
  | "EXECUTION_NOT_FOUND"
  | "EXECUTION_IDENTITY_MISMATCH"
  | "TRACE_ALREADY_EXISTS"
  | "TRACE_SEQUENCE_MANAGED"
  | "TRACE_CAUSATION_NOT_FOUND"
  | "TRACE_CROSS_EXECUTION_CAUSATION";

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

interface TraceLocation {
  readonly executionId: string;
}

/**
 * Process-local Phase 2 store. State is intentionally lost on restart; the
 * port allows a durable implementation to replace it in a later release.
 */
export class InMemoryExecutionStore implements ExecutionStore {
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

function snapshot<T>(value: T): T {
  return structuredClone(value);
}
