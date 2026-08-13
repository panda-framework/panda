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

export type ExecutionFlowKind =
  | "input"
  | "perception"
  | "analysis"
  | "network"
  | "decision"
  | "action"
  | "policy"
  | "connector"
  | "success"
  | "waiting"
  | "failure"
  | "runtime";

export interface ExecutionFlowStep {
  readonly id: string;
  readonly kind: ExecutionFlowKind;
  readonly system: string;
  readonly label: string;
  readonly detail: string;
  readonly sourceSequence: number;
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

export function executionFlow(
  trace: readonly StoredPandaTraceRecord[],
): ExecutionFlowStep[] {
  const ordered = orderTrace(trace);
  const capabilityTotals = new Map<string, number>();
  const capabilityOccurrences = new Map<string, number>();

  for (const record of ordered) {
    const capability = startedCapability(record);
    if (capability !== undefined) {
      capabilityTotals.set(
        capability,
        (capabilityTotals.get(capability) ?? 0) + 1,
      );
    }
  }

  return ordered.flatMap((record) => {
    if (record.category === "signal") {
      return [
        flowStep(
          record,
          "input",
          "Input",
          "New request",
          summarizeSignal(record.payload),
        ),
      ];
    }

    const capability = startedCapability(record);
    if (capability !== undefined) {
      const occurrence = (capabilityOccurrences.get(capability) ?? 0) + 1;
      capabilityOccurrences.set(capability, occurrence);
      return [
        flowStep(
          record,
          capabilityKind(capability),
          "PANDA capability",
          titleCase(capability),
          capabilityFlowDetail(
            capability,
            occurrence,
            capabilityTotals.get(capability) ?? 1,
          ),
        ),
      ];
    }

    if (
      record.category === "policy-evaluation" &&
      isRecord(record.payload) &&
      record.payload.point === "effect"
    ) {
      const result = recordString(record.payload, "result")?.toLowerCase();
      return [
        flowStep(
          record,
          "policy",
          "Safety boundary",
          "Policy gate",
          result === "allow"
            ? "Allowed the external effect"
            : result === "deny"
              ? "Blocked the external effect"
              : "Evaluated the external effect",
        ),
      ];
    }

    if (record.category === "connector-invocation") {
      const connector =
        record.producer.kind === "connector"
          ? record.producer.connectorId
          : recordString(record.payload, "connectorId") ?? "effect";
      const status = recordString(record.payload, "status");
      return [
        flowStep(
          record,
          "connector",
          "Effect system",
          `${titleCase(connector)} connector`,
          status === undefined
            ? "Performed the requested effect"
            : `${titleCase(status)} the requested effect`,
        ),
      ];
    }

    if (record.category === "wait") {
      return [
        flowStep(
          record,
          "waiting",
          "Outcome",
          "Waiting",
          "Paused for more information",
        ),
      ];
    }

    if (record.category === "termination") {
      const outcome =
        recordString(record.payload, "outcome") ??
        record.type.split(".").at(-1) ??
        "finished";
      const kind = terminalFlowKind(outcome);
      return [
        flowStep(
          record,
          kind,
          "Outcome",
          titleCase(outcome),
          terminalFlowDetail(kind),
        ),
      ];
    }

    return [];
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

function flowStep(
  record: StoredPandaTraceRecord,
  kind: ExecutionFlowKind,
  system: string,
  label: string,
  detail: string,
): ExecutionFlowStep {
  return {
    id: record.id,
    kind,
    system,
    label,
    detail,
    sourceSequence: record.sequence,
  };
}

function startedCapability(
  record: StoredPandaTraceRecord,
): string | undefined {
  return record.type === "capability.started"
    ? recordString(record.payload, "capability")
    : undefined;
}

function capabilityKind(capability: string): ExecutionFlowKind {
  return capability === "perception" ||
    capability === "analysis" ||
    capability === "network" ||
    capability === "decision" ||
    capability === "action"
    ? capability
    : "runtime";
}

function capabilityFlowDetail(
  capability: string,
  occurrence: number,
  total: number,
): string {
  if (capability === "perception") {
    return total > 1 && occurrence === total
      ? "Observed the real file after the write"
      : "Read and normalized the request";
  }
  if (capability === "analysis") {
    return total > 1 && occurrence === total
      ? "Compared the observed file with the goal"
      : "Checked requirements and readiness";
  }
  if (capability === "decision") return "Selected the next safe step";
  if (capability === "action") return "Prepared the requested effect";
  if (capability === "network") return "Exchanged information externally";
  return `Ran ${titleCase(capability)}`;
}

function terminalFlowKind(outcome: string): ExecutionFlowKind {
  if (outcome === "succeeded") return "success";
  if (outcome === "waiting") return "waiting";
  if (outcome === "failed" || outcome === "cancelled") return "failure";
  return "runtime";
}

function terminalFlowDetail(kind: ExecutionFlowKind): string {
  if (kind === "success") return "The verified evidence satisfied the goal";
  if (kind === "waiting") return "The run needs more information";
  if (kind === "failure") return "The run ended without verified success";
  return "The run reached a terminal state";
}

function titleCase(value: string): string {
  return value
    .split(/[-_.\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
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
