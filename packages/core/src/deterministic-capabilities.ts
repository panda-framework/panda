import {
  createActionRequest,
  createAssessment,
  createDecision,
  createId,
  createObservationRecord,
  createOutcome,
  nowIso,
  type ActionRequest,
  type Assessment,
  type AssessmentOption,
  type Decision,
  type DecisionOption,
  type EvidenceReference,
  type InformationNeed,
  type NextStep,
  type Observation,
  type Outcome,
  type PolicyEvaluation,
  type Signal,
} from "@panda/shared";
import type {
  CapabilityImplementation,
  CapabilityInvocation,
  CapabilityRegistry,
  CapabilityResult,
} from "./coordinator.js";
import {
  V01PolicyEngine,
  evaluatePolicy,
  type PolicyEngine,
} from "./policy.js";

export const DEMO_FILE_REQUEST_TYPE = "demo.file.requested" as const;
export const FILESYSTEM_WRITE_ACTION_TYPE = "filesystem.write" as const;
export const FILESYSTEM_CONNECTOR_ID = "filesystem" as const;
export const EXECUTION_WORKSPACE_TARGET = "execution-workspace" as const;
export const POLICY_EVALUATION_RESUME_EVENT = "policy.evaluated" as const;
export const ACTION_CONNECTOR_RESUME_EVENT =
  "action.connector.available" as const;

export interface DemoFileWriteParameters {
  readonly path: string;
  readonly content: string;
  readonly encoding: "utf8";
}

export type DemoFileInputStatus = "ready" | "incomplete" | "invalid";

export interface DemoFileAssessmentResult {
  readonly status: DemoFileInputStatus;
  readonly path?: string;
  readonly content?: string;
  readonly missingFields: readonly string[];
  readonly invalidFields: readonly string[];
}

export type DemoFileAssessmentOption =
  | {
      readonly kind: "filesystem-write";
      readonly path: string;
      readonly content: string;
    }
  | { readonly kind: "request-clarification"; readonly fields: readonly string[] }
  | { readonly kind: "no-action"; readonly reason: string };

export type DemoFileAssessment = Assessment<
  DemoFileAssessmentResult,
  DemoFileAssessmentOption
>;

export type DemoFileDecisionIntent =
  | {
      readonly kind: "action";
      readonly actionRequest: ActionRequest<DemoFileWriteParameters>;
    }
  | { readonly kind: "no-action"; readonly reason: string };

export type DemoFileDecision = Decision<DemoFileDecisionIntent>;

export interface DemoFilePolicyOutcomeData {
  readonly policyEvaluation: PolicyEvaluation;
}

export type DemoFilePolicyOutcome = Outcome<DemoFilePolicyOutcomeData>;

export interface NetworkPlaceholderResult {
  readonly kind: "network-placeholder";
  readonly status: "idle";
  readonly reason: string;
}

export interface DeterministicCapabilityOptions {
  readonly now?: () => string;
  readonly policyEngine?: PolicyEngine;
}

interface InspectedDemoFileInput {
  readonly status: DemoFileInputStatus;
  readonly path?: string;
  readonly content?: string;
  readonly needs: readonly InformationNeed[];
  readonly missingFields: readonly string[];
  readonly invalidFields: readonly string[];
}

/**
 * Deterministic Phase 4 Perception implementation for the frozen v0.1 file
 * request. It normalizes a canonical Signal and never fills missing values.
 */
