import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, type FileHandle } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  createOutcome,
  nowIso,
  type ActionRequest,
  type ExecutionContext,
  type Outcome,
} from "@panda/shared";
import {
  V01PolicyEngine,
  V01_FILESYSTEM_POLICY_ID,
} from "./policy.js";

export interface ActionConnector {
  readonly id: string;
  readonly actionTypes: readonly string[];
  execute(
    request: ActionRequest,
    invocation: ActionConnectorInvocation,
  ): Promise<Outcome>;
}

export interface ActionConnectorInvocation {
  readonly id: string;
  readonly context: ExecutionContext;
  readonly signal: AbortSignal;
}

export type ActionConnectorRegistryErrorCode =
  | "ACTION_CONNECTOR_ALREADY_REGISTERED"
  | "ACTION_CONNECTOR_NOT_FOUND"
  | "ACTION_TYPE_UNSUPPORTED";

export class ActionConnectorRegistryError extends Error {
  constructor(
    readonly code: ActionConnectorRegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ActionConnectorRegistryError";
  }
}

export interface ActionConnectorRegistry {
  register(connector: ActionConnector): () => void;
  has(connectorId: string): boolean;
  list(): ActionConnector[];
  execute(
    request: ActionRequest,
    invocation: ActionConnectorInvocation,
  ): Promise<Outcome>;
}

export class InMemoryActionConnectorRegistry
  implements ActionConnectorRegistry
{
  private readonly connectors = new Map<string, ActionConnector>();

  register(connector: ActionConnector): () => void {
    if (this.connectors.has(connector.id)) {
      throw new ActionConnectorRegistryError(
        "ACTION_CONNECTOR_ALREADY_REGISTERED",
        `Action connector ${connector.id} is already registered.`,
      );
    }
    this.connectors.set(connector.id, connector);
    return () => {
      if (this.connectors.get(connector.id) === connector) {
        this.connectors.delete(connector.id);
      }
    };
  }

  has(connectorId: string): boolean {
    return this.connectors.has(connectorId);
  }

  list(): ActionConnector[] {
    return [...this.connectors.values()];
  }

  execute(
    request: ActionRequest,
    invocation: ActionConnectorInvocation,
  ): Promise<Outcome> {
    const connector = this.connectors.get(request.connectorId);
    if (connector === undefined) {
      throw new ActionConnectorRegistryError(
        "ACTION_CONNECTOR_NOT_FOUND",
        `Action connector ${request.connectorId} is not registered.`,
      );
    }
    if (!connector.actionTypes.includes(request.actionType)) {
      throw new ActionConnectorRegistryError(
        "ACTION_TYPE_UNSUPPORTED",
        `Action connector ${connector.id} does not support ${request.actionType}.`,
      );
    }
    return connector.execute(request, invocation);
  }
}

export interface FilesystemWriteOutcomeData {
  readonly relativePath?: string;
  readonly resolvedPath?: string;
  readonly bytesWritten: number;
  readonly contentHash?: string;
  readonly hashAlgorithm?: "sha256";
  readonly authorizationEvaluationId?: string;
  readonly boundaryPolicyId?: string;
}

export interface FilesystemActionConnectorOptions {
  readonly policyEngine: V01PolicyEngine;
  readonly now?: () => string;
}

class FilesystemBoundaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FilesystemBoundaryError";
  }
}

/** Canonical Phase 6 connector for the single v0.1 filesystem effect. */
export class FilesystemActionConnector implements ActionConnector {
  readonly id = "filesystem";
  readonly actionTypes = ["filesystem.write"] as const;
  private readonly policyEngine: V01PolicyEngine;
  private readonly now: () => string;

  constructor(options: FilesystemActionConnectorOptions) {
    this.policyEngine = options.policyEngine;
    this.now = options.now ?? nowIso;
  }

