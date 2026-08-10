# State, Context, and Goals

PANDA separates three concepts instead of passing a generic mutable dictionary.

| Concept | Meaning | Lifetime and owner |
| --- | --- | --- |
| System state | Durable facts about the autonomous system: goals, tasks, modes, decision/outcome references, execution status | State repository; updated through explicit commands with versioning |
| Environment state | The system's current, fallible beliefs about the outside world, linked to observations and confidence/freshness | Belief/environment repository; updated by validated interpretation |
| Execution context | Scoped propagation data: execution/correlation/causation IDs, objective/goal references, deadline, principal, trace, invocation history, ephemeral values | Coordinator; copied/derived per invocation, not durable by default |

Capabilities receive immutable snapshots and issue explicit update proposals. Optimistic versions or equivalent concurrency control prevent silent lost updates. Sensitive values are references to a secret facility, never arbitrary context entries.

`Goal` is first-class: ID, objective, priority, constraints, success conditions, failure conditions, status, owner/principal, and optional parent/dependencies. Goal creation, reprioritization, suspension, completion, and abandonment are observable. Whether a goal update is selected by Decision or authorized through a control plane remains policy-dependent.