export class DeterministicPerceptionCapability
  implements CapabilityImplementation<Signal<unknown>, Observation<unknown>>
{
  readonly capability = "perception" as const;
  private readonly now: () => string;

  constructor(options: DeterministicCapabilityOptions = {}) {
    this.now = options.now ?? nowIso;
  }

  invoke(
    invocation: CapabilityInvocation<Signal<unknown>>,
  ): CapabilityResult<Observation<unknown>> {
    throwIfAborted(invocation.signal);
    const signal = requireSignal(invocation.input, invocation);
    const inspected = inspectDemoFileInput(signal.type, signal.payload);
    const uncertainty = inspected.needs.map((need) => need.reason).join(" ");
    const observation = createObservationRecord({
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: signal.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp: this.now(),
      type: signal.type,
      source: signal.source,
      observedAt: signal.occurredAt,
      receivedAt: signal.receivedAt,
      confidence: 1,
      uncertainty: uncertainty === "" ? undefined : uncertainty,
      validationStatus:
        inspected.status === "ready"
          ? "valid"
          : inspected.status === "incomplete"
            ? "incomplete"
            : "invalid",
      provenance: signal.provenance,
      payload: signal.payload,
    });

    return {
      output: observation,
      nextStep: {
        kind: "invoke",
        target: "analysis",
        reason:
          inspected.status === "ready"
            ? "The normalized file request is ready for deterministic analysis."
            : "Analysis must classify the preserved incomplete or invalid request.",
      },
    };
  }
}

/** Classifies the v0.1 request without applying the Phase 5 sandbox policy. */
export class DeterministicAnalysisCapability
  implements CapabilityImplementation<Observation<unknown>, DemoFileAssessment>
{
  readonly capability = "analysis" as const;
  private readonly now: () => string;

  constructor(options: DeterministicCapabilityOptions = {}) {
    this.now = options.now ?? nowIso;
  }

  invoke(
    invocation: CapabilityInvocation<Observation<unknown>>,
  ): CapabilityResult<DemoFileAssessment> {
    throwIfAborted(invocation.signal);
    const observation = requireObservation(invocation.input, invocation);
    const inspected = inspectDemoFileInput(
      observation.type,
      observation.payload,
    );
    const evidence: EvidenceReference[] = [
      {
        id: observation.id,
        kind: "record",
        description: "Normalized demo file request observation",
      },
    ];
    const options = assessmentOptions(inspected);
    const assessment = createAssessment<
      DemoFileAssessmentResult,
      DemoFileAssessmentOption
    >({
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: observation.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp: this.now(),
      summary: assessmentSummary(inspected),
      method: "panda.v0.1.demo-file-input-rules",
      confidence: 1,
      evidence,
      assumptions:
        inspected.status === "ready"
          ? [
              "The content is UTF-8 text; sandbox authorization remains a Phase 5 responsibility.",
            ]
          : [],
      informationNeeds: inspected.needs,
      options,
      result: {
        status: inspected.status,
        path: inspected.path,
        content: inspected.content,
        missingFields: inspected.missingFields,
        invalidFields: inspected.invalidFields,
      },
    });

    return {
      output: assessment,
      nextStep: analysisNextStep(inspected),
    };
  }
}

