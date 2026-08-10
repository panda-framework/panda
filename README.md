# PANDA Agent Framework

PANDA is an open-source intelligence runtime for building event-driven agents,
automation systems, robotics controllers, monitoring tools, and multimodal
applications. It treats every input as an **observation** and every output as an
**action**. Connectors observe the outside world, analyzers react to observation
types, and the scheduler controls execution.

The LLM is one reasoning component in this architecture. It is not the
orchestrator.

Static project homepage: [`index.html`](./index.html)

Project documentation: [`docs/README.md`](./docs/README.md)

Developer onboarding:
[`docs/developer-onboarding.md`](./docs/developer-onboarding.md)

Framework requirements: [`docs/requirements.md`](./docs/requirements.md)

## What PANDA Means

- **Perception**: Gather information from users, tools, APIs, sensors, memory,
  and the surrounding environment.
- **Understanding**: Interpret context, classify observations, and derive
  meaning.
- **Memory**: Store, summarize, or discard observation history.
- **Planning**: Form candidate paths and execution strategies.
- **Decision**: Select the next best action, tool, workflow, or agent state.
- **Execution**: Dispatch actions through connectors.
- **Reflection**: Evaluate results and emit follow-up observations.

## Core Idea

PANDA is not a linear loop or fixed pipeline. Every state can transition to any
other state, and transitions are represented as observations rather than direct
function calls. The scheduler owns execution flow by dispatching observations to
interested modules.

The runtime starts with an in-memory observation bus and is designed so Redis
Streams, NATS, Kafka, RabbitMQ, or another durable queue can replace it later.

```text
                    +----------------+
                    | ObservationBus |
                    +----------------+
                       ^          |
   observations        |          | dispatch
 +------------+        |          v
 | Connectors | -----> |    +-----------+       +-----------+
 +------------+             | Scheduler | ----> | Analyzers |
      ^                     +-----------+       +-----------+
      | actions                   |                 |
      |                           v                 | new observations
 +----------------+        +-------------+          |
 | ActionDispatcher | <--- | State Engine | <-------+
 +----------------+        +-------------+
          |
          v
    output connectors
```

```text
Perception -> Execution -> Memory
```

```text
Reflection -> Planning -> Decision -> Perception
```

This fully connected state-machine model supports adaptive reasoning instead of
pure procedural execution.

## Design Goals

PANDA is designed to be:

- **Modular**: Each agent state can be implemented, extended, or replaced.
- **Observable**: Agent behavior should be inspectable and traceable.
- **Explainable**: State transitions and decisions should be understandable.
- **Composable**: PANDA agents should integrate cleanly with tools, runtimes,
  products, and other agents.
- **Deterministic when needed**: Workflows can be constrained for reliability.
- **Autonomous when possible**: Agents can decide and act with appropriate
  flexibility.
- **Connector-first**: Filesystems, browsers, GitHub, Slack, cameras, sensors,
  databases, REST APIs, BLE, MQTT, and other systems use one connector shape.

## Model Agnostic

PANDA is not tied to a single AI provider or model family. It can support:

- OpenAI
- Anthropic
- Gemini
- Local models
- Custom reasoning engines
- Systems that do not require an LLM

## Future Direction

Planned areas of development include:

- Memory
- Planning
- Retries
- Confidence scoring
- Plugin system
- Observability
- Execution tracing
- Multi-agent collaboration
- Human approvals
- Distributed execution

## Initial TypeScript Scaffold

This repository is now organized as a lightweight pnpm monorepo for the initial
PANDA framework scaffold.

```text
panda/
  apps/
    cli/
    daemon/
    dashboard/
  packages/
    core/
    graph/
    sdk/
    shared/
  examples/
  docs/
  scripts/
```

### Workspace Packages

- `apps/cli`: `panda` command surface powered by `commander`.
- `apps/daemon`: local Fastify daemon with HTTP API and WebSocket events.
- `apps/dashboard`: React, Vite, TypeScript, Tailwind dashboard.
- `packages/core`: canonical execution store, capability registry, dynamic
  execution coordinator, plus the legacy observation bus, scheduler, action
  dispatcher, connectors, sessions, and configuration.
- `packages/graph`: compatibility wrapper that runs through the event-driven
  runtime instead of a fixed reasoning loop.
