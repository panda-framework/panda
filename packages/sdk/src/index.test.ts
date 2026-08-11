import assert from "node:assert/strict";
import test from "node:test";
import { PandaClient, PandaRequestError } from "./index.js";

test("uses encoded canonical execution and trace endpoints", async (context) => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  context.mock.method(globalThis, "fetch", async (
    url: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    requests.push({ url: String(url), init });
    return Response.json(url.toString().endsWith("/trace") ? [] : []);
  });
  const client = new PandaClient({ baseUrl: "http://daemon.test/" });

  await client.listExecutions();
  await client.getExecution("exe/with space");
  await client.getExecutionTrace("exe/with space");

  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "http://daemon.test/executions",
      "http://daemon.test/executions/exe%2Fwith%20space",
      "http://daemon.test/executions/exe%2Fwith%20space/trace",
    ],
  );
});

test("posts the typed execution request", async (context) => {
  let request: { url: string; init?: RequestInit } | undefined;
  context.mock.method(globalThis, "fetch", async (
    url: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    request = { url: String(url), init };
    return Response.json({ executionId: "exe_sdk", status: "succeeded" });
  });
  const client = new PandaClient({ baseUrl: "http://daemon.test" });
  await client.createExecution({
    source: "sdk-test",
    payload: { path: "proof.txt", content: "sdk content" },
  });

  assert.equal(request?.url, "http://daemon.test/executions");
  assert.equal(request?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    source: "sdk-test",
    payload: { path: "proof.txt", content: "sdk content" },
  });
});

test("preserves structured daemon errors", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        error: {
          code: "EXECUTION_NOT_FOUND",
          message: "Execution exe_missing was not found.",
        },
      },
      { status: 404 },
    ),
  );

  await assert.rejects(
    () => new PandaClient().getExecution("exe_missing"),
    (error) => {
      assert.ok(error instanceof PandaRequestError);
      assert.equal(error.status, 404);
      assert.equal(error.detail.code, "EXECUTION_NOT_FOUND");
      return true;
    },
  );
});
