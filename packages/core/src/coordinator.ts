import {
  PANDA_CAPABILITIES,
  createExecutionContext,
  createFailure,
  createId,
  createTraceRecord,
  createTransitionRecord,
  createTransitionRequest,
  nowIso,
  type ExecutionContext,
  type Failure,
  type FailureCategory,
  type NextStep,
  type PandaCapability,
  type PandaExecution,
  type RecordProducer,
  type TerminalOutcome,
  type TransitionRecord,
  type TransitionRequest,
} from "@panda/shared";
import type { ExecutionStore, StoredTraceRecord } from "./execution-store.js";

export interface CapabilityInvocation<TInput = unknown> {
  readonly context: ExecutionContext;
  readonly input: TInput;
  readonly signal: AbortSignal;
}

export interface CapabilityResult<TOutput = unknown> {
  readonly output: TOutput;
  readonly nextStep: NextStep;
}

export interface CapabilityImplementation<TInput = unknown, TOutput = unknown> {
  readonly capability: PandaCapability;
  invoke(
    invocation: CapabilityInvocation<TInput>,
  ): Promise<CapabilityResult<TOutput>> | CapabilityResult<TOutput>;
}

export type CapabilityRegistryErrorCode =
  | "CAPABILITY_ALREADY_REGISTERED"
  | "CAPABILITY_INVALID"
  | "CAPABILITY_NOT_FOUND";

export class CapabilityRegistryError extends Error {
  constructor(
    readonly code: CapabilityRegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CapabilityRegistryError";
  }
}

export interface CapabilityRegistry {
  register<TInput = unknown, TOutput = unknown>(
    implementation: CapabilityImplementation<TInput, TOutput>,
  ): () => void;
  has(capability: PandaCapability): boolean;
  list(): CapabilityImplementation[];
  invoke<TInput = unknown, TOutput = unknown>(
    capability: PandaCapability,
    invocation: CapabilityInvocation<TInput>,
  ): Promise<CapabilityResult<TOutput>>;
}

export class InMemoryCapabilityRegistry implements CapabilityRegistry {
  private readonly implementations = new Map<
    PandaCapability,
    CapabilityImplementation
  >();

  register<TInput = unknown, TOutput = unknown>(
    implementation: CapabilityImplementation<TInput, TOutput>,
  ): () => void {
    if (!isPandaCapability(implementation.capability)) {
      throw new CapabilityRegistryError(
        "CAPABILITY_INVALID",
        `Capability ${String(implementation.capability)} is not a canonical PANDA capability.`,
      );
    }

    if (this.implementations.has(implementation.capability)) {
      throw new CapabilityRegistryError(
        "CAPABILITY_ALREADY_REGISTERED",
        `Capability ${implementation.capability} is already registered.`,
      );
    }

    const registered = implementation as unknown as CapabilityImplementation;
    this.implementations.set(implementation.capability, registered);
    return () => {
      if (this.implementations.get(implementation.capability) === registered) {
        this.implementations.delete(implementation.capability);
      }
    };
  }

  has(capability: PandaCapability): boolean {
    return this.implementations.has(capability);
  }

  list(): CapabilityImplementation[] {
    return [...this.implementations.values()];
  }

  async invoke<TInput = unknown, TOutput = unknown>(
    capability: PandaCapability,
    invocation: CapabilityInvocation<TInput>,
  ): Promise<CapabilityResult<TOutput>> {
    const implementation = this.implementations.get(capability);
    if (implementation === undefined) {
      throw new CapabilityRegistryError(
        "CAPABILITY_NOT_FOUND",
        `Capability ${capability} is not registered.`,
      );
    }

    return implementation.invoke(
      invocation as CapabilityInvocation,
    ) as Promise<CapabilityResult<TOutput>> | CapabilityResult<TOutput>;
  }
}

export type ExecutionCoordinatorErrorCode =
  | "EXECUTION_NOT_FOUND"
  | "EXECUTION_TERMINAL"
  | "EXECUTION_ALREADY_COORDINATING"
  | "STALE_EXECUTION"
  | "INVALID_MAX_INVOCATIONS"
  | "INVALID_DEADLINE";

