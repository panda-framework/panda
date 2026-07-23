import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { appendMessage, updateSessionState, type AgentRunContext } from "@panda/core";

const PandaAnnotation = Annotation.Root({
  session: Annotation<AgentRunContext["session"]>(),
  input: Annotation<string>(),
  notes: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

type PandaGraphState = typeof PandaAnnotation.State;

export function buildGraph() {
  return new StateGraph(PandaAnnotation)
    .addNode("perception", perceptionNode)
    .addNode("analysis", analysisNode)
    .addNode("network", networkNode)
    .addNode("decision", decisionNode)
    .addNode("action", actionNode)
    .addEdge(START, "perception")
    .addEdge("perception", "analysis")
    .addEdge("analysis", "network")
    .addEdge("network", "decision")
    .addEdge("decision", "action")
    .addEdge("action", END)
    .compile();
}

export async function runPandaLoop(context: AgentRunContext) {
  const graph = buildGraph();
  const result = await graph.invoke(context);
  return result as PandaGraphState;
}

async function perceptionNode(state: PandaGraphState): Promise<Partial<PandaGraphState>> {
  return {
    session: updateSessionState(state.session, "perception", "running"),
    notes: [`Perceived user input: ${state.input}`],
  };
}

async function analysisNode(state: PandaGraphState): Promise<Partial<PandaGraphState>> {
  return {
    session: updateSessionState(state.session, "analysis", "running"),
    notes: ["Analyzed context and available session history."],
  };
}

async function networkNode(state: PandaGraphState): Promise<Partial<PandaGraphState>> {
  return {
    session: updateSessionState(state.session, "network", "running"),
    notes: ["Checked local tools and extension points."],
  };
}

async function decisionNode(state: PandaGraphState): Promise<Partial<PandaGraphState>> {
  return {
    session: updateSessionState(state.session, "decision", "running"),
    notes: ["Selected the scaffold response path."],
  };
}

async function actionNode(state: PandaGraphState): Promise<Partial<PandaGraphState>> {
  const output = [
    "PANDA loop completed.",
    "",
    ...state.notes.map((note) => `- ${note}`),
  ].join("\n");

  return {
    session: updateSessionState(
      appendMessage(state.session, "assistant", output),
      "action",
      "completed",
    ),
    notes: ["Executed action and looped back conceptually to perception."],
  };
}
