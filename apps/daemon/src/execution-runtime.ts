import { createHash } from "node:crypto";
import {
  ExecutionCoordinator,
  FileExecutionStore,
  FileGoalStore,
  FilesystemActionConnector,
  FilesystemEffectObserver,
  InMemoryActionConnectorRegistry,
  InMemoryCapabilityRegistry,
  InMemoryExecutionStore,
  InMemoryGoalStore,
  V01PolicyEngine,
  registerDeterministicPandaCapabilities,
  type ActionConnector,
  type EffectObserver,
  type PolicyEngine,
  type StoredTraceRecord,
  type SubscribableExecutionStore,
  type TraceRecordListener,
  type GoalStore,
} from "@panda/core";
import {
  PANDA_V01_EXECUTION_REQUEST_TYPE,
  createFailure,
  createGoal,
  createId,
  createPandaExecution,
  createSignal,
  createTraceRecord,
  nowIso,
  type Assessment,
  type EffectStatus,
  type Goal,
  type Outcome,
  type PandaExecution,
  type PandaExecutionCreateInput,
  type PandaExecutionView,
  type PrincipalReference,
} from "@panda/shared";

export type PandaPersistenceMode = "file" | "memory";

const DEFAULT_RUNTIME_PRINCIPAL = Object.freeze({
  id: "panda-daemon",
  type: "system",
} as const satisfies PrincipalReference);

export type PandaDaemonRuntimeErrorCode =
  | "PERSISTENCE_MODE_INVALID"
  | "PERSISTED_RUNTIME_STATE_INCOMPLETE";

export class PandaDaemonRuntimeError extends Error {
  constructor(
    readonly code: PandaDaemonRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PandaDaemonRuntimeError";
  }
}

export interface PandaDaemonRuntimeOptions {
  readonly dataDirectory?: string;
  readonly persistence?: PandaPersistenceMode;
  readonly now?: () => string;
  readonly executionPolicyEngine?: PolicyEngine;
  readonly actionConnector?: ActionConnector;
  readonly effectObserver?: EffectObserver;
  readonly maxInvocations?: number;
}

export class PandaDaemonRuntime {
  readonly executionStore: SubscribableExecutionStore;
  readonly goalStore: GoalStore;
  readonly persistence: PandaPersistenceMode;
  readonly capabilityRegistry = new InMemoryCapabilityRegistry();
  readonly actionConnectorRegistry = new InMemoryActionConnectorRegistry();
  readonly policyEngine: V01PolicyEngine;
  readonly effectObserver: EffectObserver;
  readonly coordinator: ExecutionCoordinator;
  private readonly now: () => string;

  constructor(options: PandaDaemonRuntimeOptions = {}) {
    this.now = options.now ?? nowIso;
    this.persistence = validatePersistenceMode(options.persistence ?? "file");
    this.executionStore =
      this.persistence === "file"
        ? new FileExecutionStore({ dataDirectory: options.dataDirectory })
        : new InMemoryExecutionStore();
    this.goalStore =
      this.persistence === "file"
        ? new FileGoalStore({ dataDirectory: options.dataDirectory })
        : new InMemoryGoalStore();
    this.validatePersistedRuntimeState();
    this.recoverInterruptedExecutions();
    this.policyEngine = new V01PolicyEngine({
      dataDirectory: options.dataDirectory,
    });
    const executionPolicyEngine =
      options.executionPolicyEngine ?? this.policyEngine;
    this.effectObserver =
      options.effectObserver ??
      new FilesystemEffectObserver({
        policyEngine: this.policyEngine,
        now: this.now,
      });
    this.actionConnectorRegistry.register(
      options.actionConnector ??
        new FilesystemActionConnector({
          policyEngine: this.policyEngine,
          now: this.now,
        }),
    );
    registerDeterministicPandaCapabilities(this.capabilityRegistry, {
      now: this.now,
      policyEngine: executionPolicyEngine,
      actionConnectorRegistry: this.actionConnectorRegistry,
      effectObserver: this.effectObserver,
    });
    this.coordinator = new ExecutionCoordinator(
      this.executionStore,
      this.capabilityRegistry,
      {
        component: "panda-daemon",
        now: this.now,
        policyEngine: executionPolicyEngine,
        goalStore: this.goalStore,
        maxInvocations: options.maxInvocations,
      },
    );
  }