export class ExecutionCoordinatorError extends Error {
  constructor(
    readonly code: ExecutionCoordinatorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionCoordinatorError";
  }
}

export interface ExecutionCoordinatorOptions {
  readonly maxInvocations?: number;
  readonly component?: string;
  readonly now?: () => string;
}

export interface CoordinateExecutionInput {
  readonly executionId: string;
  readonly input: unknown;
  readonly signal?: AbortSignal;
  readonly causationId?: string;
  readonly expectedUpdatedAt?: string;
  readonly contextValues?: Readonly<Record<string, unknown>>;
}

export interface CoordinationResult {
  readonly execution: PandaExecution;
  readonly invocationCount: number;
  readonly lastOutput?: unknown;
  readonly failure?: Failure;
}

interface CapabilityInvocationTrace {
  readonly invocationId: string;
  readonly capability: PandaCapability;
  readonly phase: "started" | "completed";
  readonly contextId: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly nextStep?: NextStep;
}

interface BoundaryFailure {
  readonly category: FailureCategory;
  readonly code: string;
  readonly message: string;
  readonly outcome: TerminalOutcome;
}

class InvocationBoundaryError extends Error {
  constructor(readonly failure: BoundaryFailure) {
    super(failure.message);
    this.name = "InvocationBoundaryError";
  }
}

const DEFAULT_MAX_INVOCATIONS = 100;
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

/**
 * Execution-scoped Phase 3 coordinator. Routing comes exclusively from the
 * capability result's NextStep; the coordinator contains no scenario route.
 */
export class ExecutionCoordinator {
  private readonly maxInvocations: number;
  private readonly component: string;
  private readonly now: () => string;
  private readonly activeExecutions = new Set<string>();

  constructor(
    private readonly store: ExecutionStore,
    private readonly registry: CapabilityRegistry,
    options: ExecutionCoordinatorOptions = {},
  ) {
    const maxInvocations = options.maxInvocations ?? DEFAULT_MAX_INVOCATIONS;
    if (!Number.isSafeInteger(maxInvocations) || maxInvocations < 1) {
      throw new ExecutionCoordinatorError(
        "INVALID_MAX_INVOCATIONS",
        "The invocation limit must be a positive safe integer.",
      );
    }

    this.maxInvocations = maxInvocations;
    this.component = options.component ?? "execution-coordinator";
    this.now = options.now ?? nowIso;
  }

  async run(input: CoordinateExecutionInput): Promise<CoordinationResult> {
    if (this.activeExecutions.has(input.executionId)) {
      throw new ExecutionCoordinatorError(
        "EXECUTION_ALREADY_COORDINATING",
        `Execution ${input.executionId} is already being coordinated by this coordinator.`,
      );
    }

    this.activeExecutions.add(input.executionId);
    try {
      return await this.runOwned(input);
    } finally {
      this.activeExecutions.delete(input.executionId);
    }
  }

