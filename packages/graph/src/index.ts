import {
  appendMessage,
  PandaRuntime,
  updateSessionState,
  type AgentRunContext,
} from "@panda/core";

export function buildRuntime(): PandaRuntime {
  return new PandaRuntime();
}

export async function runPandaLoop(context: AgentRunContext) {
  const runtime = buildRuntime();

  await runtime.observe({
    source: "user",
    type: "user.input",
    payload: {
      sessionId: context.session.id,
      input: context.input,
    },
  });

  await runtime.state.requestTransition("understanding", "user input observed");
  await runtime.bus.drain();
  await runtime.state.requestTransition("planning", "context ready for planning");
  await runtime.bus.drain();
  await runtime.state.requestTransition("decision", "scheduler selected response action");
  await runtime.bus.drain();
  await runtime.state.requestTransition("execution", "dispatching response action");
  await runtime.bus.drain();
  await runtime.state.requestTransition("reflection", "recording result");
  await runtime.bus.drain();

  const notes = runtime.memory
    .listDecisions()
    .map((decision) => `${decision.action}: ${decision.reason}`);
  const output = [
    "PANDA runtime completed.",
    "",
    "Execution was driven by observations, scheduler dispatch, and state transition events.",
    ...notes.map((note) => `- ${note}`),
  ].join("\n");

  return {
    session: updateSessionState(
      appendMessage(context.session, "assistant", output),
      runtime.state.getCurrentState(),
      "completed",
    ),
    input: context.input,
    notes,
  };
}
