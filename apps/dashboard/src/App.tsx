import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileCode2,
  Layers3,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { PandaClient, PandaRequestError } from "@panda/sdk";
import type {
  PandaEvent,
  PandaExecutionCreateInput,
  PandaExecutionView,
  StoredPandaTraceRecord,
} from "@panda/shared";
import {
  executionInsights,
  orderTrace,
  producerLabel,
  traceCause,
  traceVisualKind,
  type TraceVisualKind,
} from "./trace-view";

const DEFAULT_PATH = "proof.txt";
const DEFAULT_CONTENT = "PANDA v0.1 completed";
const DAEMON_EVENTS_URL = "ws://127.0.0.1:4317/events";

type ConnectionState = "connecting" | "connected" | "disconnected";

export function App() {
  const client = useMemo(() => new PandaClient(), []);
  const selectedIdRef = useRef<string | undefined>(undefined);
  const websocketRefreshRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [executions, setExecutions] = useState<PandaExecutionView[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selected, setSelected] = useState<PandaExecutionView>();
  const [trace, setTrace] = useState<StoredPandaTraceRecord[]>([]);
  const [path, setPath] = useState(DEFAULT_PATH);
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connection, setConnection] =
    useState<ConnectionState>("connecting");
  const [error, setError] = useState<string>();

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refreshExecutions = useCallback(
    async (preferredId?: string) => {
      const views = await client.listExecutions();
      const ordered = [...views].sort((first, second) =>
        second.execution.updatedAt.localeCompare(first.execution.updatedAt),
      );
      setExecutions(ordered);
      const nextId =
        preferredId ??
        selectedIdRef.current ??
        ordered.at(0)?.executionId;
      if (nextId !== undefined) {
        setSelectedId(nextId);
      }
      return ordered;
    },
    [client],
  );

  const refreshSelection = useCallback(
    async (executionId: string) => {
      const [view, storedTrace] = await Promise.all([
        client.getExecution(executionId),
        client.getExecutionTrace(executionId),
      ]);
      setSelected(view);
      setTrace(orderTrace(storedTrace));
    },
    [client],
  );

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    setError(undefined);
    try {
      await refreshExecutions();
      const current = selectedIdRef.current;
      if (current !== undefined) {
        await refreshSelection(current);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshExecutions, refreshSelection]);

  useEffect(() => {
    let active = true;
    void refreshExecutions()
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setIsRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [refreshExecutions]);

  useEffect(() => {
    if (selectedId === undefined) {
      setSelected(undefined);
      setTrace([]);
      return;
    }
    let active = true;
    setError(undefined);
    void Promise.all([
      client.getExecution(selectedId),
      client.getExecutionTrace(selectedId),
    ])
      .then(([view, storedTrace]) => {
        if (!active) return;
        setSelected(view);
        setTrace(orderTrace(storedTrace));
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [client, selectedId]);

  useEffect(() => {
    const socket = new WebSocket(DAEMON_EVENTS_URL);
    setConnection("connecting");
    socket.onopen = () => setConnection("connected");
    socket.onclose = () => setConnection("disconnected");
    socket.onerror = () => setConnection("disconnected");
    socket.onmessage = (message) => {
      let event: PandaEvent;
      try {
        event = JSON.parse(message.data) as PandaEvent;
      } catch {
        return;
      }
      if (event.type !== "execution.recorded") return;
      const eventExecutionId = event.executionId;
      if (eventExecutionId === undefined) return;
      if (websocketRefreshRef.current !== undefined) {
        clearTimeout(websocketRefreshRef.current);
      }
      websocketRefreshRef.current = setTimeout(() => {
        const current = selectedIdRef.current ?? eventExecutionId;
        void Promise.all([
          refreshExecutions(current),
          refreshSelection(current),
        ]).catch((caught) => setError(errorMessage(caught)));
      }, 80);
    };
    return () => {
      if (websocketRefreshRef.current !== undefined) {
        clearTimeout(websocketRefreshRef.current);
      }
      socket.close();
    };
  }, [refreshExecutions, refreshSelection]);

  async function createExecution() {
    setIsCreating(true);
    setError(undefined);
    const request: PandaExecutionCreateInput = {
      source: "dashboard",
      payload: { path, content },
    };
    try {
      const view = await client.createExecution(request);
      selectedIdRef.current = view.executionId;
      setSelectedId(view.executionId);
      setSelected(view);
      await Promise.all([
        refreshExecutions(view.executionId),
        refreshSelection(view.executionId),
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Activity size={18} />
          </span>
          <div>
            <div className="brand-name">PANDA</div>
            <div className="brand-subtitle">Execution observatory</div>
          </div>
        </div>
        <div className="topbar-actions">
          <ConnectionBadge state={connection} />
          <button
            className="button button-quiet"
            type="button"
            onClick={() => void refreshAll()}
            disabled={isRefreshing}
          >
            <RefreshCw size={15} className={isRefreshing ? "spin" : ""} />
            Refresh truth
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">
            <Sparkles size={13} /> Canonical runtime trace
          </div>
          <h1>Follow an execution from intent to evidence.</h1>
          <p>
            One operator view for the goal, dynamic route, policy boundary,
            real effect, and independent verification.
          </p>
        </div>
        <div className="hero-stat" aria-label="Execution count">
          <span>{executions.length.toString().padStart(2, "0")}</span>
          <small>process-local executions</small>
        </div>
      </section>

      {error !== undefined && (
        <div className="error-banner" role="alert">
          <XCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <section className="workspace-grid">
        <aside className="control-rail">
          <ExecutionForm
            path={path}
            content={content}
            isCreating={isCreating}
            onPathChange={setPath}
            onContentChange={setContent}
            onSubmit={() => void createExecution()}
          />
          <ExecutionList
            executions={executions}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>

        <section className="trace-workspace">
          {selected === undefined ? (
            <EmptyDashboard />
          ) : (
            <>
              <ExecutionHeader view={selected} traceCount={trace.length} />
              <InsightGrid trace={trace} />
              <TraceTimeline trace={trace} />
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function ExecutionForm({
  path,
  content,
  isCreating,
  onPathChange,
  onContentChange,
  onSubmit,
}: {
  path: string;
  content: string;
  isCreating: boolean;
  onPathChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = path.trim().length > 0 && !isCreating;
  return (
    <section className="panel request-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">New execution</span>
          <h2>Bounded file request</h2>
        </div>
        <FileCode2 size={19} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <label className="field-label" htmlFor="request-path">
          Relative path
        </label>
        <input
          id="request-path"
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="proof.txt"
          autoComplete="off"
        />
        <div className="field-note">Execution workspace only · UTF-8</div>
        <label className="field-label" htmlFor="request-content">
          File content
        </label>
        <textarea
          id="request-content"
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          rows={5}
        />
        <button
          className="button button-primary button-full"
          type="submit"
          disabled={!canSubmit}
        >
          <Play size={15} fill="currentColor" />
          {isCreating ? "Executing…" : "Create execution"}
        </button>
      </form>
    </section>
  );
}

function ExecutionList({
  executions,
  selectedId,
  onSelect,
}: {
  executions: PandaExecutionView[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="panel execution-panel">
      <div className="panel-heading compact">
        <div>
          <span className="section-kicker">Runtime index</span>
          <h2>Executions</h2>
        </div>
        <span className="count-pill">{executions.length}</span>
      </div>
      <div className="execution-list">
        {executions.length === 0 ? (
          <div className="rail-empty">No executions recorded in this process.</div>
        ) : (
          executions.map((view) => {
            const active = view.executionId === selectedId;
            return (
              <button
                key={view.executionId}
                type="button"
                className={`execution-card${active ? " selected" : ""}`}
                onClick={() => onSelect(view.executionId)}
                aria-pressed={active}
              >
                <div className="execution-card-topline">
                  <StatusBadge status={view.status} />
                  <span>{formatTimestamp(view.execution.updatedAt)}</span>
                </div>
                <strong>{view.goal.objective}</strong>
                <div className="execution-state">
                  <CircleDot size={12} />
                  {view.execution.activeCapability !== undefined
                    ? `Active · ${view.execution.activeCapability}`
                    : `Terminal · ${view.execution.terminalOutcome ?? view.status}`}
                </div>
                <code>{shortId(view.executionId)}</code>
                <ArrowRight className="execution-arrow" size={16} />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function ExecutionHeader({
  view,
  traceCount,
}: {
  view: PandaExecutionView;
  traceCount: number;
}) {
  const { execution, goal } = view;
  return (
    <section className="execution-header panel">
      <div className="execution-title-row">
        <div>
          <div className="execution-meta-row">
            <StatusBadge status={view.status} />
            <span className="mono-label">{view.executionId}</span>
          </div>
          <h2>{goal.objective}</h2>
          <p>{execution.statusReason ?? goal.statusReason ?? "No status reason recorded."}</p>
        </div>
        <div className="trace-count">
          <Layers3 size={17} />
          <strong>{traceCount}</strong>
          <span>stored records</span>
        </div>
      </div>

      <div className="execution-facts">
        <Fact
          label="Runtime state"
          value={
            execution.activeCapability !== undefined
              ? `Active in ${execution.activeCapability}`
              : `Terminal: ${execution.terminalOutcome ?? execution.status}`
          }
        />
        <Fact label="Goal state" value={goal.status} />
        <Fact label="Updated" value={formatTimestamp(execution.updatedAt)} />
      </div>

      <div className="criteria-layout">
        <div>
          <h3>Success criteria</h3>
          <ol className="criteria-list">
            {goal.successCriteria.map((criterion) => (
              <li key={criterion.id}>
                <CheckCircle2 size={15} />
                <span>
                  {criterion.description}
                  <code>
                    {criterion.evidenceType ?? "evidence unspecified"} ={" "}
                    {formatExpected(criterion.expected)}
                  </code>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3>Constraints</h3>
          {goal.constraints.length === 0 ? (
            <p className="not-recorded">Not recorded</p>
          ) : (
            <ul className="constraint-list">
              {goal.constraints.map((constraint) => (
                <li key={constraint}>{constraint}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function InsightGrid({ trace }: { trace: StoredPandaTraceRecord[] }) {
  const iconById = {
    input: CircleDot,
    route: Route,
    decision: Sparkles,
    authorization: ShieldCheck,
    request: FileCode2,
    effect: Activity,
    verification: CheckCircle2,
  } as const;
  return (
    <section className="insight-section">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">Record-derived answers</span>
          <h2>Operator brief</h2>
        </div>
        <span>Every answer cites stored evidence.</span>
      </div>
      <div className="insight-grid">
        {executionInsights(trace).map((insight) => {
          const Icon = iconById[insight.id];
          return (
            <article className="insight-card" key={insight.id}>
              <div className="insight-icon">
                <Icon size={16} />
              </div>
              <span>{insight.label}</span>
              <strong>{insight.value}</strong>
              {insight.detail !== undefined && <p>{insight.detail}</p>}
              <small>
                {insight.sourceSequence === undefined
                  ? "Source · Not recorded"
                  : (
                      <a href={`#trace-${insight.sourceSequence}`}>
                        Source · #{insight.sourceSequence}
                      </a>
                    )}
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TraceTimeline({ trace }: { trace: StoredPandaTraceRecord[] }) {
  const ordered = orderTrace(trace);
  return (
    <section className="timeline-section panel">
      <div className="section-heading-row timeline-heading">
        <div>
          <span className="section-kicker">Sequence is authoritative</span>
          <h2>Causal timeline</h2>
        </div>
        <VisualLegend />
      </div>
      {ordered.length === 0 ? (
        <div className="timeline-empty">No trace records are stored.</div>
      ) : (
        <ol className="timeline-list">
          {ordered.map((record) => (
            <TraceRow key={record.id} record={record} trace={ordered} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TraceRow({
  record,
  trace,
}: {
  record: StoredPandaTraceRecord;
  trace: StoredPandaTraceRecord[];
}) {
  const kind = traceVisualKind(record.category);
  const cause = traceCause(record, trace);
  const causeLabel =
    cause.state === "root"
      ? "Root record"
      : cause.state === "resolved"
        ? `Direct cause · #${cause.sequence}`
        : "Direct cause · unresolved";
  return (
    <li className={`timeline-row kind-${kind}`} id={`trace-${record.sequence}`}>
      <div className="timeline-sequence">#{record.sequence}</div>
      <div className="timeline-node" aria-hidden="true" />
      <article>
        <div className="timeline-topline">
          <div className="timeline-labels">
            <span className="kind-label">{visualKindLabel(kind)}</span>
            <span className="category-label">{record.category}</span>
          </div>
          <time dateTime={record.timestamp}>{formatTimestamp(record.timestamp)}</time>
        </div>
        <h3>{record.type}</h3>
        <div className="record-grid">
          <div>
            <span>Producer</span>
            <strong>{producerLabel(record)}</strong>
          </div>
          <div>
            <span>Record ID</span>
            <code>{record.id}</code>
          </div>
          <div>
            <span>{causeLabel}</span>
            {cause.state === "resolved" ? (
              <a href={`#trace-${cause.sequence}`}>
                <code>{cause.id}</code>
              </a>
            ) : (
              <code>{cause.id ?? "—"}</code>
            )}
          </div>
        </div>
        <details className="payload-details">
          <summary>Inspect exact payload</summary>
          <pre>{JSON.stringify(record.payload, null, 2)}</pre>
        </details>
      </article>
    </li>
  );
}

function VisualLegend() {
  const kinds: TraceVisualKind[] = [
    "observed",
    "inference",
    "decision",
    "authorization",
    "effect",
    "runtime",
    "failure",
  ];
  return (
    <div className="visual-legend" aria-label="Trace kind legend">
      {kinds.map((kind) => (
        <span key={kind} className={`legend-${kind}`}>
          {visualKindLabel(kind)}
        </span>
      ))}
    </div>
  );
}

function EmptyDashboard() {
  return (
    <section className="empty-dashboard panel">
      <div className="empty-radar" aria-hidden="true">
        <Activity size={29} />
      </div>
      <span className="section-kicker">Awaiting runtime evidence</span>
      <h2>Create the first canonical execution.</h2>
      <p>
        The trace will appear here in store-assigned order. No browser-only
        runtime records are created.
      </p>
    </section>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const Icon = state === "connected" ? Wifi : WifiOff;
  return (
    <span className={`connection-badge ${state}`}>
      <Icon size={14} />
      {state === "connected"
        ? "Live records"
        : state === "connecting"
          ? "Connecting"
          : "Trace reads only"}
    </span>
  );
}

function StatusBadge({ status }: { status: PandaExecutionView["status"] }) {
  const Icon =
    status === "succeeded"
      ? CheckCircle2
      : status === "failed" || status === "cancelled"
        ? XCircle
        : Clock3;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={12} />
      {status}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function visualKindLabel(kind: TraceVisualKind): string {
  const labels: Record<TraceVisualKind, string> = {
    observed: "Observed fact",
    inference: "Inference",
    decision: "Decision",
    authorization: "Authorization",
    effect: "External effect",
    failure: "Failure",
    runtime: "Runtime control",
  };
  return labels[kind];
}

function errorMessage(error: unknown): string {
  if (error instanceof PandaRequestError) {
    return `${error.detail.code}: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return "The dashboard could not read canonical daemon state.";
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function shortId(id: string): string {
  return id.length > 23 ? `${id.slice(0, 12)}…${id.slice(-7)}` : id;
}

function formatExpected(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "not recorded" : serialized;
}
