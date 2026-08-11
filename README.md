# PANDA Agent Framework

PANDA is an open-source TypeScript intelligence runtime for building
goal-directed agents and automation. Its five independently selectable
capabilities are **Perception, Analysis, Network, Decision, and Action**. A
coordinator routes between them dynamically, policy gates transitions and
effects, and an append-only causal trace records what the system observed,
inferred, decided, authorized, executed, and verified.

An LLM may implement reasoning inside a capability, but it is neither required
nor the orchestrator. The current v0.1 daemon demonstrates the architecture with
one deterministic, policy-bounded filesystem action whose effect is
independently observed before the Goal can succeed.

- Static project homepage: [`index.html`](./index.html)
- Documentation index: [`docs/README.md`](./docs/README.md)
- Developer onboarding: [`docs/developer-onboarding.md`](./docs/developer-onboarding.md)
- Framework requirements: [`docs/requirements.md`](./docs/requirements.md)

## The five capabilities

- **Perception** accepts and validates signals and observes environmental facts.
- **Analysis** derives assessments, interprets context, and evaluates evidence.
- **Network** exchanges information with external people, agents, and systems.
- **Decision** selects and explains an authorized next step or action candidate.
- **Action** performs approved effects through responsibility-specific connectors.

These are responsibilities, not stages in a fixed loop. Any capability can
request any policy-permitted capability, itself, a wait, or termination.
Memory is persistence used by capabilities; planning, understanding, and
reflection are techniques used inside capabilities rather than additional
runtime states.

```text
signal
  -> Goal + Execution
  -> capability-selected NextStep
  -> transition policy
  -> Decision + effect policy
  -> Action connector
  -> independent Perception
  -> Analysis verifies Goal criteria
  -> terminal Execution + causal trace
```

## Design goals

- **Modular:** capability implementations, stores, policies, and connectors are
  replaceable behind typed boundaries.
- **Observable and explainable:** material decisions and effects retain identity,
  provenance, correlation, causation, and ordered trace records.
- **Non-linear:** routing comes from capability results and policy rather than a
  predetermined sequence.
- **Safe by construction:** effects cross an explicit policy and connector
  boundary and are not considered verified merely because dispatch succeeded.
- **Model-agnostic and local-first:** rules, people, optimizers, state machines,
  planners, ML models, or LLMs can implement capabilities without requiring a
  broker or cloud service.

## Repository

```text
panda/
  apps/
    cli/
    daemon/
    dashboard/
  packages/
    core/
    sdk/
    shared/
  examples/
  docs/
  scripts/
```

- `apps/daemon` owns the canonical coordinator, process-local stores, policy,
  connector, observer, HTTP API, and WebSocket trace stream.
- `apps/dashboard` displays canonical executions, Goals, source-linked operator
  answers, and sequence-stable causal traces.
- `apps/cli` provides local initialization, development, health, and version
  commands.
- `packages/shared` defines canonical records, contracts, IDs, timestamps, and
  logging utilities.
- `packages/core` implements stores, dynamic coordination, deterministic v0.1
  capabilities, policy gates, the filesystem Action connector, and independent
  effect observation.
- `packages/sdk` provides a typed client for execution and trace endpoints.

## Quick start

Prerequisites: Node.js 20 or newer and pnpm 9.x.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm dev
```

The daemon listens at `http://127.0.0.1:4317` and the dashboard at
`http://127.0.0.1:5173` by default.

Create and independently verify a sandboxed file:

```bash
curl --request POST \
  --header 'content-type: application/json' \
  --data '{"payload":{"path":"proof.txt","content":"PANDA v0.1 completed"}}' \
  http://127.0.0.1:4317/executions
```

The response includes the execution ID and status, canonical Execution and
Goal, real Outcome, verification Assessment, and trace URL. Process-local state
is available through:

- `GET /health`
- `POST /executions`
- `GET /executions`
- `GET /executions/:id`
- `GET /executions/:id/trace`
- `WS /events`

The server is an unauthenticated local development service. Keep it bound to
loopback and do not expose it to an untrusted network.

## SDK example

```ts
import { PandaClient } from "@panda/sdk";

const client = new PandaClient();
const execution = await client.createExecution({
  source: "example",
  payload: {
    path: "proof.txt",
    content: "PANDA v0.1 completed",
  },
});

const trace = await client.getExecutionTrace(execution.executionId);
console.log(execution.status, trace.length);
```

See [`examples/basic-run.ts`](./examples/basic-run.ts) for the executable form.

## CLI

```bash
pnpm --filter @panda/cli panda init
pnpm --filter @panda/cli panda dev
pnpm --filter @panda/cli panda daemon
pnpm --filter @panda/cli panda dashboard
pnpm --filter @panda/cli panda doctor
pnpm --filter @panda/cli panda version
```

## Current limits

v0.1 state is process-local and is lost when the daemon restarts. The bounded
filesystem action is the only supported real effect. Authentication, durable
storage and retries, general planning, LLM integration, distributed execution,
multiple agents, plugins, MCP, and cloud deployment are not implemented.

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
[MIT License](./LICENSE.md#software-license-mit). Original prose, diagrams, and
other non-code content in this README and `docs/` are available under
[Creative Commons Attribution 4.0 International](./docs/license.md). See the
[complete licensing notice](./LICENSE.md) for scope and exclusions.

## Long-term vision

PANDA aims to become a reusable architecture for intelligent agents, analogous
to the role MVC plays in web applications: a shared vocabulary and separation
of responsibilities without prescribing one implementation technology.
