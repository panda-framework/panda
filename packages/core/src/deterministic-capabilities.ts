import { createHash } from "node:crypto";
import {
  createActionRequest,
  createAssessment,
  createConnectorInvocation,
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
  type Goal,
  type GoalStatus,
  type InformationNeed,
  type NextStep,
  type Observation,
  type Outcome,
  type PolicyEvaluation,
  type Signal,
} from "@panda/shared";
import {
  ActionConnectorRegistryError,
  type ActionConnectorRegistry,
  type FilesystemWriteOutcomeData,
} from "./action-connector.js";
import {
  type EffectObserver,
  type FilesystemEffectObservation,
} from "./effect-observer.js";
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
export const EFFECT_VERIFICATION_RESUME_EVENT =
  "effect.verification.available" as const;
export const FILESYSTEM_EFFECT_OBSERVATION_TYPE =
  "filesystem.effect.observed" as const;

export interface DemoFileWriteParameters {
  readonly path: string;
  readonly content: string;
  readonly encoding: "utf8";
}

export type DemoFileInputStatus = "ready" | "incomplete" | "invalid";

export interface DemoFileAssessmentResult {
  readonly kind: "request-readiness";
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

export interface DemoFileVerificationObservation
  extends FilesystemEffectObservation {
  readonly actionOutcomeId: string;
  readonly actionRequestId: string;
}

export interface DemoFileVerificationCheck {
  readonly criterionId: string;
  readonly evidenceType: string;
  readonly expected: unknown;
  readonly observed: unknown;
  readonly matches: boolean;
}

export interface DemoFileVerificationResult {
  readonly kind: "effect-verification";
  readonly status: "verified" | "mismatch" | "unavailable";
  readonly checks: readonly DemoFileVerificationCheck[];
  readonly mismatchReasons: readonly string[];
}

export type DemoFileVerificationAssessment = Assessment<
  DemoFileVerificationResult,
  { readonly kind: "accept-verification" | "reject-verification" }
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
export type DemoFileActionOutcome = Outcome<
  DemoFilePolicyOutcomeData | FilesystemWriteOutcomeData | undefined
>;

export interface NetworkPlaceholderResult {
  readonly kind: "network-placeholder";
  readonly status: "idle";
  readonly reason: string;
}

export interface DeterministicCapabilityOptions {
  readonly now?: () => string;
  readonly policyEngine?: PolicyEngine;
  readonly actionConnectorRegistry?: ActionConnectorRegistry;
  readonly effectObserver?: EffectObserver;
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
  implements
    CapabilityImplementation<
      Signal<unknown> | DemoFileActionOutcome,
      Observation<unknown>
    >
{
  readonly capability = "perception" as const;
  private readonly now: () => string;
  private readonly effectObserver?: EffectObserver;

  constructor(options: DeterministicCapabilityOptions = {}) {
    this.now = options.now ?? nowIso;
    this.effectObserver = options.effectObserver;
  }

  async invoke(
    invocation: CapabilityInvocation<Signal<unknown> | DemoFileActionOutcome>,
  ): Promise<CapabilityResult<Observation<unknown>>> {
    throwIfAborted(invocation.signal);
    if (isOutcome(invocation.input)) {
      return this.observeCompletedEffect(invocation.input, invocation);
    }
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
      traceEvents: [
        {
          category: "observation",
          type: "observation.created",
          producer: observation.producer,
          payload: observation,
        },
      ],
    };
  }

