import {
  createAction,
  createId,
  createObservation,
  nowIso,
  type PandaAction,
  type PandaActionResult,
  type PandaObservation,
  type PandaMessage,
  type PandaSession,
  type PandaSessionStatus,
  type PandaStateName,
  type StateTransitionPayload,
} from "@panda/shared";

export * from "./execution-store.js";
export * from "./coordinator.js";
export * from "./policy.js";
export * from "./action-connector.js";
export * from "./deterministic-capabilities.js";

export interface AgentRunContext {
  session: PandaSession;
  input: string;
  notes: string[];
}

export interface PandaMemoryStore {
  listSessions(): PandaSession[];
  getSession(id: string): PandaSession | undefined;
  saveSession(session: PandaSession): PandaSession;
}

export class InMemoryPandaStore implements PandaMemoryStore {
  private readonly sessions = new Map<string, PandaSession>();

  listSessions(): PandaSession[] {
    return [...this.sessions.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  getSession(id: string): PandaSession | undefined {
    return this.sessions.get(id);
  }

  saveSession(session: PandaSession): PandaSession {
    this.sessions.set(session.id, session);
    return session;
  }
}

export function createSession(input?: string): PandaSession {
  const createdAt = nowIso();
  const messages: PandaMessage[] = input
    ? [
        {
          id: createId("msg"),
          role: "user",
          content: input,
          createdAt,
        },
      ]
    : [];

  return {
    id: createId("ses"),
    status: "idle",
    currentState: "perception",
    messages,
    createdAt,
    updatedAt: createdAt,
  };
}

export function appendMessage(
  session: PandaSession,
  role: PandaMessage["role"],
  content: string,
): PandaSession {
  const updatedAt = nowIso();
  return {
    ...session,
    messages: [
      ...session.messages,
      {
        id: createId("msg"),
        role,
        content,
        createdAt: updatedAt,
      },
    ],
    updatedAt,
  };
}

export function updateSessionState(
  session: PandaSession,
  currentState: PandaStateName,
  status: PandaSessionStatus = session.status,
): PandaSession {
  return {
    ...session,
    currentState,
    status,
    updatedAt: nowIso(),
  };
}

export function defaultPandaConfig() {
  return {
    daemonHost: process.env.PANDA_HOST || "127.0.0.1",
    daemonPort: Number(process.env.PANDA_PORT || 4317),
    databasePath: process.env.PANDA_DB || "apps/daemon/data/panda.sqlite",
  };
}

export interface ObservationHandler {
  id: string;
  observationTypes: readonly string[] | "*";
  handle(observation: PandaObservation): Promise<void> | void;
}

export interface ObservationBus {
  publish(observation: PandaObservation): Promise<void>;
  subscribe(handler: ObservationHandler): () => void;
  drain(options?: { signal?: AbortSignal }): Promise<void>;
  size(): number;
}

export class InMemoryObservationBus implements ObservationBus {
  private readonly queue: PandaObservation[] = [];
  private readonly handlers = new Map<string, ObservationHandler>();
  private draining = false;

  async publish(observation: PandaObservation): Promise<void> {
    this.queue.push(observation);
  }

  subscribe(handler: ObservationHandler): () => void {
    this.handlers.set(handler.id, handler);
    return () => this.handlers.delete(handler.id);
  }

  size(): number {
    return this.queue.length;
  }

  async drain(options: { signal?: AbortSignal } = {}): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;
    try {
      while (this.queue.length > 0 && !options.signal?.aborted) {
        const observation = this.queue.shift();
        if (!observation) {
          continue;
        }

        const interested = [...this.handlers.values()].filter((handler) =>
          handler.observationTypes === "*" ||
          handler.observationTypes.includes(observation.type),
        );

        await Promise.all(interested.map((handler) => handler.handle(observation)));
      }
    } finally {
      this.draining = false;
    }
  }
}

export interface PandaAnalyzer extends ObservationHandler {}

export class PandaScheduler {
  private readonly analyzers = new Map<string, PandaAnalyzer>();

  constructor(private readonly bus: ObservationBus) {}

