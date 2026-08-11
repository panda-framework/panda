import type { StoredPandaTraceRecord, TraceCategory } from "@panda/shared";

export type TraceVisualKind =
  | "observed"
  | "inference"
  | "decision"
  | "authorization"
  | "effect"
  | "failure"
  | "runtime";

export interface TraceCauseView {
  readonly state: "root" | "resolved" | "unresolved";
  readonly id?: string;
  readonly sequence?: number;
}

export interface ExecutionInsight {
  readonly id:
    | "input"
    | "route"
    | "decision"
    | "authorization"
    | "request"
    | "effect"
    | "verification";
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly sourceSequence?: number;
}

const visualKinds: Readonly<Record<TraceCategory, TraceVisualKind>> = {
  signal: "observed",
  goal: "observed",
  "goal-status": "runtime",
  "capability-invocation": "runtime",
  observation: "observed",
  assessment: "inference",
  decision: "decision",
  transition: "runtime",
  "policy-evaluation": "authorization",
  "action-request": "effect",
  "connector-invocation": "effect",
  outcome: "effect",
  failure: "failure",
  wait: "runtime",
  termination: "runtime",
};

export function traceVisualKind(category: TraceCategory): TraceVisualKind {
  return visualKinds[category];
}

export function orderTrace(
  trace: readonly StoredPandaTraceRecord[],
): StoredPandaTraceRecord[] {
  return [...trace].sort((first, second) => first.sequence - second.sequence);
}

export function traceCause(
  record: StoredPandaTraceRecord,
  trace: readonly StoredPandaTraceRecord[],
): TraceCauseView {
  if (record.causationId === undefined) {
    return { state: "root" };
  }
  const cause = trace.find((candidate) => candidate.id === record.causationId);
  return cause === undefined
    ? { state: "unresolved", id: record.causationId }
    : {
        state: "resolved",
        id: record.causationId,
        sequence: cause.sequence,
      };
}

export function capabilityRoute(
  trace: readonly StoredPandaTraceRecord[],
): string[] {
  return orderTrace(trace).flatMap((record) => {
    if (record.type !== "capability.started" || !isRecord(record.payload)) {
      return [];
    }
    return typeof record.payload.capability === "string"
      ? [record.payload.capability]
      : [];
  });
}

export function executionInsights(
  trace: readonly StoredPandaTraceRecord[],
): ExecutionInsight[] {
  const ordered = orderTrace(trace);
  const signal = ordered.find((record) => record.category === "signal");
  const decision = findLatest(ordered, "decision");
  const effectPolicy = [...ordered]
    .reverse()
    .find(
      (record) =>
        record.category === "policy-evaluation" &&
        isRecord(record.payload) &&
        record.payload.point === "effect",
    );
  const action = findLatest(ordered, "action-request");
  const observation = [...ordered]
    .reverse()
    .find(
      (record) =>
        record.category === "observation" &&
        record.type.startsWith("verification."),
    );
  const verification = [...ordered]
    .reverse()
    .find(
      (record) =>
        record.category === "assessment" &&
        isRecord(record.payload) &&
        isRecord(record.payload.result) &&
        record.payload.result.kind === "effect-verification",
    );
  const route = capabilityRoute(ordered);

  return [
    insight(
      "input",
      "What entered the system?",
      summarizeSignal(signal?.payload),
      recordString(signal?.payload, "type"),
      signal,
    ),
    insight(
      "route",
      "Which route did it follow?",
      route.length === 0 ? "Not recorded" : route.join(" → "),
      route.length === 0 ? undefined : `${route.length} capability invocations`,
      ordered.find((record) => record.type === "capability.started"),
    ),
    insight(
      "decision",
      "Why was the action selected?",
      recordString(decision?.payload, "rationale") ?? "Not recorded",
      nestedString(decision?.payload, ["selectedOption", "description"]),
      decision,
    ),
    insight(
      "authorization",
      "Was it authorized?",
      summarizePolicy(effectPolicy?.payload),
      recordString(effectPolicy?.payload, "reason"),
      effectPolicy,
    ),
    insight(
      "request",
      "What was executed?",
      summarizeAction(action?.payload),
      nestedString(action?.payload, ["parameters", "path"]),
      action,
    ),
    insight(
      "effect",
      "What actually occurred?",
      summarizeObservation(observation?.payload),
      nestedString(observation?.payload, ["payload", "relativePath"]),
      observation,
    ),
    insight(
      "verification",
      "Why did the goal end this way?",
      summarizeVerification(verification?.payload),
      recordString(verification?.payload, "summary"),
      verification,
    ),
  ];
}

export function producerLabel(record: StoredPandaTraceRecord): string {
  const producer = record.producer;
  if (producer.kind === "capability") {
    return `capability · ${producer.capability}`;
  }
  if (producer.kind === "connector") {
    return `connector · ${producer.connectorId}`;
  }
  return `runtime · ${producer.component}`;
}

function insight(
  id: ExecutionInsight["id"],
  label: string,
  value: string,
  detail: string | undefined,
  source: StoredPandaTraceRecord | undefined,
): ExecutionInsight {
  return {
    id,
    label,
    value,
    detail,
    sourceSequence: source?.sequence,
  };
}

function findLatest(
  trace: readonly StoredPandaTraceRecord[],
  category: TraceCategory,
): StoredPandaTraceRecord | undefined {
  return [...trace].reverse().find((record) => record.category === category);
}

function summarizeSignal(value: unknown): string {
  if (!isRecord(value)) return "Not recorded";
  const payload = value.payload;
  if (!isRecord(payload)) return "Not recorded";
  const path = typeof payload.path === "string" ? payload.path : "path missing";
  const content =
    typeof payload.content === "string"
      ? `${new TextEncoder().encode(payload.content).byteLength} UTF-8 bytes`
      : "content missing";
  return `${path} · ${content}`;
}

function summarizePolicy(value: unknown): string {
  if (!isRecord(value) || typeof value.result !== "string") {
    return "Not recorded";
  }
  const policy = typeof value.policyId === "string" ? value.policyId : "policy";
  return `${value.result.toUpperCase()} · ${policy}`;
}

function summarizeAction(value: unknown): string {
  if (!isRecord(value) || typeof value.actionType !== "string") {
    return "Not recorded";
  }
  const connector =
    typeof value.connectorId === "string" ? value.connectorId : "connector";
  return `${value.actionType} via ${connector}`;
}

function summarizeObservation(value: unknown): string {
  const payload = nestedRecord(value, ["payload"]);
  if (payload === undefined || typeof payload.status !== "string") {
    return "Not recorded";
  }
  const bytes =
    typeof payload.byteCount === "number" ? ` · ${payload.byteCount} bytes` : "";
  return `${payload.status}${bytes}`;
}

function summarizeVerification(value: unknown): string {
  const result = nestedRecord(value, ["result"]);
  return result !== undefined && typeof result.status === "string"
    ? result.status
    : "Not recorded";
}

function recordString(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === "string"
    ? value[key]
    : undefined;
}

function nestedString(
  value: unknown,
  path: readonly string[],
): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

function nestedRecord(
  value: unknown,
  path: readonly string[],
): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return isRecord(current) ? current : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
