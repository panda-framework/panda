import { nowIso } from "./identifiers.js";

export * from "./contracts.js";
export { createId, nowIso } from "./identifiers.js";

export interface PandaEvent {
  type: "execution.recorded" | "log";
  executionId?: string;
  payload: unknown;
  createdAt: string;
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
