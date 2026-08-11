import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PANDA_ALLOWED_ORIGINS,
  PandaApiSecurityError,
  allowedOriginsFromEnvironment,
  assertSafeNetworkExposure,
  authenticateBearerAuthorization,
  bearerAuthenticationFromEnvironment,
  isLoopbackHost,
  normalizeAllowedOrigins,
} from "./api-security.js";

const token = "phase-13-test-token-with-32-characters";

test("creates one validated service principal without exposing the bearer token", () => {
  const authentication = bearerAuthenticationFromEnvironment(
    token,
    "release-operator",
  );
  assert.deepEqual(authentication?.principal, {
    id: "release-operator",
    type: "service",
  });
  assert.deepEqual(
    authenticateBearerAuthorization(`Bearer ${token}`, authentication!),
    authentication?.principal,
  );
  assert.equal(
    authenticateBearerAuthorization("Bearer incorrect-token", authentication!),
    undefined,
  );
  assert.equal(
    JSON.stringify(authentication?.principal).includes(token),
    false,
  );
});

test("rejects weak tokens and invalid principals without echoing the token", () => {
  assert.throws(
    () => bearerAuthenticationFromEnvironment("too-short", undefined),
    (error) => {
      assert.ok(error instanceof PandaApiSecurityError);
      assert.equal(error.code, "API_TOKEN_INVALID");
      assert.equal(error.message.includes("too-short"), false);
      return true;
    },
  );
  assert.throws(
    () => bearerAuthenticationFromEnvironment(token, " bad-principal "),
    (error) =>
      error instanceof PandaApiSecurityError &&
      error.code === "API_PRINCIPAL_INVALID",
  );
});

test("normalizes explicit CORS origins and retains safe local defaults", () => {
  assert.deepEqual(
    allowedOriginsFromEnvironment(undefined),
    DEFAULT_PANDA_ALLOWED_ORIGINS,
  );
  assert.deepEqual(
    normalizeAllowedOrigins([
      "https://console.example.test/",
      "https://console.example.test",
      "http://127.0.0.1:5173",
    ]),
    ["https://console.example.test", "http://127.0.0.1:5173"],
  );
  assert.deepEqual(allowedOriginsFromEnvironment(""), []);
  assert.throws(
    () => normalizeAllowedOrigins(["https://example.test/private"]),
    (error) =>
      error instanceof PandaApiSecurityError &&
      error.code === "CORS_ORIGIN_INVALID",
  );
});

test("allows loopback listeners and guards every non-loopback listener", () => {
  for (const host of ["localhost", "127.0.0.1", "127.42.0.8", "::1", "[::1]"]) {
    assert.equal(isLoopbackHost(host), true);
    assert.doesNotThrow(() => assertSafeNetworkExposure(host, undefined));
  }
  for (const host of ["0.0.0.0", "::", "192.168.1.4", "daemon.internal"]) {
    assert.equal(isLoopbackHost(host), false);
    assert.throws(
      () => assertSafeNetworkExposure(host, undefined),
      (error) =>
        error instanceof PandaApiSecurityError &&
        error.code === "UNAUTHENTICATED_NETWORK_EXPOSURE",
    );
  }
  const authentication = bearerAuthenticationFromEnvironment(token, undefined);
  assert.doesNotThrow(() =>
    assertSafeNetworkExposure("0.0.0.0", authentication),
  );
});
