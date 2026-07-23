export type PandaStateName =
  | "perception"
  | "understanding"
  | "memory"
  | "planning"
  | "decision"
  | "execution"
  | "reflection";

export type PandaSessionStatus = "idle" | "running" | "completed" | "failed";

export interface PandaMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
}

export interface PandaSession {
  id: string;
  status: PandaSessionStatus;
  currentState: PandaStateName;
  messages: PandaMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface PandaRunInput {
  sessionId?: string;
  input: string;
}

export interface PandaRunResult {
  session: PandaSession;
  output: string;
}

export interface PandaEvent {
  type:
    | "session.created"
    | "session.updated"
    | "run.started"
    | "run.completed"
    | "run.failed"
    | "log";
  sessionId?: string;
  payload: unknown;
  createdAt: string;
}

export type ObservationPriority = "low" | "normal" | "high" | "critical";

export interface PandaObservation<TPayload = unknown> {
  id: string;
  timestamp: string;
  source: string;
  type: string;
  priority: ObservationPriority;
  confidence: number;
  payload: TPayload;
  correlationId?: string;
  metadata: Record<string, unknown>;
}

export interface PandaAction<TPayload = unknown> {
  id: string;
  timestamp: string;
  target: string;
  type: string;
  payload: TPayload;
  correlationId?: string;
  metadata: Record<string, unknown>;
}

export interface PandaActionResult<TPayload = unknown> {
  actionId: string;
  ok: boolean;
  payload?: TPayload;
  error?: string;
  timestamp: string;
}

export interface StateTransitionPayload {
  from: PandaStateName;
  to: PandaStateName;
  reason?: string;
}

export interface PandaConfig {
  daemonHost: string;
  daemonPort: number;
  databasePath: string;
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createObservation<TPayload>(
  input: Omit<PandaObservation<TPayload>, "id" | "timestamp" | "priority" | "confidence" | "metadata"> &
    Partial<Pick<PandaObservation<TPayload>, "id" | "timestamp" | "priority" | "confidence" | "metadata">>,
): PandaObservation<TPayload> {
  return {
    id: input.id || createId("obs"),
    timestamp: input.timestamp || nowIso(),
    source: input.source,
    type: input.type,
    priority: input.priority || "normal",
    confidence: input.confidence ?? 1,
    payload: input.payload,
    correlationId: input.correlationId,
    metadata: input.metadata || {},
  };
}

export function createAction<TPayload>(
  input: Omit<PandaAction<TPayload>, "id" | "timestamp" | "metadata"> &
    Partial<Pick<PandaAction<TPayload>, "id" | "timestamp" | "metadata">>,
): PandaAction<TPayload> {
  return {
    id: input.id || createId("act"),
    timestamp: input.timestamp || nowIso(),
    target: input.target,
    type: input.type,
    payload: input.payload,
    correlationId: input.correlationId,
    metadata: input.metadata || {},
  };
}

export function createLogger(scope: string) {
  return {
    info(message: string, meta?: unknown) {
      console.log(formatLog(scope, "info", message, meta));
    },
    warn(message: string, meta?: unknown) {
      console.warn(formatLog(scope, "warn", message, meta));
    },
    error(message: string, meta?: unknown) {
      console.error(formatLog(scope, "error", message, meta));
    },
  };
}

function formatLog(
  scope: string,
  level: "info" | "warn" | "error",
  message: string,
  meta?: unknown,
): string {
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  return `[${nowIso()}] [${level}] [${scope}] ${message}${suffix}`;
}
