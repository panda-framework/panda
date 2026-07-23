export type PandaStateName =
  | "perception"
  | "analysis"
  | "network"
  | "decision"
  | "action";

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