/** Selects an effect candidate only when the deterministic evidence is ready. */
export class DeterministicDecisionCapability
  implements
    CapabilityImplementation<
      DemoFileAssessment | DemoFilePolicyOutcome,
      DemoFileDecision
    >
{
  readonly capability = "decision" as const;
  private readonly now: () => string;

  constructor(options: DeterministicCapabilityOptions = {}) {
    this.now = options.now ?? nowIso;
  }

  invoke(
    invocation: CapabilityInvocation<
      DemoFileAssessment | DemoFilePolicyOutcome
    >,
  ): CapabilityResult<DemoFileDecision> {
    throwIfAborted(invocation.signal);
    if (isPolicyOutcome(invocation.input)) {
      return this.decidePolicyOutcome(invocation.input, invocation);
    }
    const assessment = requireAssessment(invocation.input, invocation);
    const result = requireAssessmentResult(assessment.result);
    const timestamp = this.now();
    const decisionId = createId("dec");
    const decisiveEvidence: EvidenceReference[] = [
      {
        id: assessment.id,
        kind: "record",
        description: "Deterministic request readiness assessment",
      },
      ...assessment.evidence,
    ];

    if (
      result.status === "ready" &&
      result.path !== undefined &&
      result.content !== undefined
    ) {
      const nextStep: NextStep = {
        kind: "invoke",
        target: "action",
        reason:
          "Evidence supports staging a filesystem.write candidate for the policy-gated Action boundary.",
      };
      const actionRequest = createActionRequest<DemoFileWriteParameters>({
        executionId: invocation.context.executionId,
        goalId: invocation.context.goalId,
        correlationId: invocation.context.correlationId,
        causationId: decisionId,
        producer: { kind: "capability", capability: this.capability },
        timestamp,
        actionType: FILESYSTEM_WRITE_ACTION_TYPE,
        target: EXECUTION_WORKSPACE_TARGET,
        connectorId: FILESYSTEM_CONNECTOR_ID,
        parameters: {
          path: result.path,
          content: result.content,
          encoding: "utf8",
        },
        idempotencyKey: `${invocation.context.executionId}:filesystem.write:${result.path}`,
      });
      const selectedOption: DecisionOption<DemoFileDecisionIntent> = {
        id: "sandboxed-write-candidate",
        description:
          "Stage the requested write for independent policy evaluation.",
        intent: { kind: "action", actionRequest },
      };
      const decision = createDecision<DemoFileDecisionIntent>({
        id: decisionId,
        executionId: invocation.context.executionId,
        goalId: invocation.context.goalId,
        correlationId: invocation.context.correlationId,
        causationId: assessment.id,
        producer: { kind: "capability", capability: this.capability },
        timestamp,
        selectedOption,
        alternatives: [
          {
            id: "no-action",
            description: "Do not stage an external effect.",
            intent: {
              kind: "no-action",
              reason: "Choose safety if the request is later denied by policy.",
            },
          },
          {
            id: "request-clarification",
            description: "Wait for corrected path or content evidence.",
            intent: {
              kind: "no-action",
              reason: "Use if the supporting evidence becomes incomplete.",
            },
          },
        ],
        decisiveEvidence,
        decisiveConstraints: [
          "Only filesystem.write is a v0.1 effect candidate.",
          "No external effect may occur before the Phase 5 policy gate allows it.",
        ],
        rationale:
          "The observation contains the requested path and content, and deterministic analysis found no missing or malformed field. The request is staged, not authorized or executed.",
        nextStep,
      });

      return { output: decision, nextStep };
    }

    const nextStep: NextStep =
      result.status === "incomplete"
        ? {
            kind: "wait",
            reason: "A filesystem action cannot be selected without complete evidence.",
            resumeOn: DEMO_FILE_REQUEST_TYPE,
          }
        : {
            kind: "terminate",
            outcome: "failed",
            reason: "The malformed request cannot produce a safe action candidate.",
          };
    const decision = createDecision<DemoFileDecisionIntent>({
      id: decisionId,
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: assessment.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp,
      selectedOption: {
        id: "no-action",
        description: "Do not create an action request.",
        intent: {
          kind: "no-action",
          reason: "The assessment does not contain sufficient valid evidence.",
        },
      },
      alternatives: [
        {
          id: "request-clarification",
          description: "Wait for a corrected demo.file.requested signal.",
          intent: {
            kind: "no-action",
            reason: "Missing evidence can be supplied through Perception.",
          },
        },
      ],
      decisiveEvidence,
      decisiveConstraints: [
        "Incomplete or invalid evidence cannot create an action request.",
      ],
      rationale:
        "The deterministic assessment did not establish both a valid path and string content, so safe non-action is required.",
      nextStep,
    });

    return { output: decision, nextStep };
  }

  private decidePolicyOutcome(
    outcome: DemoFilePolicyOutcome,
    invocation: CapabilityInvocation,
  ): CapabilityResult<DemoFileDecision> {
    assertRecordIdentity(
      outcome as unknown as Record<string, unknown>,
      invocation,
      "Outcome",
    );
    const evaluation = outcome.data?.policyEvaluation;
    if (
      outcome.status !== "rejected" ||
      outcome.effectStatus !== "none" ||
      evaluation === undefined ||
      evaluation.point !== "effect" ||
      evaluation.result === "allow" ||
      outcome.causationId !== evaluation.id ||
      evaluation.causationId !== outcome.actionRequestId
    ) {
      throw new TypeError(
        "Decision requires a rejected zero-effect policy outcome.",
      );
    }
    assertRecordIdentity(
      evaluation as unknown as Record<string, unknown>,
      invocation,
      "PolicyEvaluation",
    );

    const nextStep: NextStep = {
      kind: "terminate",
      outcome: "failed",
      reason:
        "The requested filesystem effect was not authorized and no safe v0.1 alternative remains.",
    };
    const decision = createDecision<DemoFileDecisionIntent>({
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: outcome.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp: this.now(),
      selectedOption: {
        id: "terminate-after-policy-rejection",
        description: "Stop without attempting the denied effect.",
        intent: {
          kind: "no-action",
          reason: evaluation.reason,
        },
      },
      alternatives: [
        {
          id: "await-future-authorized-request",
          description:
            "A future execution may provide a request that satisfies policy.",
          intent: {
            kind: "no-action",
            reason:
              "The deterministic v0.1 fixture has no in-execution approval or recovery path.",
          },
        },
      ],
      decisiveEvidence: [
        {
          id: outcome.id,
          kind: "record",
          description: "Rejected Action outcome with no external effect",
        },
        {
          id: evaluation.id,
          kind: "policy",
          description: evaluation.reason,
        },
      ],
      decisiveConstraints: [
        "A denied or approval-required effect cannot reach a connector.",
        "The v0.1 policy-denial fixture has no authorized alternative.",
      ],
      rationale:
        "Independent policy did not allow the selected effect. The rejected outcome confirms that no connector effect was attempted, so safe termination is required.",
      nextStep,
    });

    return { output: decision, nextStep };
  }
}