  register(analyzer: PandaAnalyzer): () => void {
    this.analyzers.set(analyzer.id, analyzer);
    const unsubscribe = this.bus.subscribe(analyzer);

    return () => {
      this.analyzers.delete(analyzer.id);
      unsubscribe();
    };
  }

  listAnalyzers(): PandaAnalyzer[] {
    return [...this.analyzers.values()];
  }

  async dispatch(observation: PandaObservation): Promise<void> {
    await this.bus.publish(observation);
    await this.bus.drain();
  }
}

export interface ConnectorMetadata {
  id: string;
  name: string;
  capabilities: string[];
  inputTypes: string[];
  actionTypes: string[];
}

export interface ConnectorHealth {
  ok: boolean;
  message?: string;
  checkedAt: string;
}

export interface PandaConnector {
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(handler: (action: PandaAction) => Promise<void> | void): () => void;
  publish(observation: PandaObservation): Promise<void>;
  health(): Promise<ConnectorHealth>;
  metadata(): ConnectorMetadata;
  execute?(action: PandaAction): Promise<PandaActionResult>;
}

export abstract class BaseConnector implements PandaConnector {
  private readonly actionHandlers = new Set<(action: PandaAction) => Promise<void> | void>();
  protected running = false;

  constructor(
    protected readonly bus: ObservationBus,
    private readonly connectorMetadata: ConnectorMetadata,
  ) {}

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  subscribe(handler: (action: PandaAction) => Promise<void> | void): () => void {
    this.actionHandlers.add(handler);
    return () => this.actionHandlers.delete(handler);
  }

  async publish(observation: PandaObservation): Promise<void> {
    await this.bus.publish(observation);
  }

  async health(): Promise<ConnectorHealth> {
    return {
      ok: this.running,
      message: this.running ? "running" : "stopped",
      checkedAt: nowIso(),
    };
  }

  metadata(): ConnectorMetadata {
    return this.connectorMetadata;
  }

  protected async emitAction(action: PandaAction): Promise<void> {
    await Promise.all([...this.actionHandlers].map((handler) => handler(action)));
  }
}

export class FilesystemConnector extends BaseConnector {
  constructor(bus: ObservationBus) {
    super(bus, {
      id: "filesystem",
      name: "Filesystem",
      capabilities: ["observe-file-events", "execute-file-actions"],
      inputTypes: ["filesystem.changed"],
      actionTypes: ["filesystem.write"],
    });
  }

  async observeChange(path: string, kind: "created" | "updated" | "deleted"): Promise<void> {
    await this.publish(
      createObservation({
        source: "filesystem",
        type: "filesystem.changed",
        payload: { path, kind },
      }),
    );
  }

  async execute(action: PandaAction): Promise<PandaActionResult> {
    if (action.type !== "filesystem.write") {
      return unsupportedAction(action);
    }

    return {
      actionId: action.id,
      ok: true,
      payload: { accepted: true },
      timestamp: nowIso(),
    };
  }
}

export class GitHubConnector extends BaseConnector {
  constructor(bus: ObservationBus) {
    super(bus, {
      id: "github",
      name: "GitHub",
      capabilities: ["observe-github-events", "execute-github-actions"],
      inputTypes: ["github.issue", "github.pull_request", "github.webhook"],
      actionTypes: ["github.comment", "github.label"],
    });
  }

  async observeWebhook(event: string, payload: unknown): Promise<void> {
    await this.publish(
      createObservation({
        source: "github",
        type: `github.${event}`,
        payload,
      }),
    );
  }

  async execute(action: PandaAction): Promise<PandaActionResult> {
    if (!action.type.startsWith("github.")) {
      return unsupportedAction(action);
    }

    return {
      actionId: action.id,
      ok: true,
      payload: { accepted: true },
      timestamp: nowIso(),
    };
  }
}

export class ActionDispatcher {
  private readonly connectors = new Map<string, PandaConnector>();

  register(connector: PandaConnector): void {
    this.connectors.set(connector.metadata().id, connector);
  }

  async dispatch(action: PandaAction): Promise<PandaActionResult> {
    const connector = this.connectors.get(action.target);

    if (!connector?.execute) {
      return {
        actionId: action.id,
        ok: false,
        error: `No connector can execute target ${action.target}`,
        timestamp: nowIso(),
      };
    }

    return connector.execute(action);
  }
}

export class StateTransitionEngine implements ObservationHandler {
  readonly id = "state-transition-engine";
  readonly observationTypes = ["state.transition.requested"];

