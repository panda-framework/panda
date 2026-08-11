import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";
import { nowIso } from "@panda/shared";
import { V01PolicyEngine } from "./policy.js";

export interface EffectObservationRequest {
  readonly executionId: string;
  readonly goalId: string;
  readonly correlationId: string;
  readonly actionRequestId: string;
  readonly outcomeId: string;
  readonly relativePath: string;
}

export interface FilesystemEffectObservation {
  readonly status: "observed" | "missing" | "failed";
  readonly relativePath: string;
  readonly resolvedPath?: string;
  readonly exists: boolean;
  readonly content?: string;
  readonly byteCount: number;
  readonly contentHash?: string;
  readonly hashAlgorithm?: "sha256";
  readonly observedAt: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface EffectObserver {
  readonly id: string;
  observe(
    request: EffectObservationRequest,
    signal: AbortSignal,
  ): Promise<FilesystemEffectObservation>;
}

export interface FilesystemEffectObserverOptions {
  readonly policyEngine: V01PolicyEngine;
  readonly now?: () => string;
}

class ObservationBoundaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ObservationBoundaryError";
  }
}

/** Independent Phase 7 reader for the one v0.1 filesystem effect. */
export class FilesystemEffectObserver implements EffectObserver {
  readonly id = "filesystem-effect-observer";
  private readonly policyEngine: V01PolicyEngine;
  private readonly now: () => string;

  constructor(options: FilesystemEffectObserverOptions) {
    this.policyEngine = options.policyEngine;
    this.now = options.now ?? nowIso;
  }

  async observe(
    request: EffectObservationRequest,
    signal: AbortSignal,
  ): Promise<FilesystemEffectObservation> {
    let resolvedPath: string | undefined;
    let handle: FileHandle | undefined;
    try {
      throwIfAborted(signal);
      const workspace = this.policyEngine.workspaceFor(request.executionId);
      const segments = validateRelativePath(request.relativePath, workspace);
      resolvedPath = resolve(workspace, segments.join(sep));
      const pathStatus = await inspectPath(workspace, segments, signal);
      if (pathStatus === "missing") {
        return missingObservation(request.relativePath, resolvedPath, this.now());
      }

      const noFollow = constants.O_NOFOLLOW ?? 0;
      try {
        handle = await open(
          resolvedPath,
          constants.O_RDONLY | constants.O_NONBLOCK | noFollow,
        );
      } catch (error) {
        if (isMissingPathError(error)) {
          return missingObservation(
            request.relativePath,
            resolvedPath,
            this.now(),
          );
        }
        throw error;
      }
      const status = await handle.stat();
      if (!status.isFile() || status.nlink !== 1) {
        throw new ObservationBoundaryError(
          "OBSERVATION_TARGET_UNSAFE",
          "The observed target must be one regular file with no external aliases.",
        );
      }
      if (status.size > this.policyEngine.maxContentBytes) {
        throw new ObservationBoundaryError(
          "OBSERVATION_SIZE_EXCEEDED",
          `The observed file exceeds the ${this.policyEngine.maxContentBytes}-byte v0.1 limit.`,
        );
      }

      const bytes = await readBounded(
        handle,
        this.policyEngine.maxContentBytes,
        signal,
      );
      throwIfAborted(signal);
      await handle.close();
      handle = undefined;
      return {
        status: "observed",
        relativePath: request.relativePath,
        resolvedPath,
        exists: true,
        content: bytes.toString("utf8"),
        byteCount: bytes.byteLength,
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        hashAlgorithm: "sha256",
        observedAt: this.now(),
      };
    } catch (error) {
      if (signal.aborted) {
        throw abortError();
      }
      return {
        status: "failed",
        relativePath: request.relativePath,
        resolvedPath,
        exists: false,
        byteCount: 0,
        observedAt: this.now(),
        error: {
          code:
            error instanceof ObservationBoundaryError
              ? error.code
              : "FILESYSTEM_OBSERVATION_FAILED",
          message: describeError(error),
        },
      };
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
}

function validateRelativePath(
  requestedPath: string,
  workspace: string,
): readonly string[] {
  if (
    requestedPath.trim() === "" ||
    isAbsolute(requestedPath) ||
    win32.isAbsolute(requestedPath)
  ) {
    throw new ObservationBoundaryError(
      "OBSERVATION_PATH_INVALID",
      "The effect observation path must be a non-empty relative path.",
    );
  }
  const segments = requestedPath.split(/[\\/]+/);
  if (segments.some((segment) => segment === "..")) {
    throw new ObservationBoundaryError(
      "OBSERVATION_PATH_INVALID",
      "Filesystem traversal is not allowed during effect observation.",
    );
  }
  const normalized = segments.filter(
    (segment) => segment !== "" && segment !== ".",
  );
  const target = resolve(workspace, normalized.join(sep));
  const fromWorkspace = relative(workspace, target);
  if (
    normalized.length === 0 ||
    fromWorkspace === "" ||
    fromWorkspace === ".." ||
    fromWorkspace.startsWith(`..${sep}`) ||
    isAbsolute(fromWorkspace)
  ) {
    throw new ObservationBoundaryError(
      "OBSERVATION_PATH_INVALID",
      "The effect observation target must remain below the execution workspace.",
    );
  }
  return normalized;
}

async function inspectPath(
  workspace: string,
  segments: readonly string[],
  signal: AbortSignal,
): Promise<"present" | "missing"> {
  let current = workspace;
  for (const segment of [undefined, ...segments]) {
    throwIfAborted(signal);
    if (segment !== undefined) {
      current = resolve(current, segment);
    }
    try {
      const status = await lstat(current);
      if (status.isSymbolicLink() || (status.isFile() && status.nlink > 1)) {
        throw new ObservationBoundaryError(
          "OBSERVATION_PATH_UNSAFE",
          "Symbolic-link or multi-link filesystem observations are not allowed.",
        );
      }
    } catch (error) {
      if (isMissingPathError(error)) {
        return "missing";
      }
      throw error;
    }
  }
  return "present";
}

async function readBounded(
  handle: FileHandle,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let byteCount = 0;
  while (true) {
    throwIfAborted(signal);
    const chunk = Buffer.allocUnsafe(Math.min(8192, maximumBytes + 1));
    const result = await handle.read(chunk, 0, chunk.byteLength, null);
    if (result.bytesRead === 0) {
      return Buffer.concat(chunks, byteCount);
    }
    byteCount += result.bytesRead;
    if (byteCount > maximumBytes) {
      throw new ObservationBoundaryError(
        "OBSERVATION_SIZE_EXCEEDED",
        `The observed file exceeds the ${maximumBytes}-byte v0.1 limit.`,
      );
    }
    chunks.push(chunk.subarray(0, result.bytesRead));
  }
}

function missingObservation(
  relativePath: string,
  resolvedPath: string,
  observedAt: string,
): FilesystemEffectObservation {
  return {
    status: "missing",
    relativePath,
    resolvedPath,
    exists: false,
    byteCount: 0,
    observedAt,
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  const error = new Error("Filesystem effect observation was cancelled.");
  error.name = "AbortError";
  return error;
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ((error as NodeJS.ErrnoException).code === "ENOENT" ||
      (error as NodeJS.ErrnoException).code === "ENOTDIR")
  );
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Filesystem effect observation failed with a non-error value.";
}