/**
 * Phase 5 Action policy boundary. It authorizes or rejects the selected
 * candidate but never invokes a connector or mutates a filesystem.
 */
export class DeterministicActionCapability
  implements
    CapabilityImplementation<
      DemoFileDecision,
      | ActionRequest<DemoFileWriteParameters>
      | DemoFileDecision
      | DemoFilePolicyOutcome
    >
{
  readonly capability = "action" as const;
  private readonly now: () => string;
  private readonly policyEngine: PolicyEngine;

  constructor(options: DeterministicCapabilityOptions = {}) {
    this.now = options.now ?? nowIso;
    this.policyEngine = options.policyEngine ?? new V01PolicyEngine();
  }

  async invoke(
    invocation: CapabilityInvocation<DemoFileDecision>,
  ): Promise<
    CapabilityResult<
      | ActionRequest<DemoFileWriteParameters>
      | DemoFileDecision
      | DemoFilePolicyOutcome
    >
  > {
    throwIfAborted(invocation.signal);
    const decision = requireDecision(invocation.input, invocation);
    const intent = decision.selectedOption.intent;

    if (intent?.kind !== "action") {
      return {
        output: decision,
        nextStep: decision.nextStep,
      };
    }

    const actionRequest = requireActionRequest(
      intent.actionRequest,
      invocation,
      decision.id,
    );
    const evaluation = await evaluatePolicy(
      this.policyEngine,
      {
        point: "effect",
        executionId: invocation.context.executionId,
        goalId: invocation.context.goalId,
        correlationId: invocation.context.correlationId,
        causationId: actionRequest.id,
        producer: { kind: "capability", capability: this.capability },
        context: invocation.context,
        actionRequest,
      },
      { now: this.now, signal: invocation.signal },
    );

    if (evaluation.result !== "allow") {
      const timestamp = this.now();
      const outcome = createOutcome<DemoFilePolicyOutcomeData>({
        executionId: invocation.context.executionId,
        goalId: invocation.context.goalId,
        correlationId: invocation.context.correlationId,
        causationId: evaluation.id,
        producer: { kind: "capability", capability: this.capability },
        timestamp,
        actionRequestId: actionRequest.id,
        status: "rejected",
        effectStatus: "none",
        startedAt: timestamp,
        endedAt: timestamp,
        data: { policyEvaluation: evaluation },
        error: {
          code:
            evaluation.result === "require"
              ? "POLICY_AUTHORIZATION_REQUIRED"
              : "POLICY_DENIED",
          message: evaluation.reason,
        },
      });
      return {
        output: outcome,
        nextStep: {
          kind: "invoke",
          target: "decision",
          reason:
            "Decision must evaluate the rejected zero-effect policy outcome.",
        },
        policyEvaluations: [evaluation],
      };
    }

    const authorizedRequest = createActionRequest<DemoFileWriteParameters>({
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: evaluation.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp: this.now(),
      actionType: actionRequest.actionType,
      target: actionRequest.target,
      connectorId: actionRequest.connectorId,
      parameters: actionRequest.parameters,
      authorization: {
        policyId: evaluation.policyId,
        evaluationId: evaluation.id,
      },
      idempotencyKey: actionRequest.idempotencyKey,
      timeoutMs: actionRequest.timeoutMs,
    });
    return {
      output: authorizedRequest,
      nextStep: {
        kind: "wait",
        reason:
          "Policy allowed the exact request, but no Action connector is enabled before Phase 6.",
        resumeOn: ACTION_CONNECTOR_RESUME_EVENT,
      },
      policyEvaluations: [evaluation],
    };
  }
}

