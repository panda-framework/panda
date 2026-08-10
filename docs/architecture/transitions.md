# Transitions and Events

A transition is a requested change in capability focus for one execution, not mutation of a single system-wide stage.

```ts
type NextStep =
  | { kind: "invoke"; target: "perception" | "analysis" | "network" | "decision" | "action"; reason: string; payloadRef?: string }
  | { kind: "wait"; reason: string; resumeOn?: string }
  | { kind: "terminate"; reason: string; outcome: "succeeded" | "failed" | "cancelled" };
```

A committed `TransitionRecord` adds source invocation, goal/execution ID, trigger and causation IDs, policy result, timestamp, and status. The coordinator rejects stale source state, invalid payloads, unknown targets, or policy violations. Self-transitions are valid. Multiple executions may progress concurrently; ordering is scoped by execution/correlation rather than global.

Commands request work (`InvokeCapability`, `ExecuteAction`). Events are immutable facts (`ObservationCreated`, `DecisionMade`, `ActionFailed`). An event bus is recommended for a full runtime but optional for embedded framework use. Delivery guarantees, persistence, ordering, and event sourcing are implementation choices. Domain events must not be confused with telemetry, though the same occurrence may emit both.

Policy is checked when accepting a transition and again at effect boundaries where conditions may have changed.
