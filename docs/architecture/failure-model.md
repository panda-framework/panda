# Failure Model

`Failure` contains ID, category, origin capability/connector, time, message/code, retryability, cause, evidence reference, correlation/causation, and partial-result/effect status. Categories include perception, analysis, network, decision, action, connector, policy violation, timeout, cancellation, invalid contract, conflict, and internal runtime failure.

Failures are data at the coordination boundary. Policy and Decision may choose retry, backoff, alternate implementation, additional Perception, further Analysis, Network escalation, compensation, human intervention, wait, or termination. Thus `ActionFailure → Analysis` and `NetworkFailure → Decision` are ordinary routes.

Retries require budgets, deadlines, idempotency, and attempt records. Unknown external effect is distinct from confirmed failure. Runtime process corruption or invariant violation may stop an execution, but one execution failure should not automatically crash unrelated work. Supervisory strategy is an implementation choice.