/** Minimal registered Network implementation for scenarios that do not use it. */
export class DeterministicNetworkCapability
  implements CapabilityImplementation<unknown, NetworkPlaceholderResult>
{
  readonly capability = "network" as const;

  invoke(
    invocation: CapabilityInvocation<unknown>,
  ): CapabilityResult<NetworkPlaceholderResult> {
    throwIfAborted(invocation.signal);
    return {
      output: {
        kind: "network-placeholder",
        status: "idle",
        reason: "The v0.1 filesystem scenario requires no network exchange.",
      },
      nextStep: {
        kind: "wait",
        reason: "No deterministic network work was requested.",
        resumeOn: "network.requested",
      },
    };
  }
}

export interface DeterministicPandaCapabilities {
  readonly perception: DeterministicPerceptionCapability;
  readonly analysis: DeterministicAnalysisCapability;
  readonly network: DeterministicNetworkCapability;
  readonly decision: DeterministicDecisionCapability;
  readonly action: DeterministicActionCapability;
  readonly all: readonly CapabilityImplementation[];
}

export function createDeterministicPandaCapabilities(
  options: DeterministicCapabilityOptions = {},
): DeterministicPandaCapabilities {
  const perception = new DeterministicPerceptionCapability(options);
  const analysis = new DeterministicAnalysisCapability(options);
  const network = new DeterministicNetworkCapability();
  const decision = new DeterministicDecisionCapability(options);
  const action = new DeterministicActionCapability(options);

  return {
    perception,
    analysis,
    network,
    decision,
    action,
    all: [perception, analysis, network, decision, action],
  };
}

/** Registers the Phase 4 set atomically and returns an ownership-safe cleanup. */
export function registerDeterministicPandaCapabilities(
  registry: CapabilityRegistry,
  options: DeterministicCapabilityOptions = {},
): () => void {
  const capabilities = createDeterministicPandaCapabilities(options);
  const unregister: Array<() => void> = [];

  try {
    for (const implementation of capabilities.all) {
      unregister.push(registry.register(implementation));
    }
  } catch (error) {
    for (const cleanup of [...unregister].reverse()) {
      cleanup();
    }
    throw error;
  }

  return () => {
    for (const cleanup of [...unregister].reverse()) {
      cleanup();
    }
  };
}