  private async observeCompletedEffect(
    outcome: DemoFileActionOutcome,
    invocation: CapabilityInvocation,
  ): Promise<CapabilityResult<Observation<DemoFileVerificationObservation>>> {
    assertRecordIdentity(
      outcome as unknown as Record<string, unknown>,
      invocation,
      "Outcome",
    );
    if (
      outcome.status !== "succeeded" ||
      outcome.effectStatus !== "completed" ||
      !isRecord(outcome.data) ||
      typeof outcome.data.relativePath !== "string" ||
      outcome.data.relativePath.trim() === "" ||
      this.effectObserver === undefined
    ) {
      throw new TypeError(
        "Perception requires a completed filesystem Outcome and configured effect observer.",
      );
    }
    const observed = await this.effectObserver.observe(
      {
        executionId: invocation.context.executionId,
        goalId: invocation.context.goalId,
        correlationId: invocation.context.correlationId,
        actionRequestId: outcome.actionRequestId,
        outcomeId: outcome.id,
        relativePath: outcome.data.relativePath,
      },
      invocation.signal,
    );
    const payload: DemoFileVerificationObservation = {
      ...observed,
      actionOutcomeId: outcome.id,
      actionRequestId: outcome.actionRequestId,
    };
    const observation = createObservationRecord({
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: outcome.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp: this.now(),
      type: FILESYSTEM_EFFECT_OBSERVATION_TYPE,
      source: this.effectObserver.id,
      observedAt: observed.observedAt,
      receivedAt: this.now(),
      confidence: observed.status === "failed" ? 0 : 1,
      uncertainty: observed.error?.message,
      validationStatus: observed.status === "failed" ? "invalid" : "valid",
      provenance: {
        kind: "connector",
        sourceId: this.effectObserver.id,
        details: {
          actionOutcomeId: outcome.id,
          actionRequestId: outcome.actionRequestId,
        },
      },
      payload,
    });
    const nextStep: NextStep = {
      kind: "invoke",
      target: "analysis",
      reason:
        "Independent filesystem evidence is ready for comparison with the active goal criteria.",
    };
    return {
      output: observation,
      nextStep,
      traceEvents: [
        {
          category: "observation",
          type: `verification.${observed.status}`,
          producer: observation.producer,
          payload: observation,
        },
      ],
    };
  }
}

/** Classifies the v0.1 request without applying the Phase 5 sandbox policy. */
export class DeterministicAnalysisCapability
  implements
    CapabilityImplementation<
      Observation<unknown>,
      DemoFileAssessment | DemoFileVerificationAssessment
    >
{
  readonly capability = "analysis" as const;
  private readonly now: () => string;

  constructor(options: DeterministicCapabilityOptions = {}) {
    this.now = options.now ?? nowIso;
  }

  invoke(
    invocation: CapabilityInvocation<Observation<unknown>>,
  ): CapabilityResult<DemoFileAssessment | DemoFileVerificationAssessment> {
    throwIfAborted(invocation.signal);
    const observation = requireObservation(invocation.input, invocation);
    if (observation.type === FILESYSTEM_EFFECT_OBSERVATION_TYPE) {
      return this.verifyObservedEffect(observation, invocation);
    }
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
        kind: "request-readiness",
        status: inspected.status,
        path: inspected.path,
        content: inspected.content,
        missingFields: inspected.missingFields,
        invalidFields: inspected.invalidFields,
      },
    });

    const nextStep = analysisNextStep(inspected);
    return {
      output: assessment,
      nextStep,
      traceEvents: [
        {
          category: "assessment",
          type: "assessment.created",
          producer: assessment.producer,
          payload: assessment,
        },
      ],
      goalUpdate:
        invocation.goal === undefined || inspected.status === "ready"
          ? undefined
          : updateGoalStatus(
              invocation.goal,
              inspected.status === "incomplete" ? "awaiting-human" : "failed",
              assessment.id,
              this.capability,
              this.now(),
              inspected.status === "incomplete"
                ? "Required request information is missing."
                : "The request contains invalid evidence.",
            ),
    };
  }

  private verifyObservedEffect(
    observation: Observation<unknown>,
    invocation: CapabilityInvocation,
  ): CapabilityResult<DemoFileVerificationAssessment> {
    const goal = invocation.goal;
    const payload = requireVerificationObservation(observation.payload);
    if (observation.causationId !== payload.actionOutcomeId) {
      throw new TypeError(
        "The verification Observation must be caused by its associated Action Outcome.",
      );
    }
    if (goal === undefined || goal.goalId !== invocation.context.goalId) {
      throw new TypeError(
        "Verification Analysis requires the active canonical Goal snapshot.",
      );
    }
    const expected = verificationExpectations(goal);
    const observedValues: Readonly<Record<string, unknown>> = {
      "filesystem.relative-path": payload.relativePath,
      "filesystem.utf8-content": payload.content,
      "filesystem.byte-count": payload.byteCount,
      "filesystem.sha256": payload.contentHash,
    };
    const checks = expected.map((criterion) => {
      const observed = observedValues[criterion.evidenceType];
      return {
        criterionId: criterion.id,
        evidenceType: criterion.evidenceType,
        expected: criterion.expected,
        observed,
        matches:
          payload.status === "observed" &&
          payload.exists &&
          observed === criterion.expected,
      };
    });
    const evidenceConsistencyReasons =
      payload.status === "observed" && payload.content !== undefined
        ? [
            ...(Buffer.byteLength(payload.content, "utf8") === payload.byteCount
              ? []
              : ["The observed byte count conflicts with the observed content."]),
            ...(createHash("sha256").update(payload.content).digest("hex") ===
            payload.contentHash
              ? []
              : ["The observed SHA-256 conflicts with the observed content."]),
          ]
        : [];
    const mismatchReasons = [
      ...(payload.status === "missing"
        ? ["The expected filesystem target is missing."]
        : []),
      ...(payload.status === "failed"
        ? [payload.error?.message ?? "The filesystem observation failed."]
        : []),
      ...evidenceConsistencyReasons,
      ...checks
        .filter((check) => !check.matches)
        .map(
          (check) =>
            `Criterion ${check.criterionId} did not match the observed ${check.evidenceType}.`,
        ),
    ];
    const verified = mismatchReasons.length === 0 && checks.length === 4;
    const result: DemoFileVerificationResult = {
      kind: "effect-verification",
      status: verified
        ? "verified"
        : payload.status === "failed"
          ? "unavailable"
          : "mismatch",
      checks,
      mismatchReasons,
    };
    const nextStep: NextStep = verified
      ? {
          kind: "terminate",
          outcome: "succeeded",
          reason:
            "Independent filesystem evidence satisfies every explicit goal criterion.",
        }
      : {
          kind: "invoke",
          target: "decision",
          reason:
            "Decision must evaluate the failed filesystem verification and bounded recovery options.",
        };
    const assessment = createAssessment<
      DemoFileVerificationResult,
      { readonly kind: "accept-verification" | "reject-verification" }
    >({
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: observation.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp: this.now(),
      summary: verified
        ? "Independent filesystem evidence matches all goal success criteria."
        : "Independent filesystem evidence does not satisfy the goal success criteria.",
      method: "panda.v0.1.filesystem-goal-verification",
      confidence: payload.status === "failed" ? 0 : 1,
      evidence: [
        {
          id: observation.id,
          kind: "record",
          description: "Independent filesystem effect observation",
        },
        {
          id: payload.actionOutcomeId,
          kind: "record",
          description: "Completed Action Outcome associated by Perception",
        },
      ],
      assumptions: [],
      informationNeeds:
        payload.status === "failed"
          ? [
              {
                field: "filesystem-effect",
                reason:
                  payload.error?.message ??
                  "Independent filesystem evidence is unavailable.",
                required: true,
              },
            ]
          : [],
      options: verified
        ? [
            {
              id: "accept-verification",
              description: "Accept the matching environmental evidence.",
              value: { kind: "accept-verification" },
            },
          ]
        : [
            {
              id: "reject-verification",
              description: "Reject goal completion from mismatched evidence.",
              value: { kind: "reject-verification" },
            },
          ],
      result,
    });
    return {
      output: assessment,
      nextStep,
      traceEvents: [
        {
          category: "assessment",
          type: verified ? "verification.verified" : "verification.failed",
          producer: assessment.producer,
          payload: assessment,
        },
      ],
      goalUpdate: verified
        ? updateGoalStatus(
            goal,
            "achieved",
            assessment.id,
            this.capability,
            this.now(),
            "Independent filesystem evidence matched all success criteria.",
          )
        : undefined,
    };
  }
}

