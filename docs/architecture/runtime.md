# Framework and Runtime

The **framework** defines capability and domain contracts, extension points, connector ports, policy/state/persistence ports, conformance rules, and an embeddable developer API. It does not require a daemon or own application lifecycle.

A future **runtime** may provide registration and discovery, lifecycle, routing, transition validation, context propagation, goal and state repositories, policy enforcement, scheduling, connector management, event handling, retries/timeouts, concurrency control, persistence, and observability.

```mermaid
flowchart TB
  API[Embedded API / daemon API]
  CO[Coordinator and scheduler]
  REG[Capability registry]
  POL[Policy engine]
  BUS[Optional command/event transport]
  CAPS[Five capability implementations]
  CON[Typed connector registry]
  SC[State, context, and goals]
  PERS[Persistence ports]
  OBS[Tracing, logs, metrics, audit]
  API --> CO
  CO --> REG
  CO --> POL
  CO <--> BUS
  CO --> CAPS
  CAPS --> CON
  CO --> SC
  BUS --> PERS
  CO --> PERS
  CO --> OBS
  CAPS --> OBS
  CON --> OBS
```

The coordinator invokes; capabilities reason or transform; connectors cross external boundaries. A minimal embedded coordinator may be a few direct calls with in-memory ports. A daemon, durable scheduler, or distributed runtime is an optional implementation profile.
