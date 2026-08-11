import {
  PANDA_CAPABILITIES,
  PANDA_SCHEMA_VERSION,
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
  type Goal,
  type NextStep,
  type PandaCapability,
  type PandaExecution,
  type PolicyEvaluation,
  type PolicyEvaluationSummary,
  type PrincipalReference,
  type RecordProducer,
  type TerminalOutcome,
  type TraceCategory,
  type TransitionRecord,
  type TransitionRequest,
} from "@panda/shared";
import type { ExecutionStore, StoredTraceRecord } from "./execution-store.js";
import { sameGoalDefinition, type GoalStore } from "./goal-store.js";
import {
  V01PolicyEngine,
  evaluatePolicy,
  type PolicyEngine,
} from "./policy.js";

export interface CapabilityInvocation<TInput = unknown> {
  readonly context: ExecutionContext;
  readonly goal?: Goal;
  readonly input: TInput;
  readonly signal: AbortSignal;
}

export interface CapabilityResult<TOutput = unknown> {
  readonly output: TOutput;
  readonly nextStep: NextStep;
  readonly policyEvaluations?: readonly PolicyEvaluation[];
  readonly traceEvents?: readonly CapabilityTraceEvent[];
  readonly goalUpdate?: Goal;
}

export interface CapabilityTraceEvent {
  readonly category: TraceCategory;
  readonly type: string;
  readonly producer: RecordProducer;
  readonly payload: unknown;
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
  readonly policyEngine?: PolicyEngine;
  readonly goalStore?: GoalStore;
  readonly defaultPrincipal?: PrincipalReference;
}