/** Selects an effect candidate only when the deterministic evidence is ready. */
export class DeterministicDecisionCapability
  implements
    CapabilityImplementation<
      | DemoFileAssessment
      | DemoFileVerificationAssessment
      | DemoFileActionOutcome,
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
      | DemoFileAssessment
      | DemoFileActionOutcome
      | DemoFileVerificationAssessment
    >,
  ): CapabilityResult<DemoFileDecision> {
    throwIfAborted(invocation.signal);
    if (isOutcome(invocation.input)) {
      return this.decideActionOutcome(invocation.input, invocation);
    }
    if (isVerificationAssessment(invocation.input)) {
      return this.decideVerificationFailure(invocation.input, invocation);
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

      return {
        output: decision,
        nextStep,
        traceEvents: [
          {
            category: "decision",
            type: "decision.created",
            producer: decision.producer,
            payload: decision,
          },
        ],
      };
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

    return {
      output: decision,
      nextStep,
      traceEvents: [
        {
          category: "decision",
          type: "decision.created",
          producer: decision.producer,
          payload: decision,
        },
      ],
    };
  }

  private decideVerificationFailure(
    assessment: DemoFileVerificationAssessment,
    invocation: CapabilityInvocation,
  ): CapabilityResult<DemoFileDecision> {
    assertRecordIdentity(
      assessment as unknown as Record<string, unknown>,
      invocation,
      "Assessment",
    );
    if (assessment.result.status === "verified") {
      throw new TypeError(
        "Decision must not receive an already verified effect Assessment.",
      );
    }
    const nextStep: NextStep = {
      kind: "terminate",
      outcome: "failed",
      reason:
        "Independent effect verification failed and the bounded v0.1 fixture has no safe recovery.",
    };
    const decision = createDecision<DemoFileDecisionIntent>({
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: assessment.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp: this.now(),
      selectedOption: {
        id: "terminate-after-verification-failure",
        description: "Stop without claiming the goal was achieved.",
        intent: {
          kind: "no-action",
          reason:
            assessment.result.mismatchReasons.join(" ") ||
            "The environmental effect could not be verified.",
        },
      },
      alternatives: [
        {
          id: "future-bounded-recovery",
          description:
            "A later profile may safely retry, compensate, or gather more evidence.",
          intent: {
            kind: "no-action",
            reason: "Recovery and retry budgets are outside v0.1.",
          },
        },
      ],
      decisiveEvidence: [
        {
          id: assessment.id,
          kind: "record",
          description: "Failed independent effect-verification Assessment",
        },
        ...assessment.evidence,
      ],
      decisiveConstraints: [
        "A completed connector Outcome is insufficient evidence of goal success.",
        "The deterministic v0.1 fixture permits no retry or compensation.",
      ],
      rationale:
        "Independent Perception and Analysis did not establish every explicit success criterion, so safe termination must preserve the failed verification.",
      nextStep,
    });
    return {
      output: decision,
      nextStep,
      traceEvents: [
        {
          category: "decision",
          type: "decision.verification-failed",
          producer: decision.producer,
          payload: decision,
        },
      ],
      goalUpdate:
        invocation.goal === undefined
          ? undefined
          : updateGoalStatus(
              invocation.goal,
              "failed",
              decision.id,
              this.capability,
              this.now(),
              "Independent filesystem evidence did not satisfy the goal criteria.",
            ),
    };
  }

  private decideActionOutcome(
    outcome: DemoFileActionOutcome,
    invocation: CapabilityInvocation,
  ): CapabilityResult<DemoFileDecision> {
    assertRecordIdentity(
      outcome as unknown as Record<string, unknown>,
      invocation,
      "Outcome",
    );
    if (
      outcome.status === "succeeded" ||
      typeof outcome.actionRequestId !== "string" ||
      outcome.actionRequestId.trim() === ""
    ) {
      throw new TypeError("Decision requires a non-success Action outcome.");
    }
    const evaluation = policyEvaluationFromOutcome(outcome);
    if (evaluation !== undefined) {
      if (
        outcome.status !== "rejected" ||
        outcome.effectStatus !== "none" ||
        evaluation.point !== "effect" ||
        evaluation.result === "allow" ||
        outcome.causationId !== evaluation.id ||
        evaluation.causationId !== outcome.actionRequestId
      ) {
        throw new TypeError(
          "Decision received an inconsistent policy-rejection outcome.",
        );
      }
      assertRecordIdentity(
        evaluation as unknown as Record<string, unknown>,
        invocation,
        "PolicyEvaluation",
      );
    }

    const outcomeReason =
      evaluation?.reason ??
      outcome.error?.message ??
      `The connector reported ${outcome.status} with ${outcome.effectStatus} effect status.`;

    const nextStep: NextStep = {
      kind: "terminate",
      outcome: "failed",
      reason:
        "The requested filesystem effect did not complete successfully and no safe v0.1 alternative remains.",
    };
    const decision = createDecision<DemoFileDecisionIntent>({
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: outcome.id,
      producer: { kind: "capability", capability: this.capability },
      timestamp: this.now(),
      selectedOption: {
        id: "terminate-after-action-failure",
        description: "Stop after the non-success Action outcome.",
        intent: {
          kind: "no-action",
          reason: outcomeReason,
        },
      },
      alternatives: [
        {
          id: "await-future-safe-request",
          description:
            "A future execution may provide a policy-permitted request and healthy connector.",
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
          description: `${outcome.status} Action outcome with ${outcome.effectStatus} effect status`,
        },
        ...(evaluation === undefined
          ? []
          : [
              {
                id: evaluation.id,
                kind: "policy" as const,
                description: evaluation.reason,
              },
            ]),
      ],
      decisiveConstraints: [
        "A non-success connector or policy outcome cannot be treated as completed work.",
        "The v0.1 fixture has no retry or recovery alternative within the same execution.",
      ],
      rationale:
        "The bounded Action attempt did not complete successfully. Its explicit effect status is preserved, and safe termination prevents uncertainty or partial work from being promoted to success.",
      nextStep,
    });

    return {
      output: decision,
      nextStep,
      traceEvents: [
        {
          category: "decision",
          type: "decision.action-failed",
          producer: decision.producer,
          payload: decision,
        },
      ],
      goalUpdate:
        invocation.goal === undefined
          ? undefined
          : updateGoalStatus(
              invocation.goal,
              "failed",
              decision.id,
              this.capability,
              this.now(),
              `Action did not complete successfully: ${outcomeReason}`,
            ),
    };
  }
}

