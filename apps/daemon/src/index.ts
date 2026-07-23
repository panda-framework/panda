import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { z } from "zod";
import {
  appendMessage,
  createSession,
  defaultPandaConfig,
  InMemoryPandaStore,
} from "@panda/core";
import { runPandaLoop } from "@panda/graph";
import {
  createLogger,
  nowIso,
  type PandaEvent,
  type PandaRunResult,
} from "@panda/shared";

const logger = createLogger("daemon");
const config = defaultPandaConfig();
const store = new InMemoryPandaStore();
const clients = new Set<{ send: (payload: string) => void }>();

const runSchema = z.object({
  sessionId: z.string().optional(),
  input: z.string().min(1),
});

const app = Fastify({
  logger: false,
});

await app.register(cors, {
  origin: true,
});
await app.register(websocket);

app.get("/health", async () => ({
  ok: true,
  name: "panda-daemon",
  version: "0.1.0",
}));

app.get("/sessions", async () => store.listSessions());

app.get("/sessions/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const session = store.getSession(id);

  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  return session;
});

app.post("/runs", async (request, reply) => {
  const parsed = runSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.flatten() });
  }

  const initialSession = parsed.data.sessionId
    ? store.getSession(parsed.data.sessionId)
    : createSession(parsed.data.input);

  if (!initialSession) {
    return reply.code(404).send({ error: "Session not found" });
  }

  let session =
    parsed.data.sessionId === undefined
      ? initialSession
      : appendMessage(initialSession, "user", parsed.data.input);

  session = store.saveSession(session);
  publish("run.started", session.id, { input: parsed.data.input });

  try {
    const result = await runPandaLoop({
      session,
      input: parsed.data.input,
      notes: [],
    });
    const saved = store.saveSession(result.session);
    const output = saved.messages.at(-1)?.content || "";
    const payload: PandaRunResult = { session: saved, output };

    publish("run.completed", saved.id, payload);
    return payload;
  } catch (error) {
    publish("run.failed", session.id, {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

app.get("/events", { websocket: true }, (connection) => {
  clients.add(connection);
  connection.send(
    JSON.stringify({
      type: "log",
      payload: { message: "Connected to PANDA daemon events." },
      createdAt: nowIso(),
    } satisfies PandaEvent),
  );
  connection.on("close", () => clients.delete(connection));
});

function publish(type: PandaEvent["type"], sessionId: string, payload: unknown) {
  const event: PandaEvent = {
    type,
    sessionId,
    payload,
    createdAt: nowIso(),
  };
  const serialized = JSON.stringify(event);

  for (const client of clients) {
    client.send(serialized);
  }
}

try {
  await app.listen({
    host: config.daemonHost,
    port: config.daemonPort,
  });
  logger.info(`listening on http://${config.daemonHost}:${config.daemonPort}`);
} catch (error) {
  logger.error("failed to start daemon", error);
  process.exitCode = 1;
}
