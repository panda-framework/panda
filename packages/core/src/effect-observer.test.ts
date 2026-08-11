import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FilesystemEffectObserver } from "./effect-observer.js";
import { V01PolicyEngine } from "./policy.js";

const fixedTime = "2026-08-10T17:00:00.000Z";

function request(executionId: string, relativePath = "proof.txt") {
  return {
    executionId,
    goalId: `goal_${executionId}`,
    correlationId: `corr_${executionId}`,
    actionRequestId: `act_${executionId}`,
    outcomeId: `out_${executionId}`,
    relativePath,
  };
}

test("observes exact bytes and hash independently", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-observer-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const workspace = engine.workspaceFor("exe_observed");
  await mkdir(join(workspace, "nested"), { recursive: true });
  await writeFile(
    join(workspace, "nested", "proof.txt"),
    "PANDA v0.1 completed",
    "utf8",
  );
  const observer = new FilesystemEffectObserver({
    policyEngine: engine,
    now: () => fixedTime,
  });

  const observed = await observer.observe(
    request("exe_observed", "nested/proof.txt"),
    new AbortController().signal,
  );

  assert.equal(observed.status, "observed");
  assert.equal(observed.exists, true);
  assert.equal(observed.content, "PANDA v0.1 completed");
  assert.equal(observed.byteCount, 20);
  assert.equal(observed.hashAlgorithm, "sha256");
  assert.equal(
    observed.contentHash,
    createHash("sha256").update("PANDA v0.1 completed").digest("hex"),
  );
  assert.equal(observed.observedAt, fixedTime);
});

test("reports missing files as observed absence", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-observer-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const observer = new FilesystemEffectObserver({
    policyEngine: new V01PolicyEngine({ dataDirectory: temporaryRoot }),
    now: () => fixedTime,
  });

  const observed = await observer.observe(
    request("exe_missing"),
    new AbortController().signal,
  );

  assert.equal(observed.status, "missing");
  assert.equal(observed.exists, false);
  assert.equal(observed.byteCount, 0);
  assert.equal(observed.error, undefined);
});

test("rejects traversal and symbolic-link observations", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-observer-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const engine = new V01PolicyEngine({ dataDirectory: temporaryRoot });
  const workspace = engine.workspaceFor("exe_unsafe_observation");
  const outside = join(temporaryRoot, "outside");
  await mkdir(workspace, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "proof.txt"), "outside", "utf8");
  await symlink(outside, join(workspace, "escape"), "dir");
  const observer = new FilesystemEffectObserver({ policyEngine: engine });

  const traversal = await observer.observe(
    request("exe_unsafe_observation", "../outside/proof.txt"),
    new AbortController().signal,
  );
  assert.equal(traversal.status, "failed");
  assert.equal(traversal.error?.code, "OBSERVATION_PATH_INVALID");

  const linked = await observer.observe(
    request("exe_unsafe_observation", "escape/proof.txt"),
    new AbortController().signal,
  );
  assert.equal(linked.status, "failed");
  assert.equal(linked.error?.code, "OBSERVATION_PATH_UNSAFE");
});

test("propagates cancellation instead of fabricating an observation", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "panda-observer-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const observer = new FilesystemEffectObserver({
    policyEngine: new V01PolicyEngine({ dataDirectory: temporaryRoot }),
  });
  const controller = new AbortController();
  controller.abort("test cancellation");

  await assert.rejects(
    observer.observe(request("exe_cancelled"), controller.signal),
    { name: "AbortError" },
  );
});