  private async runOwned(
    input: CoordinateExecutionInput,
  ): Promise<CoordinationResult> {
    let execution = this.store.getExecution(input.executionId);
    if (execution === undefined) {
      throw new ExecutionCoordinatorError(
        "EXECUTION_NOT_FOUND",
        `Execution ${input.executionId} does not exist.`,
      );
    }

    if (TERMINAL_STATUSES.has(execution.status)) {
      throw new ExecutionCoordinatorError(
        "EXECUTION_TERMINAL",
        `Execution ${input.executionId} is already ${execution.status}.`,
      );
    }

    if (
      input.expectedUpdatedAt !== undefined &&
      execution.updatedAt !== input.expectedUpdatedAt
    ) {
      throw new ExecutionCoordinatorError(
        "STALE_EXECUTION",
        `Execution ${input.executionId} changed after the caller read it.`,
      );
    }

    this.validateDeadline(execution.deadline);

    const initialBoundary = this.currentBoundaryFailure(
      execution.deadline,
      input.signal,
    );
    if (initialBoundary !== undefined) {
      return this.failExecution(execution, initialBoundary, undefined, 0);
    }

    const startedAt = execution.startedAt ?? this.now();
    execution = this.store.updateExecution({
      ...execution,
      status: "running",
      startedAt,
      updatedAt: this.now(),
      statusReason: undefined,
    });

    const existingTrace = this.store.getTrace(execution.executionId);
    let capabilityInput = input.input;
    let causationId = input.causationId ?? existingTrace.at(-1)?.id;
    const invocationHistory = existingTrace
      .filter((record) => record.type === "capability.started")
      .flatMap((record) => invocationIdFromTrace(record.payload));
    let invocationCount = 0;
    let lastOutput: unknown;

    while (true) {
      const boundary = this.currentBoundaryFailure(
        execution.deadline,
        input.signal,
      );
      if (boundary !== undefined) {
        return this.failExecution(
          execution,
          boundary,
          causationId,
          invocationCount,
          lastOutput,
        );
      }

      const capability = execution.activeCapability;
      if (capability === undefined) {
        return this.failExecution(
          execution,
          {
            category: "invalid-contract",
            code: "ACTIVE_CAPABILITY_REQUIRED",
            message: "A non-terminal execution must select an active capability.",
            outcome: "failed",
          },
          causationId,
          invocationCount,
          lastOutput,
        );
      }

      if (!this.registry.has(capability)) {
        return this.failExecution(
          execution,
          this.unknownCapabilityFailure(capability),
          causationId,
          invocationCount,
          lastOutput,
        );
      }

      const invocationId = createId("inv");
      const context = createExecutionContext({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId,
        producer: this.runtimeProducer,
        invocationId,
        activeCapability: capability,
        deadline: execution.deadline,
        invocationHistory: [...invocationHistory],
        values: input.contextValues ?? {},
      });
      const invocationStarted = this.appendInvocationTrace(
        execution,
        context,
        capability,
        invocationId,
        "started",
        causationId,
        { input: capabilityInput },
      );
      invocationCount += 1;

      let result: CapabilityResult;
      try {
        result = await this.invokeWithinBounds(
          capability,
          context,
          capabilityInput,
          execution.deadline,
          input.signal,
        );
      } catch (error) {
        this.assertFresh(execution);
        if (error instanceof InvocationBoundaryError) {
          return this.failExecution(
            execution,
            error.failure,
            invocationStarted.id,
            invocationCount,
            lastOutput,
          );
        }

        return this.failExecution(
          execution,
          {
            category: capability,
            code: "CAPABILITY_INVOCATION_FAILED",
            message: describeError(error),
            outcome: "failed",
          },
          invocationStarted.id,
          invocationCount,
          lastOutput,
          capability,
          error,
        );
      }

      let nextStep: NextStep;
      try {
        nextStep = validateNextStep(result?.nextStep);
      } catch (error) {
        this.assertFresh(execution);
        if (error instanceof InvocationBoundaryError) {
          return this.failExecution(
            execution,
            error.failure,
            invocationStarted.id,
            invocationCount,
            lastOutput,
            capability,
          );
        }
        throw error;
      }
      lastOutput = result?.output;
      const invocationCompleted = this.appendInvocationTrace(
        execution,
        context,
        capability,
        invocationId,
        "completed",
        invocationStarted.id,
        { output: lastOutput, nextStep },
      );
      invocationHistory.push(invocationId);

      const request = createTransitionRequest({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId: invocationCompleted.id,
        producer: { kind: "capability", capability },
        sourceCapability: capability,
        sourceInvocationId: invocationId,
        triggerId: invocationCompleted.id,
        nextStep,
      });
      const requestTrace = this.store.appendTrace(
        createTraceRecord({
          executionId: execution.executionId,
          goalId: execution.goalId,
          correlationId: execution.correlationId,
          causationId: invocationCompleted.id,
          producer: { kind: "capability", capability },
          category: "transition",
          type: "transition.requested",
          payload: request,
        }),
      );

      const current = this.store.getExecution(execution.executionId);
      if (current === undefined || !sameExecutionState(execution, current)) {
        this.recordTransition(
          execution,
          request,
          requestTrace.id,
          "rejected",
          "The execution changed after the capability invocation started.",
        );
        throw new ExecutionCoordinatorError(
          "STALE_EXECUTION",
          `Execution ${execution.executionId} changed during capability invocation ${invocationId}.`,
        );
      }

      if (nextStep.kind === "invoke" && !this.registry.has(nextStep.target)) {
        const rejected = this.recordTransition(
          execution,
          request,
          requestTrace.id,
          "rejected",
          `Capability ${nextStep.target} is not registered.`,
        );
        return this.failExecution(
          execution,
          this.unknownCapabilityFailure(nextStep.target),
          rejected.id,
          invocationCount,
          lastOutput,
        );
      }

      if (nextStep.kind === "invoke" && invocationCount >= this.maxInvocations) {
        const rejected = this.recordTransition(
          execution,
          request,
          requestTrace.id,
          "rejected",
          `The invocation limit of ${this.maxInvocations} was reached.`,
        );
        return this.failExecution(
          execution,
          {
            category: "internal-runtime",
            code: "INVOCATION_LIMIT_REACHED",
            message: `Execution stopped after ${invocationCount} capability invocations.`,
            outcome: "failed",
          },
          rejected.id,
          invocationCount,
          lastOutput,
        );
      }

      const committed = this.recordTransition(
        execution,
        request,
        requestTrace.id,
        "committed",
      );

      if (nextStep.kind === "invoke") {
        execution = this.store.updateExecution({
          ...execution,
          status: "running",
          activeCapability: nextStep.target,
          updatedAt: this.now(),
          statusReason: nextStep.reason,
        });
        capabilityInput = lastOutput;
        causationId = committed.id;
        continue;
      }

      if (nextStep.kind === "wait") {
        this.store.appendTrace(
          createTraceRecord({
            executionId: execution.executionId,
            goalId: execution.goalId,
            correlationId: execution.correlationId,
            causationId: committed.id,
            producer: this.runtimeProducer,
            category: "wait",
            type: "execution.waiting",
            payload: nextStep,
          }),
        );
        execution = this.store.updateExecution({
          ...execution,
          status: "waiting",
          updatedAt: this.now(),
          statusReason: nextStep.reason,
        });
        return {
          execution,
          invocationCount,
          lastOutput,
        };
      }

      this.store.appendTrace(
        createTraceRecord({
          executionId: execution.executionId,
          goalId: execution.goalId,
          correlationId: execution.correlationId,
          causationId: committed.id,
          producer: this.runtimeProducer,
          category: "termination",
          type: `execution.${nextStep.outcome}`,
          payload: nextStep,
        }),
      );
      execution = this.store.updateExecution({
        ...execution,
        status: nextStep.outcome,
        activeCapability: undefined,
        terminalOutcome: nextStep.outcome,
        updatedAt: this.now(),
        statusReason: nextStep.reason,
      });
      return {
        execution,
        invocationCount,
        lastOutput,
      };
    }
  }