/**
 * Policy-gated Action boundary. An explicit Phase 6 connector registry enables
 * dispatch; callers without one retain the safe Phase 5 wait behavior.
 */
export class DeterministicActionCapability
  implements
    CapabilityImplementation<
      DemoFileDecision,
      | ActionRequest<DemoFileWriteParameters>
      | DemoFileDecision
      | DemoFileActionOutcome
    >
{
  readonly capability = "action" as const;
  private readonly now: () => string;
  private readonly policyEngine: PolicyEngine;
  private readonly actionConnectorRegistry?: ActionConnectorRegistry;
  private readonly effectObserver?: EffectObserver;

  constructor(options: DeterministicCapabilityOptions = {}) {
    this.now = options.now ?? nowIso;
    this.policyEngine = options.policyEngine ?? new V01PolicyEngine();
    this.actionConnectorRegistry = options.actionConnectorRegistry;
    this.effectObserver = options.effectObserver;
  }

  async invoke(
    invocation: CapabilityInvocation<DemoFileDecision>,
  ): Promise<
    CapabilityResult<
      | ActionRequest<DemoFileWriteParameters>
      | DemoFileDecision
      | DemoFileActionOutcome
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
        traceEvents: [
          {
            category: "outcome",
            type: "action.rejected",
            producer: outcome.producer,
            payload: outcome,
          },
        ],
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

    if (this.actionConnectorRegistry === undefined) {
      return {
        output: authorizedRequest,
        nextStep: {
          kind: "wait",
          reason:
            "Policy allowed the exact request, but no Action connector registry is configured.",
          resumeOn: ACTION_CONNECTOR_RESUME_EVENT,
        },
        policyEvaluations: [evaluation],
      };
    }

    const connectorInvocationId = createId("conninv");
    const connectorStartedAt = this.now();
    let connectorFailed = false;
    let outcome: DemoFileActionOutcome;
    try {
      outcome = (await this.actionConnectorRegistry.execute(
        authorizedRequest,
        {
          id: connectorInvocationId,
          context: invocation.context,
          signal: invocation.signal,
        },
      )) as DemoFileActionOutcome;
      requireConnectorOutcome(
        outcome,
        authorizedRequest,
        connectorInvocationId,
        invocation,
      );
    } catch (error) {
      connectorFailed = true;
      const timestamp = this.now();
      const rejectedBeforeDispatch =
        error instanceof ActionConnectorRegistryError;
      outcome = createOutcome({
        executionId: invocation.context.executionId,
        goalId: invocation.context.goalId,
        correlationId: invocation.context.correlationId,
        causationId: connectorInvocationId,
        producer: { kind: "runtime", component: "action-connector-dispatch" },
        timestamp,
        actionRequestId: authorizedRequest.id,
        status: rejectedBeforeDispatch ? "failed" : "indeterminate",
        effectStatus: rejectedBeforeDispatch ? "none" : "unknown",
        startedAt: connectorStartedAt,
        endedAt: timestamp,
        error: {
          code:
            error instanceof ActionConnectorRegistryError
              ? error.code
              : "ACTION_CONNECTOR_FAILED",
          message: describeError(error),
        },
      });
    }

    const connectorEndedAt = this.now();
    const connectorInvocation = createConnectorInvocation({
      id: connectorInvocationId,
      executionId: invocation.context.executionId,
      goalId: invocation.context.goalId,
      correlationId: invocation.context.correlationId,
      causationId: authorizedRequest.id,
      producer: {
        kind: "connector",
        connectorId: authorizedRequest.connectorId,
      },
      timestamp: connectorStartedAt,
      connectorId: authorizedRequest.connectorId,
      actionRequestId: authorizedRequest.id,
      status: connectorFailed ? "failed" : "completed",
      startedAt: connectorStartedAt,
      endedAt: connectorEndedAt,
      outcomeId: outcome.id,
    });
    const completed =
      outcome.status === "succeeded" && outcome.effectStatus === "completed";
    const verificationEnabled = completed && this.effectObserver !== undefined;

    return {
      output: outcome,
      nextStep: verificationEnabled
        ? {
            kind: "invoke",
            target: "perception",
            reason:
              "Perception must observe the completed filesystem effect independently.",
          }
        : completed
          ? {
              kind: "wait",
              reason:
                "The connector completed the write; independent Phase 7 verification is still required.",
              resumeOn: EFFECT_VERIFICATION_RESUME_EVENT,
            }
          : {
              kind: "invoke",
              target: "decision",
              reason:
                "Decision must evaluate the non-success Action outcome and its effect status.",
            },
      policyEvaluations: [evaluation],
      traceEvents: [
        {
          category: "action-request",
          type: "action.authorized",
          producer: authorizedRequest.producer,
          payload: authorizedRequest,
        },
        {
          category: "connector-invocation",
          type: connectorFailed ? "connector.failed" : "connector.completed",
          producer: connectorInvocation.producer,
          payload: connectorInvocation,
        },
        {
          category: "outcome",
          type: `action.${outcome.status}`,
          producer: outcome.producer,
          payload: outcome,
        },
      ],
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

/** Registers the deterministic v0.1 set atomically with ownership-safe cleanup. */
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

function isOutcome(value: unknown): value is DemoFileActionOutcome {
  return (
    isRecord(value) &&
    value.kind === "outcome" &&
    typeof value.id === "string" &&
    typeof value.actionRequestId === "string" &&
    OUTCOME_STATUSES.has(value.status as DemoFileActionOutcome["status"]) &&
    EFFECT_STATUSES.has(
      value.effectStatus as DemoFileActionOutcome["effectStatus"],
    )
  );
}

const OUTCOME_STATUSES = new Set<DemoFileActionOutcome["status"]>([
  "succeeded",
  "failed",
  "rejected",
  "cancelled",
  "timeout",
  "indeterminate",
  "partial",
]);

const EFFECT_STATUSES = new Set<DemoFileActionOutcome["effectStatus"]>([
  "none",
  "attempted",
  "completed",
  "partial",
  "unknown",
]);

function policyEvaluationFromOutcome(
  outcome: DemoFileActionOutcome,
): PolicyEvaluation | undefined {
  const data = outcome.data;
  if (
    isRecord(data) &&
    isRecord(data.policyEvaluation) &&
    data.policyEvaluation.kind === "policy-evaluation"
  ) {
    return data.policyEvaluation as unknown as PolicyEvaluation;
  }
  return undefined;
}

function requireConnectorOutcome(
  value: unknown,
  request: ActionRequest,
  connectorInvocationId: string,
  invocation: CapabilityInvocation,
): asserts value is DemoFileActionOutcome {
  if (
    !isOutcome(value) ||
    value.actionRequestId !== request.id ||
    value.causationId !== connectorInvocationId ||
    value.producer.kind !== "connector" ||
    value.producer.connectorId !== request.connectorId ||
    typeof value.startedAt !== "string" ||
    value.startedAt.trim() === "" ||
    typeof value.endedAt !== "string" ||
    value.endedAt.trim() === "" ||
    (value.status === "succeeded" && value.effectStatus !== "completed")
  ) {
    throw new TypeError(
      "The Action connector returned an invalid or causally unrelated Outcome.",
    );
  }
  assertRecordIdentity(
    value as unknown as Record<string, unknown>,
    invocation,
    "Outcome",
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
    value.kind !== "request-readiness" ||
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

function isVerificationAssessment(
  value: unknown,
): value is DemoFileVerificationAssessment {
  return (
    isRecord(value) &&
    value.kind === "assessment" &&
    isRecord(value.result) &&
    value.result.kind === "effect-verification" &&
    (value.result.status === "verified" ||
      value.result.status === "mismatch" ||
      value.result.status === "unavailable") &&
    Array.isArray(value.result.checks) &&
    Array.isArray(value.result.mismatchReasons)
  );
}

function requireVerificationObservation(
  value: unknown,
): DemoFileVerificationObservation {
  if (
    !isRecord(value) ||
    (value.status !== "observed" &&
      value.status !== "missing" &&
      value.status !== "failed") ||
    typeof value.relativePath !== "string" ||
    typeof value.exists !== "boolean" ||
    typeof value.byteCount !== "number" ||
    !Number.isSafeInteger(value.byteCount) ||
    value.byteCount < 0 ||
    typeof value.observedAt !== "string" ||
    typeof value.actionOutcomeId !== "string" ||
    typeof value.actionRequestId !== "string"
  ) {
    throw new TypeError(
      "Analysis requires a typed filesystem effect-verification observation.",
    );
  }
  if (
    (value.status === "observed" &&
      (value.exists !== true ||
        typeof value.content !== "string" ||
        typeof value.contentHash !== "string" ||
        value.hashAlgorithm !== "sha256")) ||
    (value.status === "missing" && value.exists !== false) ||
    (value.status === "failed" && !isRecord(value.error)) ||
    Number.isNaN(Date.parse(value.observedAt))
  ) {
    throw new TypeError(
      "The filesystem effect-verification observation has inconsistent status evidence.",
    );
  }
  return value as unknown as DemoFileVerificationObservation;
}

interface VerificationExpectation {
  readonly id: string;
  readonly evidenceType:
    | "filesystem.relative-path"
    | "filesystem.utf8-content"
    | "filesystem.byte-count"
    | "filesystem.sha256";
  readonly expected: unknown;
}

const VERIFICATION_EVIDENCE_TYPES = [
  "filesystem.relative-path",
  "filesystem.utf8-content",
  "filesystem.byte-count",
  "filesystem.sha256",
] as const;

function verificationExpectations(
  goal: Goal,
): readonly VerificationExpectation[] {
  if (goal.successCriteria.length !== VERIFICATION_EVIDENCE_TYPES.length) {
    throw new TypeError(
      "The deterministic v0.1 Goal requires exactly four filesystem success criteria.",
    );
  }
  const expectations = VERIFICATION_EVIDENCE_TYPES.map((evidenceType) => {
    const criteria = goal.successCriteria.filter(
      (criterion) => criterion.evidenceType === evidenceType,
    );
    if (criteria.length !== 1 || criteria[0].expected === undefined) {
      throw new TypeError(
        `Goal verification requires exactly one ${evidenceType} criterion with an expected value.`,
      );
    }
    return {
      id: criteria[0].id,
      evidenceType,
      expected: criteria[0].expected,
    };
  });
  return expectations;
}

function updateGoalStatus(
  goal: Goal,
  status: GoalStatus,
  causationId: string,
  capability: "analysis" | "decision",
  timestamp: string,
  statusReason: string,
): Goal {
  return {
    ...goal,
    revision: goal.revision + 1,
    causationId,
    producer: { kind: "capability", capability },
    timestamp,
    status,
    statusReason,
  };
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

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The Action connector failed with a non-error value.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