function inspectDemoFileInput(
  type: string,
  payload: unknown,
): InspectedDemoFileInput {
  const needs: InformationNeed[] = [];
  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  if (type !== DEMO_FILE_REQUEST_TYPE) {
    invalidFields.push("type");
    needs.push({
      field: "type",
      reason: `Expected ${DEMO_FILE_REQUEST_TYPE}; received ${type}.`,
      required: true,
    });
  }

  if (!isRecord(payload)) {
    invalidFields.push("payload");
    needs.push({
      field: "payload",
      reason: "The request payload must be an object.",
      required: true,
    });
    return {
      status: "invalid",
      needs,
      missingFields,
      invalidFields,
    };
  }

  const hasPath = Object.prototype.hasOwnProperty.call(payload, "path");
  const hasContent = Object.prototype.hasOwnProperty.call(payload, "content");
  const path = payload.path;
  const content = payload.content;

  if (!hasPath) {
    missingFields.push("path");
    needs.push({
      field: "path",
      reason: "A relative target path is required.",
      required: true,
    });
  } else if (typeof path !== "string" || path.trim() === "") {
    invalidFields.push("path");
    needs.push({
      field: "path",
      reason: "The target path must be a non-empty string.",
      required: true,
    });
  }

  if (!hasContent) {
    missingFields.push("content");
    needs.push({
      field: "content",
      reason: "UTF-8 string content is required.",
      required: true,
    });
  } else if (typeof content !== "string") {
    invalidFields.push("content");
    needs.push({
      field: "content",
      reason: "The requested content must be a string.",
      required: true,
    });
  }

  const status: DemoFileInputStatus =
    invalidFields.length > 0
      ? "invalid"
      : missingFields.length > 0
        ? "incomplete"
        : "ready";

  return {
    status,
    path: typeof path === "string" && path.trim() !== "" ? path : undefined,
    content: typeof content === "string" ? content : undefined,
    needs,
    missingFields,
    invalidFields,
  };
}

function assessmentOptions(
  inspected: InspectedDemoFileInput,
): readonly AssessmentOption<DemoFileAssessmentOption>[] {
  if (
    inspected.status === "ready" &&
    inspected.path !== undefined &&
    inspected.content !== undefined
  ) {
    return [
      {
        id: "filesystem-write-candidate",
        description: "Consider the requested sandboxed filesystem write.",
        value: {
          kind: "filesystem-write",
          path: inspected.path,
          content: inspected.content,
        },
      },
      {
        id: "no-action",
        description: "Do not create an effect candidate.",
        value: {
          kind: "no-action",
          reason: "Policy or later evidence may require safe non-action.",
        },
      },
    ];
  }

  return [
    {
      id: "request-clarification",
      description: "Wait for corrected request evidence.",
      value: {
        kind: "request-clarification",
        fields: inspected.needs.map((need) => need.field),
      },
    },
    {
      id: "no-action",
      description: "Do not create an effect candidate.",
      value: {
        kind: "no-action",
        reason: "Required request evidence is incomplete or invalid.",
      },
    },
  ];
}

function assessmentSummary(inspected: InspectedDemoFileInput): string {
  if (inspected.status === "ready") {
    return "The demo file request contains a non-empty path and string content.";
  }
  if (inspected.status === "incomplete") {
    return `The demo file request is missing: ${inspected.missingFields.join(", ")}.`;
  }
  return `The demo file request is invalid in: ${inspected.invalidFields.join(", ")}.`;
}

function analysisNextStep(inspected: InspectedDemoFileInput): NextStep {
  if (inspected.status === "ready") {
    return {
      kind: "invoke",
      target: "decision",
      reason: "Complete deterministic evidence is ready for option selection.",
    };
  }
  if (inspected.status === "incomplete") {
    return {
      kind: "wait",
      reason: `Required request information is missing: ${inspected.missingFields.join(", ")}.`,
      resumeOn: DEMO_FILE_REQUEST_TYPE,
    };
  }
  return {
    kind: "terminate",
    outcome: "failed",
    reason: `The request contains invalid fields: ${inspected.invalidFields.join(", ")}.`,
  };
}

