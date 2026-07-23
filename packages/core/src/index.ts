import {
  createId,
  nowIso,
  type PandaMessage,
  type PandaSession,
  type PandaSessionStatus,
  type PandaStateName,
} from "@panda/shared";

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
