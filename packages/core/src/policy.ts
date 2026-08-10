import { lstat } from "node:fs/promises";
import {
  isAbsolute,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import {
  createPolicyEvaluation,
  type ActionRequest,
  type ExecutionContext,
  type PandaExecution,
  type PolicyEvaluation,
  type PolicyEvaluationResult,
  type RecordProducer,
  type TransitionRequest,
} from "@panda/shared";

export const V01_TRANSITION_POLICY_ID = "panda.v0.1.transitions" as const;
export const V01_FILESYSTEM_POLICY_ID =
  "panda.v0.1.filesystem-write" as const;
export const DEFAULT_V01_MAX_CONTENT_BYTES = 65_536;

interface PolicyRequestIdentity {
  readonly executionId: string;
  readonly goalId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly producer: RecordProducer;
}

export interface TransitionPolicyRequest extends PolicyRequestIdentity {
  readonly point: "transition";
  readonly execution: PandaExecution;
  readonly transition: TransitionRequest;
}

export interface EffectPolicyRequest extends PolicyRequestIdentity {
  readonly point: "effect";
  readonly context: ExecutionContext;
  readonly actionRequest: ActionRequest;
}

export type PolicyRequest = TransitionPolicyRequest | EffectPolicyRequest;

export interface PolicyDecision {
  readonly policyId: string;
  readonly result: PolicyEvaluationResult;
  readonly reason: string;
  readonly inputs: Readonly<Record<string, unknown>>;
}

export interface PolicyEngine {
  evaluate(
    request: PolicyRequest,
    signal?: AbortSignal,
  ): Promise<PolicyDecision> | PolicyDecision;
}

export type PolicyEngineErrorCode =
  | "POLICY_DECISION_INVALID"
  | "POLICY_EVALUATION_ABORTED"
  | "POLICY_CONFIGURATION_INVALID";

export class PolicyEngineError extends Error {
  constructor(
    readonly code: PolicyEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PolicyEngineError";
  }
}

export interface EvaluatePolicyOptions {
  readonly now?: () => string;
  readonly signal?: AbortSignal;
}

/** Evaluates a replaceable policy and turns its decision into a canonical record. */
export async function evaluatePolicy(
  engine: PolicyEngine,
  request: PolicyRequest,
  options: EvaluatePolicyOptions = {},
): Promise<PolicyEvaluation> {
  throwIfAborted(options.signal);
  const decision = await engine.evaluate(request, options.signal);
  throwIfAborted(options.signal);
  assertPolicyDecision(decision);

  return createPolicyEvaluation({
    executionId: request.executionId,
    goalId: request.goalId,
    correlationId: request.correlationId,
    causationId: request.causationId,
    producer: request.producer,
    timestamp: options.now?.(),
    point: request.point,
    policyId: decision.policyId,
    result: decision.result,
    reason: decision.reason,
    inputs: decision.inputs,
  });
}

export interface V01PolicyEngineOptions {
  readonly dataDirectory?: string;
  readonly maxContentBytes?: number;
}

/** Deterministic Phase 5 policy for transitions and the sole v0.1 effect. */
export class V01PolicyEngine implements PolicyEngine {
  readonly dataDirectory: string;
  readonly maxContentBytes: number;

  constructor(options: V01PolicyEngineOptions = {}) {
    const maxContentBytes =
      options.maxContentBytes ?? DEFAULT_V01_MAX_CONTENT_BYTES;
    if (!Number.isSafeInteger(maxContentBytes) || maxContentBytes < 0) {
      throw new PolicyEngineError(
        "POLICY_CONFIGURATION_INVALID",
        "The v0.1 maximum content size must be a non-negative safe integer.",
      );
    }

    this.dataDirectory = resolve(options.dataDirectory ?? ".panda");
    this.maxContentBytes = maxContentBytes;
  }

  evaluate(
    request: PolicyRequest,
    signal?: AbortSignal,
  ): Promise<PolicyDecision> | PolicyDecision {
    throwIfAborted(signal);
    if (request.point === "transition") {
      return {
        policyId: V01_TRANSITION_POLICY_ID,
        result: "allow",
        reason:
          "The structurally valid capability-selected transition is allowed by the v0.1 profile.",
        inputs: {
          executionId: request.executionId,
          requestId: request.transition.id,
          sourceCapability: request.transition.sourceCapability,
          sourceInvocationId: request.transition.sourceInvocationId,
          nextStep: request.transition.nextStep,
        },
      };
    }

    return this.evaluateEffect(request, signal);
  }

  workspaceFor(executionId: string): string {
    if (!isExecutionIdentifier(executionId)) {
      throw new PolicyEngineError(
        "POLICY_CONFIGURATION_INVALID",
        `Execution identifier ${executionId} is not safe for workspace resolution.`,
      );
    }
    return resolve(this.dataDirectory, "runs", executionId, "workspace");
  }

  private async evaluateEffect(
    request: EffectPolicyRequest,
    signal?: AbortSignal,
  ): Promise<PolicyDecision> {
    const candidate = request.actionRequest;
    const baseInputs: Record<string, unknown> = {
      executionId: request.executionId,
      actionRequestId: candidate.id,
      actionType: candidate.actionType,
      target: candidate.target,
      connectorId: candidate.connectorId,
      maxContentBytes: this.maxContentBytes,
    };

    if (!isExecutionIdentifier(request.executionId)) {
      return deny(
        "The execution identifier is not safe for workspace resolution.",
        baseInputs,
      );
    }

    const workspaceRoot = this.workspaceFor(request.executionId);
    baseInputs.workspaceRoot = workspaceRoot;

    if (
      request.context.executionId !== request.executionId ||
      request.context.goalId !== request.goalId ||
      request.context.correlationId !== request.correlationId
    ) {
      return deny(
        "The policy context identity does not match the requested effect boundary.",
        baseInputs,
      );
    }

    if (
      candidate.executionId !== request.executionId ||
      candidate.goalId !== request.goalId ||
      candidate.correlationId !== request.correlationId
    ) {
      return deny(
        "The effect candidate identity does not match the active execution context.",
        baseInputs,
      );
    }

    if (candidate.actionType !== "filesystem.write") {
      return deny(
        "The v0.1 profile allows only filesystem.write effects.",
        baseInputs,
      );
    }
    if (candidate.connectorId !== "filesystem") {
      return deny(
        "The v0.1 filesystem effect must use the filesystem connector.",
        baseInputs,
      );
    }
    if (candidate.target !== "execution-workspace") {
      return deny(
        "The v0.1 filesystem effect must target the current execution workspace.",
        baseInputs,
      );
    }
    if (!isRecord(candidate.parameters)) {
      return deny("The filesystem parameters must be an object.", baseInputs);
    }

    const requestedPath = candidate.parameters.path;
    const content = candidate.parameters.content;
    const encoding = candidate.parameters.encoding;
    if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
      return deny("The filesystem path must be a non-empty string.", baseInputs);
    }
    baseInputs.relativePath = requestedPath;

    if (isAbsolute(requestedPath) || win32.isAbsolute(requestedPath)) {
      return deny("Absolute filesystem paths are not allowed.", baseInputs);
    }

    const segments = requestedPath.split(/[\\/]+/);
    if (segments.some((segment) => segment === "..")) {
      return deny("Filesystem traversal through .. is not allowed.", baseInputs);
    }

    if (typeof content !== "string" || encoding !== "utf8") {
      return deny(
        "The v0.1 filesystem effect requires UTF-8 string content.",
        baseInputs,
      );
    }

    const contentBytes = Buffer.byteLength(content, "utf8");
    baseInputs.contentBytes = contentBytes;
    if (contentBytes > this.maxContentBytes) {
      return deny(
        `The requested content exceeds the ${this.maxContentBytes}-byte v0.1 limit.`,
        baseInputs,
      );
    }

    const normalizedSegments = segments.filter(
      (segment) => segment !== "" && segment !== ".",
    );
    const resolvedTarget = resolve(workspaceRoot, normalizedSegments.join(sep));
    baseInputs.resolvedTarget = resolvedTarget;
    const fromWorkspace = relative(workspaceRoot, resolvedTarget);
    if (
      fromWorkspace === "" ||
      fromWorkspace === ".." ||
      fromWorkspace.startsWith(`..${sep}`) ||
      isAbsolute(fromWorkspace)
    ) {
      return deny(
        "The filesystem target must resolve to a file below the execution workspace.",
        baseInputs,
      );
    }

    throwIfAborted(signal);
    if (
      await containsUnsafeLink(
        this.dataDirectory,
        ["runs", request.executionId, "workspace", ...normalizedSegments],
        signal,
      )
    ) {
      return deny(
        "Symbolic-link or equivalent filesystem escapes are not allowed.",
        baseInputs,
      );
    }

    return {
      policyId: V01_FILESYSTEM_POLICY_ID,
      result: "allow",
      reason:
        "The exact filesystem.write candidate is contained within the execution workspace and satisfies the v0.1 resource limit.",
      inputs: baseInputs,
    };
  }
}