- `packages/sdk`: typed daemon client plus public observation/action types.
- `packages/shared`: shared schemas, IDs, timestamps, and logger utilities.

### Runtime Concepts

- `PandaObservation`: id, timestamp, source, type, priority, confidence, payload,
  correlation id, and metadata.
- `PandaAction`: id, timestamp, target connector, type, payload, correlation id,
  and metadata.
- `InMemoryObservationBus`: queue-backed bus for local development.
- `PandaScheduler`: dispatches observations to analyzers by observation type.
- `ActionDispatcher`: routes actions to the connector that owns the target.
- `BaseConnector`: common interface with `start`, `stop`, `subscribe`,
  `publish`, `health`, `metadata`, and optional `execute`.
- `ObservationMemory`: subscribes to observations and decides whether to store,
  summarize, or discard them.
- `StateTransitionEngine`: applies transition events without enforcing a fixed
  loop.

### Connector Example

```ts
import { FilesystemConnector, PandaRuntime } from "@panda/core";

const runtime = new PandaRuntime();
const filesystem = new FilesystemConnector(runtime.bus);

runtime.registerConnector(filesystem);

await filesystem.start();
await filesystem.observeChange("README.md", "updated");
await runtime.bus.drain();
```

### Development

Install dependencies:

```bash
pnpm install
```

Start daemon and dashboard together:

```bash
pnpm dev
```

Build everything:

```bash
pnpm build
```

Run type checks:

```bash
pnpm typecheck
```

Run tests:

```bash
pnpm test
```

Start the built daemon:

```bash
pnpm start
```

### CLI

The scaffold includes the required initial commands:

```bash
pnpm --filter @panda/cli panda init
pnpm --filter @panda/cli panda dev
pnpm --filter @panda/cli panda daemon
pnpm --filter @panda/cli panda dashboard
pnpm --filter @panda/cli panda doctor
pnpm --filter @panda/cli panda version
```

### Daemon API

By default the daemon listens on `http://127.0.0.1:4317`.

- `GET /health`
- `GET /sessions`
- `GET /sessions/:id`
- `POST /runs`
- `WS /events`

The dashboard communicates only through the local daemon API and WebSocket.

<!-- donations:start -->
## Donations

Donation seed phrases are generated locally by running:

```bash
npm run generate:wallets
```

The generated recovery phrases are saved in `generated_wallets/`, which is
ignored by git. Only public donation addresses are listed here.

| Chain | Address |
| --- | --- |
| Bitcoin | `bc1qtlywhsj3rvmvrz9zuh2l3czncd7mwpmtknjd83` |
| Ethereum / EVM | `0x88C8183cDDAA5e848Ec222F42771Ba055e9f9fb7` |
| Solana | `Ab8qd9GriUraYdMfpYSbUtfXoqiNSqdA5xrBM9rn7Tku` |
| Litecoin | `ltc1qt7gyfk6tam5zvd6pej9qcat2ep80w3xykue8y7` |
| Dogecoin | `DRKDnV536QVdYUAeCnFewWjfztUkFEwcNr` |
| Tron | `THiYW7Fh1CtpbTwixcDNYR6B1Si6761Uoy` |
| XRP Ledger | `rKS5gBGerGRvFEoBWhUcD2fazLYnBcqgWK` |
| Cosmos | `cosmos10mdk53s6e377pmd7frcrd5t52qndhpuc5f0zfn` |
| Polkadot | `14RJwVeSWmW3a5Rk1R1Am89nKYan1B25MuGnKozR395s9Ftk` |

The Ethereum / EVM address can also receive assets on Ethereum, BNB Smart Chain, Polygon, Arbitrum, Optimism, Base, Avalanche C-Chain, and Fantom when using the correct network.
<!-- donations:end -->

## License

PANDA source code and executable examples are available under the
[MIT License](./LICENSE.md#software-license-mit). The original prose, diagrams,
and other non-code content in this README and `docs/` are available under
[Creative Commons Attribution 4.0 International](./docs/license.md). See the
[complete licensing notice](./LICENSE.md) for scope and exclusions.

## Long-Term Vision

The goal of PANDA is to become a standard agent architecture for intelligent
agents, similar to how MVC became a standard architecture for web applications.

## Guiding Principle

Observe continuously. Schedule deliberately. Decide clearly. Act through
connectors. Reflect with context.