  private get runtimeProducer(): RecordProducer {
    return { kind: "runtime", component: this.component };
  }

  private appendInvocationTrace(
    execution: PandaExecution,
    context: ExecutionContext,
    capability: PandaCapability,
    invocationId: string,
    phase: CapabilityInvocationTrace["phase"],
    causationId: string | undefined,
    detail: Pick<CapabilityInvocationTrace, "input" | "output" | "nextStep">,
  ): StoredTraceRecord<CapabilityInvocationTrace> {
    return this.store.appendTrace(
      createTraceRecord({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId,
        producer:
          phase === "started"
            ? this.runtimeProducer
            : { kind: "capability", capability },
        category: "capability-invocation",
        type: `capability.${phase}`,
        payload: {
          invocationId,
          capability,
          phase,
          contextId: context.id,
          ...detail,
        },
      }),
    );
  }

  private recordTransition(
    execution: PandaExecution,
    request: TransitionRequest,
    causationId: string,
    status: TransitionRecord["status"],
    rejectionReason?: string,
  ): StoredTraceRecord<TransitionRecord> {
    const transition = createTransitionRecord({
      executionId: execution.executionId,
      goalId: execution.goalId,
      correlationId: execution.correlationId,
      causationId,
      producer: this.runtimeProducer,
      requestId: request.id,
      sourceCapability: request.sourceCapability,
      sourceInvocationId: request.sourceInvocationId,
      triggerId: request.triggerId,
      nextStep: request.nextStep,
      status,
      rejectionReason,
    });

    return this.store.appendTrace(
      createTraceRecord({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId,
        producer: this.runtimeProducer,
        category: "transition",
        type: `transition.${status}`,
        payload: transition,
      }),
    );
  }