  async execute(
    request: ActionRequest,
    invocation: ActionConnectorInvocation,
  ): Promise<Outcome<FilesystemWriteOutcomeData>> {
    const { context, signal: externalSignal } = invocation;
    const startedAt = this.now();
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const forwardAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal.aborted) {
      forwardAbort();
    } else {
      externalSignal.addEventListener("abort", forwardAbort, { once: true });
    }
    if (
      request.timeoutMs !== undefined &&
      Number.isSafeInteger(request.timeoutMs) &&
      request.timeoutMs > 0
    ) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort("action-timeout");
      }, request.timeoutMs);
    }

    let handle: FileHandle | undefined;
    let bytesWritten = 0;
    let effectPossible = false;
    let allBytesWritten = false;
    let relativePath: string | undefined;
    let resolvedPath: string | undefined;
    let contentHash: string | undefined;

    try {
      throwIfAborted(controller.signal);
      this.validateAuthorization(request);
      validateTimeout(request.timeoutMs);
      const firstBoundary = await this.policyEngine.evaluate(
        effectPolicyRequest(request, context),
        controller.signal,
      );
      if (firstBoundary.result !== "allow") {
        throw new FilesystemBoundaryError(
          "FILESYSTEM_BOUNDARY_DENIED",
          firstBoundary.reason,
        );
      }

      const parameters = requireFilesystemParameters(request.parameters);
      relativePath = parameters.path;
      const pathSegments = relativePath
        .split(/[\\/]+/)
        .filter((segment) => segment !== "" && segment !== ".");
      const parentSegments = pathSegments.slice(0, -1);
      await ensureManagedDirectories(
        this.policyEngine.dataDirectory,
        ["runs", request.executionId, "workspace", ...parentSegments],
        controller.signal,
      );

      const secondBoundary = await this.policyEngine.evaluate(
        effectPolicyRequest(request, context),
        controller.signal,
      );
      if (secondBoundary.result !== "allow") {
        throw new FilesystemBoundaryError(
          "FILESYSTEM_BOUNDARY_CHANGED",
          secondBoundary.reason,
        );
      }

      const workspace = this.policyEngine.workspaceFor(request.executionId);
      resolvedPath = resolve(workspace, pathSegments.join(sep));
      const content = Buffer.from(parameters.content, "utf8");
      contentHash = createHash("sha256").update(content).digest("hex");
      throwIfAborted(controller.signal);

      const noFollow = constants.O_NOFOLLOW ?? 0;
      handle = await open(
        resolvedPath,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_NONBLOCK |
          noFollow,
        0o600,
      );
      // O_CREAT may already have created a directory entry. From this point on,
      // any error must conservatively acknowledge a possible external effect.
      effectPossible = true;
      const status = await handle.stat();
      if (!status.isFile() || status.nlink !== 1) {
        throw new FilesystemBoundaryError(
          "FILESYSTEM_TARGET_NOT_REGULAR",
          "The opened target must be one regular file with no external aliases.",
        );
      }

      await handle.truncate(0);
      while (bytesWritten < content.byteLength) {
        throwIfAborted(controller.signal);
        const result = await handle.write(
          content,
          bytesWritten,
          content.byteLength - bytesWritten,
          bytesWritten,
        );
        if (result.bytesWritten <= 0) {
          throw new Error("The filesystem write made no forward progress.");
        }
        bytesWritten += result.bytesWritten;
      }
      allBytesWritten = true;
      await handle.sync();
      throwIfAborted(controller.signal);
      await handle.close();
      handle = undefined;

      return createOutcome({
        executionId: request.executionId,
        goalId: request.goalId,
        correlationId: request.correlationId,
        causationId: invocation.id,
        producer: { kind: "connector", connectorId: this.id },
        timestamp: this.now(),
        actionRequestId: request.id,
        status: "succeeded",
        effectStatus: "completed",
        startedAt,
        endedAt: this.now(),
        data: {
          relativePath,
          resolvedPath,
          bytesWritten,
          contentHash,
          hashAlgorithm: "sha256",
          authorizationEvaluationId: request.authorization?.evaluationId,
          boundaryPolicyId: V01_FILESYSTEM_POLICY_ID,
        },
      });
    } catch (error) {
      const aborted = controller.signal.aborted;
      const status = aborted
        ? timedOut
          ? "timeout"
          : "cancelled"
        : error instanceof FilesystemBoundaryError
          ? "rejected"
          : effectPossible
            ? allBytesWritten
              ? "indeterminate"
              : "partial"
            : "failed";
      const effectStatus = effectPossible
        ? allBytesWritten
          ? "unknown"
          : "partial"
        : "none";
      return createOutcome({
        executionId: request.executionId,
        goalId: request.goalId,
        correlationId: request.correlationId,
        causationId: invocation.id,
        producer: { kind: "connector", connectorId: this.id },
        timestamp: this.now(),
        actionRequestId: request.id,
        status,
        effectStatus,
        startedAt,
        endedAt: this.now(),
        data: {
          relativePath,
          resolvedPath,
          bytesWritten,
          contentHash,
          hashAlgorithm: contentHash === undefined ? undefined : "sha256",
          authorizationEvaluationId: request.authorization?.evaluationId,
          boundaryPolicyId: V01_FILESYSTEM_POLICY_ID,
        },
        error: {
          code:
            error instanceof FilesystemBoundaryError
              ? error.code
              : aborted
                ? timedOut
                  ? "ACTION_TIMEOUT"
                  : "ACTION_CANCELLED"
                : "FILESYSTEM_WRITE_FAILED",
          message: describeError(error),
        },
      });
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      externalSignal.removeEventListener("abort", forwardAbort);
      await handle?.close().catch(() => undefined);
    }
  }

  private validateAuthorization(request: ActionRequest): void {
    if (
      request.authorization?.policyId !== V01_FILESYSTEM_POLICY_ID ||
      typeof request.authorization.evaluationId !== "string" ||
      request.authorization.evaluationId.trim() === ""
    ) {
      throw new FilesystemBoundaryError(
        "ACTION_AUTHORIZATION_REQUIRED",
        "The filesystem connector requires the exact v0.1 policy authorization.",
      );
    }
  }
}