  subscribe(listener: TraceRecordListener): () => void {
    return this.executionStore.subscribe(listener);
  }

  async createExecution(
    input: PandaExecutionCreateInput,
    principal: PrincipalReference = DEFAULT_RUNTIME_PRINCIPAL,
  ): Promise<PandaExecutionView> {
    const timestamp = this.now();
    const executionId = createId("exe");
    const goalId = createId("goal");
    const correlationId = createId("corr");
    const producer = { kind: "runtime", component: "panda-daemon" } as const;
    const signal = createSignal({
      executionId,
      goalId,
      correlationId,
      producer,
      timestamp,
      type: input.type ?? PANDA_V01_EXECUTION_REQUEST_TYPE,
      source: input.source ?? "daemon-api",
      receivedAt: timestamp,
      provenance: {
        kind: "external",
        sourceId: input.source ?? "daemon-api",
        details: {
          principalId: principal.id,
          principalType: principal.type,
        },
      },
      payload: input.payload,
    });
    const execution = createPandaExecution({
      id: executionId,
      executionId,
      goalId,
      correlationId,
      producer,
      timestamp,
      status: "pending",
      activeCapability: "perception",
      goalIds: [goalId],
      updatedAt: timestamp,
    });
    const goal = createExecutionGoal(
      executionId,
      goalId,
      correlationId,
      signal.id,
      input,
      timestamp,
      principal,
    );

    this.executionStore.createExecution(execution);
    this.goalStore.createGoal(goal);
    const signalTrace = this.executionStore.appendTrace(
      createTraceRecord({
        executionId,
        goalId,
        correlationId,
        producer,
        timestamp,
        category: "signal",
        type: "signal.accepted",
        payload: signal,
      }),
    );
    const goalTrace = this.executionStore.appendTrace(
      createTraceRecord({
        executionId,
        goalId,
        correlationId,
        causationId: signalTrace.id,
        producer: goal.producer,
        timestamp,
        category: "goal",
        type: "goal.created",
        payload: goal,
      }),
    );

    await this.coordinator.run({
      executionId,
      input: signal,
      causationId: goalTrace.id,
      principal,
    });
    return this.requireExecutionView(executionId);
  }

  listExecutionViews(): PandaExecutionView[] {
    return this.executionStore
      .listExecutions()
      .map((execution) => this.requireExecutionView(execution.executionId));
  }

  getExecutionView(executionId: string): PandaExecutionView | undefined {
    return this.executionStore.getExecution(executionId) === undefined
      ? undefined
      : this.requireExecutionView(executionId);
  }

  getTrace(executionId: string): StoredTraceRecord[] | undefined {
    return this.executionStore.getExecution(executionId) === undefined
      ? undefined
      : this.executionStore.getTrace(executionId);
  }

  private validatePersistedRuntimeState(): void {
    const executions = this.executionStore.listExecutions();
    const goals = this.goalStore.listGoals();
    const executionsById = new Map(
      executions.map((execution) => [execution.executionId, execution]),
    );

    for (const execution of executions) {
      const goal = this.goalStore.getGoal(execution.goalId);
      if (
        goal === undefined ||
        goal.executionId !== execution.executionId ||
        goal.correlationId !== execution.correlationId ||
        !execution.goalIds.includes(goal.goalId)
      ) {
        throw new PandaDaemonRuntimeError(
          "PERSISTED_RUNTIME_STATE_INCOMPLETE",
          `Persisted Execution ${execution.executionId} does not have one matching canonical Goal.`,
        );
      }
    }

    for (const goal of goals) {
      const execution = executionsById.get(goal.executionId);
      if (
        execution === undefined ||
        execution.goalId !== goal.goalId ||
        execution.correlationId !== goal.correlationId
      ) {
        throw new PandaDaemonRuntimeError(
          "PERSISTED_RUNTIME_STATE_INCOMPLETE",
          `Persisted Goal ${goal.goalId} does not have one matching canonical Execution.`,
        );
      }
    }
  }