  private async invokeWithinBounds(
    capability: PandaCapability,
    context: ExecutionContext,
    input: unknown,
    deadline: string | undefined,
    externalSignal: AbortSignal | undefined,
  ): Promise<CapabilityResult> {
    const controller = new AbortController();
    const deadlineMs = deadline === undefined ? undefined : Date.parse(deadline);
    const remainingMs =
      deadlineMs === undefined ? undefined : deadlineMs - Date.parse(this.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const forwardCancellation = () => controller.abort(externalSignal?.reason);

    if (externalSignal?.aborted) {
      throw new InvocationBoundaryError(this.cancellationFailure());
    }
    externalSignal?.addEventListener("abort", forwardCancellation, { once: true });

    if (remainingMs !== undefined) {
      if (remainingMs <= 0) {
        externalSignal?.removeEventListener("abort", forwardCancellation);
        throw new InvocationBoundaryError(this.deadlineFailure());
      }
      timer = setTimeout(() => controller.abort("deadline"), remainingMs);
    }

    const boundaryPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          reject(
            new InvocationBoundaryError(
              externalSignal?.aborted
                ? this.cancellationFailure()
                : this.deadlineFailure(),
            ),
          );
        },
        { once: true },
      );
    });

    try {
      const invocationPromise = Promise.resolve(
        this.registry.invoke(capability, {
          context,
          input,
          signal: controller.signal,
        }),
      );
      return await Promise.race([invocationPromise, boundaryPromise]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      externalSignal?.removeEventListener("abort", forwardCancellation);
    }
  }

  private validateDeadline(deadline: string | undefined): void {
    if (deadline !== undefined && Number.isNaN(Date.parse(deadline))) {
      throw new ExecutionCoordinatorError(
        "INVALID_DEADLINE",
        `Execution deadline ${deadline} is not a valid timestamp.`,
      );
    }
  }

  private currentBoundaryFailure(
    deadline: string | undefined,
    signal: AbortSignal | undefined,
  ): BoundaryFailure | undefined {
    if (signal?.aborted) {
      return this.cancellationFailure();
    }
    if (deadline !== undefined && Date.parse(this.now()) >= Date.parse(deadline)) {
      return this.deadlineFailure();
    }
    return undefined;
  }

  private cancellationFailure(): BoundaryFailure {
    return {
      category: "cancellation",
      code: "COORDINATION_CANCELLED",
      message: "Execution coordination was cancelled.",
      outcome: "cancelled",
    };
  }

  private deadlineFailure(): BoundaryFailure {
    return {
      category: "timeout",
      code: "EXECUTION_DEADLINE_EXCEEDED",
      message: "The execution deadline was exceeded.",
      outcome: "failed",
    };
  }

  private unknownCapabilityFailure(capability: string): BoundaryFailure {
    return {
      category: "invalid-contract",
      code: "CAPABILITY_NOT_REGISTERED",
      message: `Capability ${capability} is not registered.`,
      outcome: "failed",
    };
  }

  private assertFresh(expected: PandaExecution): void {
    const current = this.store.getExecution(expected.executionId);
    if (current === undefined || !sameExecutionState(expected, current)) {
      throw new ExecutionCoordinatorError(
        "STALE_EXECUTION",
        `Execution ${expected.executionId} changed while its capability was running.`,
      );
    }
  }

  private failExecution(
    execution: PandaExecution,
    boundary: BoundaryFailure,
    causationId: string | undefined,
    invocationCount: number,
    lastOutput?: unknown,
    capability?: PandaCapability,
    cause?: unknown,
  ): CoordinationResult {
    const producer: RecordProducer = capability
      ? { kind: "capability", capability }
      : this.runtimeProducer;
    const failure = createFailure({
      executionId: execution.executionId,
      goalId: execution.goalId,
      correlationId: execution.correlationId,
      causationId,
      producer,
      category: boundary.category,
      failedOperation:
        capability === undefined ? "execution.coordinate" : "capability.invoke",
      code: boundary.code,
      message: boundary.message,
      retryable: false,
      cause:
        cause === undefined
          ? undefined
          : {
              code: cause instanceof Error ? cause.name : undefined,
              message: describeError(cause),
            },
      evidence: [],
      effectStatus: "none",
    });
    const failureTrace = this.store.appendTrace(
      createTraceRecord({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId,
        producer,
        category: "failure",
        type: `failure.${boundary.code.toLowerCase()}`,
        payload: failure,
      }),
    );
    this.store.appendTrace(
      createTraceRecord({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId: failureTrace.id,
        producer: this.runtimeProducer,
        category: "termination",
        type: `execution.${boundary.outcome}`,
        payload: {
          outcome: boundary.outcome,
          reason: boundary.message,
          failureId: failure.id,
        },
      }),
    );
    const failedExecution = this.store.updateExecution({
      ...execution,
      status: boundary.outcome,
      activeCapability: undefined,
      terminalOutcome: boundary.outcome,
      updatedAt: this.now(),
      statusReason: boundary.message,
    });

    return {
      execution: failedExecution,
      invocationCount,
      lastOutput,
      failure,
    };
  }
}