async function ensureManagedDirectories(
  dataDirectory: string,
  segments: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  await requireRealDirectory(dataDirectory);

  let current = dataDirectory;
  for (const segment of segments) {
    throwIfAborted(signal);
    current = resolve(current, segment);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
    await requireRealDirectory(current);
  }
}

async function requireRealDirectory(path: string): Promise<void> {
  const status = await lstat(path);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new FilesystemBoundaryError(
      "FILESYSTEM_DIRECTORY_UNSAFE",
      `Managed workspace path ${path} must be a real directory.`,
    );
  }
}

function effectPolicyRequest(
  request: ActionRequest,
  context: ExecutionContext,
) {
  return {
    point: "effect" as const,
    executionId: request.executionId,
    goalId: request.goalId,
    correlationId: request.correlationId,
    causationId: request.id,
    producer: { kind: "connector", connectorId: request.connectorId } as const,
    context,
    actionRequest: request,
  };
}

function requireFilesystemParameters(value: unknown): {
  readonly path: string;
  readonly content: string;
  readonly encoding: "utf8";
} {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.content !== "string" ||
    value.encoding !== "utf8"
  ) {
    throw new FilesystemBoundaryError(
      "FILESYSTEM_PARAMETERS_INVALID",
      "The filesystem connector requires path and UTF-8 string content.",
    );
  }
  return value as {
    readonly path: string;
    readonly content: string;
    readonly encoding: "utf8";
  };
}

function validateTimeout(timeoutMs: number | undefined): void {
  if (
    timeoutMs !== undefined &&
    (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
  ) {
    throw new FilesystemBoundaryError(
      "ACTION_TIMEOUT_INVALID",
      "The filesystem connector timeout must be a positive safe integer.",
    );
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error("Filesystem action execution was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Filesystem action failed with a non-error value.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
