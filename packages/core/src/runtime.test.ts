import assert from "node:assert/strict";
import test from "node:test";
import { createAction, createObservation } from "@panda/shared";
import {
  ActionDispatcher,
  FilesystemConnector,
  InMemoryObservationBus,
  ObservationMemory,
  PandaScheduler,
  StateTransitionEngine,
} from "./index.js";

test("scheduler dispatches observations to subscribed analyzers", async () => {
  const bus = new InMemoryObservationBus();
  const scheduler = new PandaScheduler(bus);
  const received: string[] = [];

  scheduler.register({
    id: "test-analyzer",
    observationTypes: ["user.input"],
    handle(observation) {
      received.push(observation.type);
    },
  });

  await scheduler.dispatch(
    createObservation({
      source: "test",
      type: "user.input",
      payload: { input: "hello" },
    }),
  );

  assert.deepEqual(received, ["user.input"]);
});

test("memory stores relevant observations and discards low-confidence low-priority events", async () => {
  const memory = new ObservationMemory();

  await memory.handle(
    createObservation({
      source: "test",
      type: "signal",
      payload: { value: 1 },
    }),
  );
  await memory.handle(
    createObservation({
      source: "test",
      type: "noise",
      priority: "low",
      confidence: 0.25,
      payload: { value: 2 },
    }),
  );

  assert.equal(memory.list().length, 1);
  assert.deepEqual(
    memory.listDecisions().map((decision) => decision.action),
    ["store", "discard"],
  );
});

test("state transitions are event-driven and can move between any states", async () => {
  const bus = new InMemoryObservationBus();
  const scheduler = new PandaScheduler(bus);
  const state = new StateTransitionEngine("perception", bus);
  scheduler.register(state);

  await state.requestTransition("execution", "urgent action");
  await bus.drain();
  await state.requestTransition("memory", "record result");
  await bus.drain();

  assert.equal(state.getCurrentState(), "memory");
  assert.deepEqual(
    state.getTransitions().map((transition) => `${transition.from}->${transition.to}`),
    ["perception->execution", "execution->memory"],
  );
});

test("action dispatcher routes actions to connector targets", async () => {
  const bus = new InMemoryObservationBus();
  const dispatcher = new ActionDispatcher();
  dispatcher.register(new FilesystemConnector(bus));

  const result = await dispatcher.dispatch(
    createAction({
      target: "filesystem",
      type: "filesystem.write",
      payload: { path: "tmp.txt", content: "ok" },
    }),
  );

  assert.equal(result.ok, true);
});