function requireSignal(
  value: unknown,
  invocation: CapabilityInvocation,
): Signal<unknown> {
  if (
    !isRecord(value) ||
    value.kind !== "signal" ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    typeof value.source !== "string" ||
    typeof value.receivedAt !== "string" ||
    !isRecord(value.provenance) ||
    !("payload" in value)
  ) {
    throw new TypeError("Perception requires a canonical Signal input.");
  }
  assertRecordIdentity(value, invocation, "Signal");
  return value as unknown as Signal<unknown>;
}

function requireObservation(
  value: unknown,
  invocation: CapabilityInvocation,
): Observation<unknown> {
  if (
    !isRecord(value) ||
    value.kind !== "observation" ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    !("payload" in value)
  ) {
    throw new TypeError("Analysis requires a canonical Observation input.");
  }
  assertRecordIdentity(value, invocation, "Observation");
  return value as unknown as Observation<unknown>;
}

function isPolicyOutcome(value: unknown): value is DemoFilePolicyOutcome {
  return (
    isRecord(value) &&
    value.kind === "outcome" &&
    value.status === "rejected" &&
    value.effectStatus === "none" &&
    isRecord(value.data) &&
    isRecord(value.data.policyEvaluation) &&
    value.data.policyEvaluation.kind === "policy-evaluation"
  );
}

function requireAssessment(
  value: unknown,
  invocation: CapabilityInvocation,
): DemoFileAssessment {
  if (
    !isRecord(value) ||
    value.kind !== "assessment" ||
    typeof value.id !== "string" ||
    !("result" in value) ||
    !Array.isArray(value.evidence)
  ) {
    throw new TypeError("Decision requires a canonical Assessment input.");
  }
  assertRecordIdentity(value, invocation, "Assessment");
  return value as unknown as DemoFileAssessment;
}

function requireAssessmentResult(value: unknown): DemoFileAssessmentResult {
  if (
    !isRecord(value) ||
    (value.status !== "ready" &&
      value.status !== "incomplete" &&
      value.status !== "invalid") ||
    !Array.isArray(value.missingFields) ||
    !Array.isArray(value.invalidFields)
  ) {
    throw new TypeError("Decision received an invalid demo file assessment result.");
  }
  return value as unknown as DemoFileAssessmentResult;
}

function requireDecision(
  value: unknown,
  invocation: CapabilityInvocation,
): DemoFileDecision {
  if (
    !isRecord(value) ||
    value.kind !== "decision" ||
    typeof value.id !== "string" ||
    !isRecord(value.selectedOption) ||
    !isRecord(value.nextStep)
  ) {
    throw new TypeError("Action requires a canonical Decision input.");
  }
  assertRecordIdentity(value, invocation, "Decision");
  return value as unknown as DemoFileDecision;
}

function requireActionRequest(
  value: unknown,
  invocation: CapabilityInvocation,
  decisionId: string,
): ActionRequest<DemoFileWriteParameters> {
  if (
    !isRecord(value) ||
    value.kind !== "action-request" ||
    value.actionType !== FILESYSTEM_WRITE_ACTION_TYPE ||
    value.target !== EXECUTION_WORKSPACE_TARGET ||
    value.connectorId !== FILESYSTEM_CONNECTOR_ID ||
    value.causationId !== decisionId ||
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey === "" ||
    !isRecord(value.parameters) ||
    typeof value.parameters.path !== "string" ||
    value.parameters.path.trim() === "" ||
    typeof value.parameters.content !== "string" ||
    value.parameters.encoding !== "utf8"
  ) {
    throw new TypeError("Action received an invalid filesystem.write request.");
  }
  assertRecordIdentity(value, invocation, "ActionRequest");
  return value as unknown as ActionRequest<DemoFileWriteParameters>;
}

function assertRecordIdentity(
  record: Readonly<Record<string, unknown>>,
  invocation: CapabilityInvocation,
  name: string,
): void {
  if (
    record.executionId !== invocation.context.executionId ||
    record.goalId !== invocation.context.goalId ||
    record.correlationId !== invocation.context.correlationId
  ) {
    throw new TypeError(`${name} identity does not match the execution context.`);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }
  const error = new Error("Capability invocation was cancelled.");
  error.name = "AbortError";
  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