  private recoverInterruptedExecutions(): void {
    for (const execution of this.executionStore.listExecutions()) {
      if (execution.status !== "pending" && execution.status !== "running") {
        continue;
      }
      this.recoverInterruptedExecution(execution.executionId);
    }
  }

  private recoverInterruptedExecution(executionId: string): void {
    const reason =
      "The daemon restarted while this execution was active. PANDA terminated it without replaying an Action.";
    let execution = this.executionStore.getExecution(executionId);
    if (execution === undefined) {
      throw new PandaDaemonRuntimeError(
        "PERSISTED_RUNTIME_STATE_INCOMPLETE",
        `Persisted Execution ${executionId} disappeared during restart recovery.`,
      );
    }
    let goal = this.goalStore.getGoal(execution.goalId);
    if (goal === undefined) {
      throw new PandaDaemonRuntimeError(
        "PERSISTED_RUNTIME_STATE_INCOMPLETE",
        `Persisted Goal ${execution.goalId} disappeared during restart recovery.`,
      );
    }
    let trace = this.executionStore.getTrace(executionId);
    const existingFailure = [...trace]
      .reverse()
      .find(
        (record) =>
          record.type === "failure.process_restart_interrupted" &&
          isRecord(record.payload) &&
          record.payload.code === "PROCESS_RESTART_INTERRUPTED",
      );
    if (
      ["failed", "cancelled", "achieved"].includes(goal.status) &&
      (existingFailure === undefined || goal.status !== "failed")
    ) {
      this.finalizeTerminalGoalExecution(execution, goal);
      return;
    }
    let recoveryCausationId = existingFailure?.id;

    if (existingFailure === undefined) {
      const failure = createFailure({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId: trace.at(-1)?.id,
        producer: { kind: "runtime", component: "panda-daemon" },
        timestamp: this.now(),
        category: "internal-runtime",
        failedOperation: "execution.recover-after-restart",
        code: "PROCESS_RESTART_INTERRUPTED",
        message: reason,
        retryable: false,
        evidence:
          trace.at(-1) === undefined
            ? []
            : [
                {
                  id: trace.at(-1)!.id,
                  kind: "record",
                  description: "Last durable trace record before restart.",
                },
              ],
        effectStatus: interruptedEffectStatus(trace),
      });
      recoveryCausationId = this.executionStore.appendTrace(
        createTraceRecord({
          executionId: execution.executionId,
          goalId: execution.goalId,
          correlationId: execution.correlationId,
          causationId: failure.causationId,
          producer: failure.producer,
          timestamp: failure.timestamp,
          category: "failure",
          type: "failure.process_restart_interrupted",
          payload: failure,
        }),
      ).id;
    }

    if (goal.status !== "failed") {
      goal = this.goalStore.updateGoal(
        {
          ...goal,
          revision: goal.revision + 1,
          status: "failed",
          statusReason: reason,
          causationId: recoveryCausationId,
          producer: { kind: "runtime", component: "panda-daemon" },
          timestamp: this.now(),
        },
        goal.revision,
      );
    }
    trace = this.executionStore.getTrace(executionId);
    const existingGoalFailure = [...trace]
      .reverse()
      .find(
        (record) =>
          record.type === "goal.failed" &&
          isRecord(record.payload) &&
          record.payload.statusReason === reason,
      );
    if (existingGoalFailure === undefined) {
      recoveryCausationId = this.executionStore.appendTrace(
        createTraceRecord({
          executionId: execution.executionId,
          goalId: execution.goalId,
          correlationId: execution.correlationId,
          causationId: recoveryCausationId,
          producer: goal.producer,
          timestamp: this.now(),
          category: "goal-status",
          type: "goal.failed",
          payload: goal,
        }),
      ).id;
    } else {
      recoveryCausationId = existingGoalFailure.id;
    }

    trace = this.executionStore.getTrace(executionId);
    const existingTermination = [...trace]
      .reverse()
      .find(
        (record) =>
          record.type === "execution.failed" &&
          isRecord(record.payload) &&
          record.payload.code === "PROCESS_RESTART_INTERRUPTED",
      );
    if (existingTermination === undefined) {
      this.executionStore.appendTrace(
        createTraceRecord({
          executionId: execution.executionId,
          goalId: execution.goalId,
          correlationId: execution.correlationId,
          causationId: recoveryCausationId,
          producer: { kind: "runtime", component: "panda-daemon" },
          timestamp: this.now(),
          category: "termination",
          type: "execution.failed",
          payload: {
            outcome: "failed",
            reason,
            code: "PROCESS_RESTART_INTERRUPTED",
          },
        }),
      );
    }

    execution = this.executionStore.getExecution(executionId) ?? execution;
    this.executionStore.updateExecution({
      ...execution,
      status: "failed",
      activeCapability: undefined,
      terminalOutcome: "failed",
      updatedAt: this.now(),
      statusReason: reason,
    });
  }

