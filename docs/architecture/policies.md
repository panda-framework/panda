# Policies and Constraints

Policies are explicit, testable rules evaluated independently from capability business logic where practical. Inputs include principal, goal, proposed transition/intent, target, resource, environment/state version, confidence/trust, and execution context. The result is `allow`, `deny`, or `require` (for approval/additional evidence), with policy IDs and reasons.

Policy points include capability invocation, transition commitment, message exchange, state mutation, resource use, and especially action authorization. Timeouts, retry budgets, rate/resource limits, human approval, security permissions, safety constraints, and allowed transition sets belong here or in runtime configuration—not scattered through implementations.

Central evaluation provides consistency and audit; connectors still enforce local permissions as defense in depth. Policy changes and approvals are auditable. A policy denial is structured information and may drive another Decision; it must never be silently converted into success.