function deny(
  reason: string,
  inputs: Readonly<Record<string, unknown>>,
): PolicyDecision {
  return {
    policyId: V01_FILESYSTEM_POLICY_ID,
    result: "deny",
    reason,
    inputs,
  };
}

async function containsUnsafeLink(
  trustedPath: string,
  targetSegments: readonly string[],
  signal?: AbortSignal,
): Promise<boolean> {
  let current = trustedPath;
  for (const segment of [undefined, ...targetSegments]) {
    throwIfAborted(signal);
    if (segment !== undefined) {
      current = resolve(current, segment);
    }

    try {
      const status = await lstat(current);
      if (status.isSymbolicLink() || (status.isFile() && status.nlink > 1)) {
        return true;
      }
    } catch (error) {
      if (isMissingPathError(error)) {
        return false;
      }
      throw error;
    }
  }
  return false;
}

function assertPolicyDecision(value: unknown): asserts value is PolicyDecision {
  if (
    !isRecord(value) ||
    typeof value.policyId !== "string" ||
    value.policyId.trim() === "" ||
    (value.result !== "allow" &&
      value.result !== "deny" &&
      value.result !== "require") ||
    typeof value.reason !== "string" ||
    value.reason.trim() === "" ||
    !isRecord(value.inputs)
  ) {
    throw new PolicyEngineError(
      "POLICY_DECISION_INVALID",
      "A policy engine must return a policy ID, result, reason, and input details.",
    );
  }
}

function isExecutionIdentifier(value: string): boolean {
  return (
    value !== "." &&
    value !== ".." &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  throw new PolicyEngineError(
    "POLICY_EVALUATION_ABORTED",
    "Policy evaluation was cancelled.",
  );
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