export interface CoordinateExecutionInput {
  readonly executionId: string;
  readonly input: unknown;
  readonly signal?: AbortSignal;
  readonly causationId?: string;
  readonly expectedUpdatedAt?: string;
  readonly contextValues?: Readonly<Record<string, unknown>>;
  readonly principal?: PrincipalReference;
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
  private readonly policyEngine: PolicyEngine;
  private readonly goalStore?: GoalStore;
  private readonly defaultPrincipal: PrincipalReference;
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
    this.policyEngine = options.policyEngine ?? new V01PolicyEngine();
    this.goalStore = options.goalStore;
    this.defaultPrincipal = options.defaultPrincipal ?? {
      id: this.component,
      type: "system",
    };
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
        principal: input.principal ?? this.defaultPrincipal,
        invocationHistory: [...invocationHistory],
        values: input.contextValues ?? {},
      });
      const goal = this.goalStore?.getGoal(execution.goalId);
      if (this.goalStore !== undefined && goal === undefined) {
        return this.failExecution(
          execution,
          {
            category: "invalid-contract",
            code: "GOAL_NOT_FOUND",
            message: `Goal ${execution.goalId} does not exist.`,
            outcome: "failed",
          },
          causationId,
          invocationCount,
          lastOutput,
        );
      }
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
          goal,
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
      let policyEvaluations: readonly PolicyEvaluation[];
      let traceEvents: readonly CapabilityTraceEvent[];
      let goalUpdate: Goal | undefined;
      try {
        nextStep = validateNextStep(result?.nextStep);
        policyEvaluations = validatePolicyEvaluations(
          result?.policyEvaluations,
          execution,
        );
        traceEvents = validateCapabilityTraceEvents(
          result?.traceEvents,
          execution,
        );
        goalUpdate = validateGoalUpdate(
          result?.goalUpdate,
          goal,
          execution,
          nextStep,
          result?.output,
          capability,
          this.goalStore !== undefined,
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
            capability,
          );
        }
        throw error;
      }
      lastOutput = result?.output;
      let completionCausationId = invocationStarted.id;
      for (const evaluation of policyEvaluations) {
        completionCausationId = this.appendPolicyTrace(
          execution,
          evaluation,
          completionCausationId,
        ).id;
      }
      for (const event of traceEvents) {
        completionCausationId = this.appendCapabilityTraceEvent(
          execution,
          event,
          completionCausationId,
        ).id;
      }
      const invocationCompleted = this.appendInvocationTrace(
        execution,
        context,
        capability,
        invocationId,
        "completed",
        completionCausationId,
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

      const policyExecution = execution;
      let policyEvaluation: PolicyEvaluation;
      try {
        policyEvaluation = await this.runWithinBounds(
          (signal) =>
            evaluatePolicy(
              this.policyEngine,
              {
                point: "transition",
                executionId: policyExecution.executionId,
                goalId: policyExecution.goalId,
                correlationId: policyExecution.correlationId,
                causationId: request.id,
                producer: this.runtimeProducer,
                execution: policyExecution,
                transition: request,
              },
              { now: this.now, signal },
            ),
          policyExecution.deadline,
          input.signal,
        );
      } catch (error) {
        if (error instanceof InvocationBoundaryError) {
          return this.failExecution(
            execution,
            error.failure,
            requestTrace.id,
            invocationCount,
            lastOutput,
          );
        }
        return this.failExecution(
          execution,
          {
            category: "policy-violation",
            code: "TRANSITION_POLICY_EVALUATION_FAILED",
            message: `Transition policy evaluation failed: ${describeError(error)}`,
            outcome: "failed",
          },
          requestTrace.id,
          invocationCount,
          lastOutput,
        );
      }
      const policyTrace = this.appendPolicyTrace(
        execution,
        policyEvaluation,
        requestTrace.id,
      );
      const policySummary = summarizePolicyEvaluation(policyEvaluation);
      const afterPolicy = this.store.getExecution(execution.executionId);
      if (
        afterPolicy === undefined ||
        !sameExecutionState(execution, afterPolicy)
      ) {
        this.recordTransition(
          execution,
          request,
          policyTrace.id,
          "rejected",
          "The execution changed while transition policy was being evaluated.",
          policySummary,
        );
        throw new ExecutionCoordinatorError(
          "STALE_EXECUTION",
          `Execution ${execution.executionId} changed during policy evaluation for ${request.id}.`,
        );
      }

      if (policyEvaluation.result !== "allow") {
        const rejectionReason =
          policyEvaluation.result === "require"
            ? `Transition policy requires additional authorization: ${policyEvaluation.reason}`
            : `Transition policy denied the request: ${policyEvaluation.reason}`;
        const rejected = this.recordTransition(
          execution,
          request,
          policyTrace.id,
          "rejected",
          rejectionReason,
          policySummary,
        );
        return this.failExecution(
          execution,
          {
            category: "policy-violation",
            code:
              policyEvaluation.result === "require"
                ? "TRANSITION_POLICY_AUTHORIZATION_REQUIRED"
                : "TRANSITION_POLICY_DENIED",
            message: rejectionReason,
            outcome: "failed",
          },
          rejected.id,
          invocationCount,
          lastOutput,
        );
      }

      if (
        goalUpdate !== undefined &&
        goal !== undefined &&
        this.goalStore !== undefined &&
        !sameGoalSnapshot(goal, this.goalStore.getGoal(goal.goalId))
      ) {
        const rejected = this.recordTransition(
          execution,
          request,
          policyTrace.id,
          "rejected",
          "The active Goal changed while the capability result was being committed.",
          policySummary,
        );
        return this.failExecution(
          execution,
          {
            category: "conflict",
            code: "GOAL_CHANGED_DURING_INVOCATION",
            message:
              "The active Goal changed before its proposed status transition could commit.",
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
        policyTrace.id,
        "committed",
        undefined,
        policySummary,
      );
      let stateCausationId = committed.id;
      if (goalUpdate !== undefined && this.goalStore !== undefined) {
        const updatedGoal = this.goalStore.updateGoal(
          goalUpdate,
          goal?.revision,
        );
        stateCausationId = this.store.appendTrace(
          createTraceRecord({
            executionId: execution.executionId,
            goalId: execution.goalId,
            correlationId: execution.correlationId,
            causationId: committed.id,
            producer: updatedGoal.producer,
            category: "goal-status",
            type: `goal.${updatedGoal.status}`,
            payload: updatedGoal,
          }),
        ).id;
      }

      if (nextStep.kind === "invoke") {
        execution = this.store.updateExecution({
          ...execution,
          status: "running",
          activeCapability: nextStep.target,
          updatedAt: this.now(),
          statusReason: nextStep.reason,
        });
        capabilityInput = lastOutput;
        causationId = stateCausationId;
        continue;
      }

      if (nextStep.kind === "wait") {
        this.store.appendTrace(
          createTraceRecord({
            executionId: execution.executionId,
            goalId: execution.goalId,
            correlationId: execution.correlationId,
            causationId: stateCausationId,
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
          causationId: stateCausationId,
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

  private appendPolicyTrace(
    execution: PandaExecution,
    evaluation: PolicyEvaluation,
    causationId: string,
  ): StoredTraceRecord<PolicyEvaluation> {
    return this.store.appendTrace(
      createTraceRecord({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId,
        producer: evaluation.producer,
        category: "policy-evaluation",
        type: `policy.${evaluation.point}.${evaluation.result}`,
        payload: evaluation,
      }),
    );
  }

  private appendCapabilityTraceEvent(
    execution: PandaExecution,
    event: CapabilityTraceEvent,
    causationId: string,
  ): StoredTraceRecord {
    return this.store.appendTrace(
      createTraceRecord({
        executionId: execution.executionId,
        goalId: execution.goalId,
        correlationId: execution.correlationId,
        causationId,
        producer: event.producer,
        category: event.category,
        type: event.type,
        payload: event.payload,
      }),
    );
  }

  private recordTransition(
    execution: PandaExecution,
    request: TransitionRequest,
    causationId: string,
    status: TransitionRecord["status"],
    rejectionReason?: string,
    policy?: PolicyEvaluationSummary,
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
      policy,
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
    goal: Goal | undefined,
    input: unknown,
    deadline: string | undefined,
    externalSignal: AbortSignal | undefined,
  ): Promise<CapabilityResult> {
    return this.runWithinBounds(
      (signal) =>
        this.registry.invoke(capability, {
          context,
          goal,
          input,
          signal,
        }),
      deadline,
      externalSignal,
    );
  }

  private async runWithinBounds<T>(
    work: (signal: AbortSignal) => Promise<T> | T,
    deadline: string | undefined,
    externalSignal: AbortSignal | undefined,
  ): Promise<T> {
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
      const workPromise = Promise.resolve(work(controller.signal));
      return await Promise.race([workPromise, boundaryPromise]);
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

function validatePolicyEvaluations(
  value: unknown,
  execution: PandaExecution,
): readonly PolicyEvaluation[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InvocationBoundaryError({
      category: "invalid-contract",
      code: "INVALID_POLICY_EVALUATIONS",
      message: "Capability policy evaluations must be an array.",
      outcome: "failed",
    });
  }

  for (const evaluation of value) {
    if (
      !isRecord(evaluation) ||
      evaluation.kind !== "policy-evaluation" ||
      typeof evaluation.id !== "string" ||
      evaluation.id.trim() === "" ||
      evaluation.schemaVersion !== PANDA_SCHEMA_VERSION ||
      evaluation.executionId !== execution.executionId ||
      evaluation.goalId !== execution.goalId ||
      evaluation.correlationId !== execution.correlationId ||
      (evaluation.point !== "transition" && evaluation.point !== "effect") ||
      typeof evaluation.policyId !== "string" ||
      evaluation.policyId.trim() === "" ||
      (evaluation.result !== "allow" &&
        evaluation.result !== "deny" &&
        evaluation.result !== "require") ||
      typeof evaluation.reason !== "string" ||
      evaluation.reason.trim() === "" ||
      typeof evaluation.timestamp !== "string" ||
      !isRecord(evaluation.producer) ||
      !isRecord(evaluation.inputs)
    ) {
      throw new InvocationBoundaryError({
        category: "invalid-contract",
        code: "INVALID_POLICY_EVALUATIONS",
        message:
          "A capability returned an invalid or cross-execution policy evaluation.",
        outcome: "failed",
      });
    }
  }

  return value as PolicyEvaluation[];
}

const CAPABILITY_TRACE_CATEGORIES = new Set<TraceCategory>([
  "observation",
  "assessment",
  "decision",
  "action-request",
  "connector-invocation",
  "outcome",
]);

function validateCapabilityTraceEvents(
  value: unknown,
  execution: PandaExecution,
): readonly CapabilityTraceEvent[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InvocationBoundaryError({
      category: "invalid-contract",
      code: "INVALID_CAPABILITY_TRACE_EVENTS",
      message: "Capability trace events must be an array.",
      outcome: "failed",
    });
  }

  for (const event of value) {
    if (
      !isRecord(event) ||
      !CAPABILITY_TRACE_CATEGORIES.has(event.category as TraceCategory) ||
      typeof event.type !== "string" ||
      event.type.trim() === "" ||
      !isRecordProducer(event.producer) ||
      !traceProducerOwnsCategory(
        event.category as TraceCategory,
        event.producer as RecordProducer,
      ) ||
      !("payload" in event) ||
      (isRecord(event.payload) &&
        (("executionId" in event.payload &&
          event.payload.executionId !== execution.executionId) ||
          ("goalId" in event.payload &&
            event.payload.goalId !== execution.goalId) ||
          ("correlationId" in event.payload &&
            event.payload.correlationId !== execution.correlationId)))
    ) {
      throw new InvocationBoundaryError({
        category: "invalid-contract",
        code: "INVALID_CAPABILITY_TRACE_EVENTS",
        message:
          "A capability returned an invalid or cross-execution trace event.",
        outcome: "failed",
      });
    }
  }

  return value as CapabilityTraceEvent[];
}

function traceProducerOwnsCategory(
  category: TraceCategory,
  producer: RecordProducer,
): boolean {
  if (category === "observation") {
    return (
      producer.kind === "capability" && producer.capability === "perception"
    );
  }
  if (category === "assessment") {
    return producer.kind === "capability" && producer.capability === "analysis";
  }
  if (category === "decision") {
    return (
      producer.kind === "capability" && producer.capability === "decision"
    );
  }
  if (category === "action-request") {
    return producer.kind === "capability" && producer.capability === "action";
  }
  if (category === "connector-invocation") {
    return producer.kind === "connector";
  }
  return category === "outcome";
}

function validateGoalUpdate(
  value: unknown,
  current: Goal | undefined,
  execution: PandaExecution,
  nextStep: NextStep,
  output: unknown,
  capability: PandaCapability,
  goalStoreConfigured: boolean,
): Goal | undefined {
  if (value === undefined) {
    return undefined;
  }
  const outputId = isRecord(output) ? output.id : undefined;
  if (
    !goalStoreConfigured ||
    current === undefined ||
    !isRecord(value) ||
    value.kind !== "goal" ||
    value.schemaVersion !== PANDA_SCHEMA_VERSION ||
    value.id !== current.id ||
    value.goalId !== current.goalId ||
    value.executionId !== execution.executionId ||
    value.correlationId !== execution.correlationId ||
    value.revision !== current.revision + 1 ||
    value.status === current.status ||
    typeof value.statusReason !== "string" ||
    value.statusReason.trim() === "" ||
    typeof value.timestamp !== "string" ||
    Number.isNaN(Date.parse(value.timestamp)) ||
    typeof value.causationId !== "string" ||
    value.causationId !== outputId ||
    !isRecordProducer(value.producer) ||
    value.producer.kind !== "capability" ||
    value.producer.capability !== capability ||
    !sameGoalDefinition(current, value as unknown as Goal) ||
    !goalStatusMatchesNextStep(value.status, nextStep)
  ) {
    throw new InvocationBoundaryError({
      category: "invalid-contract",
      code: "INVALID_GOAL_UPDATE",
      message:
        "A capability returned an invalid, unowned, or transition-inconsistent Goal update.",
      outcome: "failed",
    });
  }
  return value as unknown as Goal;
}

function goalStatusMatchesNextStep(
  status: unknown,
  nextStep: NextStep,
): boolean {
  if (status === "awaiting-human") {
    return nextStep.kind === "wait";
  }
  if (status === "achieved") {
    return nextStep.kind === "terminate" && nextStep.outcome === "succeeded";
  }
  if (status === "failed") {
    return nextStep.kind === "terminate" && nextStep.outcome === "failed";
  }
  if (status === "cancelled") {
    return nextStep.kind === "terminate" && nextStep.outcome === "cancelled";
  }
  return false;
}

function isRecordProducer(value: unknown): value is RecordProducer {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === "capability") {
    return PANDA_CAPABILITIES.includes(value.capability as PandaCapability);
  }
  if (value.kind === "connector") {
    return (
      typeof value.connectorId === "string" && value.connectorId.trim() !== ""
    );
  }
  return (
    value.kind === "runtime" &&
    typeof value.component === "string" &&
    value.component.trim() !== ""
  );
}

function summarizePolicyEvaluation(
  evaluation: PolicyEvaluation,
): PolicyEvaluationSummary {
  return {
    evaluationId: evaluation.id,
    policyId: evaluation.policyId,
    result: evaluation.result,
    reason: evaluation.reason,
  };
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

function sameGoalSnapshot(
  expected: Goal,
  current: Goal | undefined,
): boolean {
  return (
    current !== undefined &&
    JSON.stringify(expected) === JSON.stringify(current)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPandaCapability(value: unknown): value is PandaCapability {
  return PANDA_CAPABILITIES.some((capability) => capability === value);
}
