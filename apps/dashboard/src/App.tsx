import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Database,
  Home,
  ListChecks,
  Play,
  ScrollText,
  Settings,
} from "lucide-react";
import { PandaClient } from "@panda/sdk";
import type { PandaEvent, PandaSession } from "@panda/shared";

const pages = [
  { id: "home", label: "Home", icon: Home },
  { id: "console", label: "Agent Console", icon: Bot },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "memory", label: "Memory", icon: Database },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "logs", label: "Logs", icon: ScrollText },
] as const;

type PageId = (typeof pages)[number]["id"];

export function App() {
  const client = useMemo(() => new PandaClient(), []);
  const [page, setPage] = useState<PageId>("home");
  const [sessions, setSessions] = useState<PandaSession[]>([]);
  const [events, setEvents] = useState<PandaEvent[]>([]);
  const [input, setInput] = useState("Summarize the current PANDA state.");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    void refreshSessions();

    const socket = new WebSocket("ws://127.0.0.1:4317/events");
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as PandaEvent;
      setEvents((current) => [event, ...current].slice(0, 100));
      if (event.type === "run.completed") {
        void refreshSessions();
      }
    };
    return () => socket.close();
  }, []);

  async function refreshSessions() {
    try {
      setSessions(await client.listSessions());
    } catch {
      setSessions([]);
    }
  }

  async function runAgent() {
    setIsRunning(true);
    try {
      await client.run({ input });
      await refreshSessions();
    } finally {
      setIsRunning(false);
    }
  }

  const latest = sessions[0];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-border bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <Activity className="h-5 w-5 text-emerald-700" />
          <span className="text-sm font-semibold tracking-wide">PANDA</span>
        </div>
        <nav className="space-y-1 p-3">
          {pages.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                  page === item.id
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100"
                }`}
                onClick={() => setPage(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="ml-64 p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{pageTitle(page)}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Local daemon API at http://127.0.0.1:4317
            </p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={runAgent}
            disabled={isRunning || input.trim().length === 0}
          >
            <Play className="h-4 w-4" />
            Run
          </button>
        </header>

        {page === "home" && (
          <div className="grid grid-cols-3 gap-4">
            <Metric label="Sessions" value={sessions.length.toString()} />
            <Metric label="Latest State" value={latest?.currentState || "idle"} />
            <Metric label="Events" value={events.length.toString()} />
          </div>
        )}

        {page === "console" && (
          <div className="grid gap-4">
            <textarea
              className="min-h-36 rounded-md border border-border p-4 text-sm outline-none focus:ring-2 focus:ring-emerald-700"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <SessionList sessions={sessions} />
          </div>
        )}

        {page === "tasks" && <EmptyState text="Task orchestration will build on daemon sessions." />}
        {page === "memory" && <SessionList sessions={sessions} />}
        {page === "settings" && <EmptyState text="Settings will remain daemon-backed." />}
        {page === "logs" && <EventList events={events} />}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-white p-5">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SessionList({ sessions }: { sessions: PandaSession[] }) {
  if (sessions.length === 0) {
    return <EmptyState text="No sessions yet." />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-white">
      {sessions.map((session) => (
        <div key={session.id} className="border-b border-border p-4 last:border-b-0">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-500">{session.id}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{session.status}</span>
          </div>
          <div className="mt-2 text-sm">State: {session.currentState}</div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">
            {session.messages.at(-1)?.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventList({ events }: { events: PandaEvent[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-white">
      {events.map((event, index) => (
        <div key={`${event.createdAt}-${index}`} className="border-b border-border p-4 last:border-b-0">
          <div className="text-sm font-medium">{event.type}</div>
          <pre className="mt-2 overflow-auto text-xs text-zinc-600">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-white p-8 text-sm text-zinc-500">
      {text}
    </div>
  );
}

function pageTitle(page: PageId): string {
  return pages.find((item) => item.id === page)?.label || "PANDA";
}