  private finalizeTerminalGoalExecution(
    execution: PandaExecution,
    goal: Goal,
  ): void {
    const outcome =
      goal.status === "achieved"
        ? "succeeded"
        : goal.status === "cancelled"
          ? "cancelled"
          : "failed";
    const reason = `The daemon restarted after the Goal was already ${goal.status}. PANDA finalized the Execution without replaying an Action.`;
    let trace = this.executionStore.getTrace(execution.executionId);
    const existingGoalStatus = [...trace]
      .reverse()
      .find(
        (record) =>
          record.type === `goal.${goal.status}` &&
          isRecord(record.payload) &&
          record.payload.revision === goal.revision,
      );
    let causationId = existingGoalStatus?.id ?? trace.at(-1)?.id;
    if (existingGoalStatus === undefined) {
      causationId = this.executionStore.appendTrace(
        createTraceRecord({
          executionId: execution.executionId,
          goalId: execution.goalId,
          correlationId: execution.correlationId,
          causationId,
          producer: goal.producer,
          timestamp: this.now(),
          category: "goal-status",
          type: `goal.${goal.status}`,
          payload: goal,
        }),
      ).id;
    }

    trace = this.executionStore.getTrace(execution.executionId);
    const existingTermination = [...trace]
      .reverse()
      .find(
        (record) =>
          record.type === `execution.${outcome}` &&
          isRecord(record.payload) &&
          record.payload.code === "PROCESS_RESTART_FINALIZED_TERMINAL_GOAL",
      );
    if (existingTermination === undefined) {
      this.executionStore.appendTrace(
        createTraceRecord({
          executionId: execution.executionId,
          goalId: execution.goalId,
          correlationId: execution.correlationId,
          causationId,
          producer: { kind: "runtime", component: "panda-daemon" },
          timestamp: this.now(),
          category: "termination",
          type: `execution.${outcome}`,
          payload: {
            outcome,
            reason,
            code: "PROCESS_RESTART_FINALIZED_TERMINAL_GOAL",
          },
        }),
      );
    }
    const current =
      this.executionStore.getExecution(execution.executionId) ?? execution;
    this.executionStore.updateExecution({
      ...current,
      status: outcome,
      activeCapability: undefined,
      terminalOutcome: outcome,
      updatedAt: this.now(),
      statusReason: reason,
    });
  }

