import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { PrincipalReference } from "@panda/shared";

export const DEFAULT_PANDA_API_PRINCIPAL_ID = "panda-api-client";
export const MINIMUM_PANDA_API_TOKEN_LENGTH = 32;
export const DEFAULT_PANDA_ALLOWED_ORIGINS = Object.freeze([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const);
export const LOCAL_API_PRINCIPAL = Object.freeze({
  id: "panda-local",
  type: "system",
} as const satisfies PrincipalReference);

export interface PandaBearerAuthentication {
  readonly token: string;
  readonly principal: PrincipalReference;
}

export type PandaApiSecurityErrorCode =
  | "API_TOKEN_INVALID"
  | "API_PRINCIPAL_INVALID"
  | "CORS_ORIGIN_INVALID"
  | "UNAUTHENTICATED_NETWORK_EXPOSURE";

export class PandaApiSecurityError extends Error {
  constructor(
    readonly code: PandaApiSecurityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PandaApiSecurityError";
  }
}

export function bearerAuthenticationFromEnvironment(
  token: string | undefined,
  principalId: string | undefined,
): PandaBearerAuthentication | undefined {
  if (token === undefined) return undefined;
  return validateBearerAuthentication({
    token,
    principal: {
      id: principalId ?? DEFAULT_PANDA_API_PRINCIPAL_ID,
      type: "service",
    },
  });
}

export function validateBearerAuthentication(
  authentication: PandaBearerAuthentication,
): PandaBearerAuthentication {
  if (
    typeof authentication.token !== "string" ||
    authentication.token.trim() !== authentication.token ||
    authentication.token.length < MINIMUM_PANDA_API_TOKEN_LENGTH ||
    /\s/u.test(authentication.token)
  ) {
    throw new PandaApiSecurityError(
      "API_TOKEN_INVALID",
      `PANDA_API_TOKEN must contain at least ${MINIMUM_PANDA_API_TOKEN_LENGTH} non-whitespace characters with no surrounding whitespace.`,
    );
  }
  if (!isPrincipalReference(authentication.principal)) {
    throw new PandaApiSecurityError(
      "API_PRINCIPAL_INVALID",
      "The PANDA API principal must have a non-empty bounded identifier and a canonical principal type.",
    );
  }
  return {
    token: authentication.token,
    principal: { ...authentication.principal },
  };
}

export function allowedOriginsFromEnvironment(
  value: string | undefined,
): readonly string[] {
  return value === undefined
    ? DEFAULT_PANDA_ALLOWED_ORIGINS
    : normalizeAllowedOrigins(value.trim() === "" ? [] : value.split(","));
}

export function normalizeAllowedOrigins(
  origins: readonly string[],
): readonly string[] {
  const normalized = origins.map((origin) => normalizeOrigin(origin));
  return Object.freeze([...new Set(normalized)]);
}

export function authenticateBearerAuthorization(
  authorization: string | undefined,
  authentication: PandaBearerAuthentication,
): PrincipalReference | undefined {
  const match = authorization?.match(/^Bearer ([^\s]+)$/iu);
  if (match?.[1] === undefined) return undefined;
  return tokensEqual(match[1], authentication.token)
    ? authentication.principal
    : undefined;
}

export function assertSafeNetworkExposure(
  host: string,
  authentication: PandaBearerAuthentication | undefined,
): void {
  if (!isLoopbackHost(host) && authentication === undefined) {
    throw new PandaApiSecurityError(
      "UNAUTHENTICATED_NETWORK_EXPOSURE",
      `PANDA_HOST ${host} is not loopback. Configure PANDA_API_TOKEN before listening on a non-loopback interface.`,
    );
  }
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[(.*)\]$/u, "$1");
  if (normalized === "localhost" || normalized === "::1") return true;
  if (isIP(normalized) !== 4) return false;
  const firstOctet = Number(normalized.split(".")[0]);
  return firstOctet === 127;
}

function normalizeOrigin(origin: string): string {
  const value = origin.trim();
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      (parsed.pathname !== "" && parsed.pathname !== "/") ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new Error("not an HTTP origin");
    }
    return parsed.origin;
  } catch {
    throw new PandaApiSecurityError(
      "CORS_ORIGIN_INVALID",
      `PANDA_ALLOWED_ORIGINS entry ${JSON.stringify(value)} must be an HTTP(S) origin without credentials, path, query, or fragment.`,
    );
  }
}

function isPrincipalReference(value: unknown): value is PrincipalReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim() === candidate.id &&
    candidate.id.length > 0 &&
    candidate.id.length <= 128 &&
    !/[\u0000-\u001f\u007f]/u.test(candidate.id) &&
    (candidate.type === "human" ||
      candidate.type === "service" ||
      candidate.type === "system")
  );
}

function tokensEqual(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}