function validateNextStep(value: unknown): NextStep {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    throw new InvocationBoundaryError({
      category: "invalid-contract",
      code: "INVALID_NEXT_STEP",
      message: "A capability must return a structured next step.",
      outcome: "failed",
    });
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.reason !== "string" || candidate.reason.trim() === "") {
    throw new InvocationBoundaryError({
      category: "invalid-contract",
      code: "INVALID_NEXT_STEP",
      message: "A capability next step must include a reason.",
      outcome: "failed",
    });
  }

  if (
    candidate.kind === "invoke" &&
    typeof candidate.target === "string" &&
    candidate.target.trim() !== "" &&
    (candidate.payloadRef === undefined ||
      typeof candidate.payloadRef === "string")
  ) {
    return candidate as unknown as NextStep;
  }

  if (
    candidate.kind === "wait" &&
    (candidate.resumeOn === undefined || typeof candidate.resumeOn === "string")
  ) {
    return candidate as unknown as NextStep;
  }

  if (
    candidate.kind === "terminate" &&
    (candidate.outcome === "succeeded" ||
      candidate.outcome === "failed" ||
      candidate.outcome === "cancelled")
  ) {
    return candidate as unknown as NextStep;
  }

  throw new InvocationBoundaryError({
    category: "invalid-contract",
    code: "INVALID_NEXT_STEP",
    message: "A capability returned an invalid next step.",
    outcome: "failed",
  });
}

function sameExecutionState(
  expected: PandaExecution,
  current: PandaExecution,
): boolean {
  return (
    expected.id === current.id &&
    expected.executionId === current.executionId &&
    expected.status === current.status &&
    expected.activeCapability === current.activeCapability &&
    expected.updatedAt === current.updatedAt &&
    expected.startedAt === current.startedAt &&
    expected.deadline === current.deadline &&
    expected.terminalOutcome === current.terminalOutcome &&
    expected.statusReason === current.statusReason &&
    expected.goalIds.length === current.goalIds.length &&
    expected.goalIds.every((id, index) => id === current.goalIds[index])
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Capability invocation failed with a non-error value.";
}

function invocationIdFromTrace(payload: unknown): string[] {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "invocationId" in payload &&
    typeof payload.invocationId === "string"
  ) {
    return [payload.invocationId];
  }
  return [];
}

export function isPandaCapability(value: unknown): value is PandaCapability {
  return PANDA_CAPABILITIES.some((capability) => capability === value);
}