  private requireExecutionView(executionId: string): PandaExecutionView {
    const execution = this.executionStore.getExecution(executionId);
    if (execution === undefined) {
      throw new Error(`Execution ${executionId} disappeared from its owner.`);
    }
    const goal = this.goalStore.getGoal(execution.goalId);
    if (goal === undefined) {
      throw new Error(`Goal ${execution.goalId} disappeared from its owner.`);
    }
    const trace = this.executionStore.getTrace(executionId);
    const outcome = [...trace]
      .reverse()
      .find((record) => record.category === "outcome")?.payload as
      | Outcome
      | undefined;
    const verification = [...trace]
      .reverse()
      .find(
        (record) =>
          record.category === "assessment" &&
          isRecord(record.payload) &&
          isRecord(record.payload.result) &&
          record.payload.result.kind === "effect-verification",
      )?.payload as Assessment | undefined;

    return {
      executionId,
      status: execution.status,
      execution,
      goal,
      outcome,
      verification,
      traceUrl: `/executions/${encodeURIComponent(executionId)}/trace`,
    };
  }
}

function createExecutionGoal(
  executionId: string,
  goalId: string,
  correlationId: string,
  causationId: string,
  input: PandaExecutionCreateInput,
  timestamp: string,
  principal: PrincipalReference,
): Goal {
  const content = input.payload.content;
  const contentBytes =
    content === undefined ? undefined : Buffer.byteLength(content, "utf8");
  const contentHash =
    content === undefined
      ? undefined
      : createHash("sha256").update(content).digest("hex");
  return createGoal({
    id: goalId,
    goalId,
    executionId,
    correlationId,
    causationId,
    producer: { kind: "runtime", component: "panda-daemon" },
    timestamp,
    objective:
      "Create the requested UTF-8 file in the execution workspace and independently verify its exact effect.",
    priority: 1,
    constraints: ["execution-workspace-only", "utf8-only"],
    successCriteria: [
      {
        id: `${goalId}_path`,
        description: "Observed relative path matches the request.",
        evidenceType: "filesystem.relative-path",
        expected: input.payload.path,
      },
      {
        id: `${goalId}_content`,
        description: "Observed UTF-8 content matches exactly.",
        evidenceType: "filesystem.utf8-content",
        expected: content,
      },
      {
        id: `${goalId}_bytes`,
        description: "Observed byte count matches the requested UTF-8 bytes.",
        evidenceType: "filesystem.byte-count",
        expected: contentBytes,
      },
      {
        id: `${goalId}_sha256`,
        description: "Observed SHA-256 matches the requested UTF-8 bytes.",
        evidenceType: "filesystem.sha256",
        expected: contentHash,
      },
    ],
    failureCriteria: [],
    status: "active",
    owner: principal,
    dependencyGoalIds: [],
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePersistenceMode(mode: string): PandaPersistenceMode {
  if (mode !== "file" && mode !== "memory") {
    throw new PandaDaemonRuntimeError(
      "PERSISTENCE_MODE_INVALID",
      `Unsupported PANDA persistence mode ${mode}. Use "file" or "memory".`,
    );
  }
  return mode;
}

export function persistenceModeFromEnvironment(
  value: string | undefined,
): PandaPersistenceMode {
  return validatePersistenceMode(value ?? "file");
}

function interruptedEffectStatus(
  trace: readonly StoredTraceRecord[],
): EffectStatus {
  const actionIndex = lastIndexWhere(
    trace,
    (record) => record.type === "action.authorized",
  );
  const outcomeIndex = lastIndexWhere(
    trace,
    (record) =>
      record.category === "outcome" &&
      isRecord(record.payload) &&
      ["none", "attempted", "completed", "partial", "unknown"].includes(
        String(record.payload.effectStatus),
      ),
  );
  if (actionIndex > outcomeIndex) {
    return "unknown";
  }
  if (outcomeIndex >= 0) {
    const outcome = trace[outcomeIndex]?.payload;
    if (isRecord(outcome)) {
      return outcome.effectStatus as EffectStatus;
    }
  }
  return "none";
}

function lastIndexWhere(
  trace: readonly StoredTraceRecord[],
  predicate: (record: StoredTraceRecord) => boolean,
): number {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const record = trace[index];
    if (record !== undefined && predicate(record)) {
      return index;
    }
  }
  return -1;
}
