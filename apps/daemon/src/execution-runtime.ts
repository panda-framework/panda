import { createHash } from "node:crypto";
import {
  ExecutionCoordinator,
  FilesystemActionConnector,
  FilesystemEffectObserver,
  InMemoryActionConnectorRegistry,
  InMemoryCapabilityRegistry,
  InMemoryExecutionStore,
  InMemoryGoalStore,
  V01PolicyEngine,
  registerDeterministicPandaCapabilities,
  type StoredTraceRecord,
  type TraceRecordListener,
} from "@panda/core";
import {
  PANDA_V01_EXECUTION_REQUEST_TYPE,
  createGoal,
  createId,
  createPandaExecution,
  createSignal,
  createTraceRecord,
  nowIso,
  type Assessment,
  type Goal,
  type Outcome,
  type PandaExecutionCreateInput,
  type PandaExecutionView,
} from "@panda/shared";

export interface PandaDaemonRuntimeOptions {
  readonly dataDirectory?: string;
  readonly now?: () => string;
}

export class PandaDaemonRuntime {
  readonly executionStore = new InMemoryExecutionStore();
  readonly goalStore = new InMemoryGoalStore();
  readonly capabilityRegistry = new InMemoryCapabilityRegistry();
  readonly actionConnectorRegistry = new InMemoryActionConnectorRegistry();
  readonly policyEngine: V01PolicyEngine;
  readonly effectObserver: FilesystemEffectObserver;
  readonly coordinator: ExecutionCoordinator;
  private readonly now: () => string;

  constructor(options: PandaDaemonRuntimeOptions = {}) {
    this.now = options.now ?? nowIso;
    this.policyEngine = new V01PolicyEngine({
      dataDirectory: options.dataDirectory,
    });
    this.effectObserver = new FilesystemEffectObserver({
      policyEngine: this.policyEngine,
      now: this.now,
    });
    this.actionConnectorRegistry.register(
      new FilesystemActionConnector({
        policyEngine: this.policyEngine,
        now: this.now,
      }),
    );
    registerDeterministicPandaCapabilities(this.capabilityRegistry, {
      now: this.now,
      policyEngine: this.policyEngine,
      actionConnectorRegistry: this.actionConnectorRegistry,
      effectObserver: this.effectObserver,
    });
    this.coordinator = new ExecutionCoordinator(
      this.executionStore,
      this.capabilityRegistry,
      {
        component: "panda-daemon",
        now: this.now,
        policyEngine: this.policyEngine,
        goalStore: this.goalStore,
      },
    );
  }

  subscribe(listener: TraceRecordListener): () => void {
    return this.executionStore.subscribe(listener);
  }

  async createExecution(
    input: PandaExecutionCreateInput,
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
    owner: { id: "panda-daemon", type: "system" },
    dependencyGoalIds: [],
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