  private currentState: PandaStateName;
  private readonly transitions: StateTransitionPayload[] = [];

  constructor(
    initialState: PandaStateName = "perception",
    private readonly bus?: ObservationBus,
  ) {
    this.currentState = initialState;
  }

  getCurrentState(): PandaStateName {
    return this.currentState;
  }

  getTransitions(): StateTransitionPayload[] {
    return [...this.transitions];
  }

  async requestTransition(to: PandaStateName, reason?: string): Promise<void> {
    const transition = { from: this.currentState, to, reason };

    if (this.bus) {
      await this.bus.publish(
        createObservation<StateTransitionPayload>({
          source: "state",
          type: "state.transition.requested",
          payload: transition,
        }),
      );
      return;
    }

    await this.handle(createObservation({ source: "state", type: "state.transition.requested", payload: transition }));
  }

  async handle(observation: PandaObservation): Promise<void> {
    const payload = observation.payload as StateTransitionPayload;
    const transition = {
      from: payload.from || this.currentState,
      to: payload.to,
      reason: payload.reason,
    };

    this.currentState = transition.to;
    this.transitions.push(transition);

    if (this.bus) {
      await this.bus.publish(
        createObservation<StateTransitionPayload>({
          source: "state",
          type: "state.transitioned",
          payload: transition,
          correlationId: observation.correlationId || observation.id,
        }),
      );
    }
  }
}

export interface MemoryDecision {
  observationId: string;
  action: "store" | "summarize" | "discard";
  reason: string;
}

export class ObservationMemory implements ObservationHandler {
  readonly id = "memory";
  readonly observationTypes = "*";
  private readonly records: PandaObservation[] = [];
  private readonly decisions: MemoryDecision[] = [];

  async handle(observation: PandaObservation): Promise<void> {
    const decision = this.decide(observation);
    this.decisions.push(decision);

    if (decision.action !== "discard") {
      this.records.push(observation);
    }
  }

  list(): PandaObservation[] {
    return [...this.records];
  }

  listDecisions(): MemoryDecision[] {
    return [...this.decisions];
  }

  private decide(observation: PandaObservation): MemoryDecision {
    if (observation.priority === "low" && observation.confidence < 0.5) {
      return {
        observationId: observation.id,
        action: "discard",
        reason: "low-priority low-confidence observation",
      };
    }

    if (JSON.stringify(observation.payload).length > 1_000) {
      return {
        observationId: observation.id,
        action: "summarize",
        reason: "large payload should be summarized before long-term storage",
      };
    }

    return {
      observationId: observation.id,
      action: "store",
      reason: "observation is relevant runtime context",
    };
  }
}

export class PandaRuntime {
  readonly bus = new InMemoryObservationBus();
  readonly scheduler = new PandaScheduler(this.bus);
  readonly dispatcher = new ActionDispatcher();
  readonly memory = new ObservationMemory();
  readonly state = new StateTransitionEngine("perception", this.bus);

  constructor() {
    this.scheduler.register(this.memory);
    this.scheduler.register(this.state);
  }

  registerConnector(connector: PandaConnector): void {
    this.dispatcher.register(connector);
  }

  async observe(input: Omit<PandaObservation, "id" | "timestamp" | "priority" | "confidence" | "metadata"> &
    Partial<Pick<PandaObservation, "id" | "timestamp" | "priority" | "confidence" | "metadata">>): Promise<PandaObservation> {
    const observation = createObservation(input);
    await this.scheduler.dispatch(observation);
    return observation;
  }

  async act(input: Omit<PandaAction, "id" | "timestamp" | "metadata"> &
    Partial<Pick<PandaAction, "id" | "timestamp" | "metadata">>): Promise<PandaActionResult> {
    const action = createAction(input);
    return this.dispatcher.dispatch(action);
  }
}

function unsupportedAction(action: PandaAction): PandaActionResult {
  return {
    actionId: action.id,
    ok: false,
    error: `Unsupported action type ${action.type}`,
    timestamp: nowIso(),
  };
}
