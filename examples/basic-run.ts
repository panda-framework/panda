import { PandaClient } from "@panda/sdk";

const client = new PandaClient({ baseUrl: process.env.PANDA_BASE_URL });
const execution = await client.createExecution({
  source: "basic-example",
  payload: {
    path: "proof.txt",
    content: "PANDA v0.1 completed",
  },
});
const trace = await client.getExecutionTrace(execution.executionId);

console.log({
  executionId: execution.executionId,
  status: execution.status,
  goal: execution.goal.objective,
  terminalOutcome: execution.execution.terminalOutcome,
  traceRecords: trace.length,
});
