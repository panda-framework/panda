# PANDA Agent Framework

PANDA is an open-source agent framework for building intelligent AI agents.
It models intelligence as a dynamic state machine where agents can move freely
between five agent states: **Perception**, **Analysis**, **Network**,
**Decision**, and **Act**.

Instead of forcing agents through a rigid workflow, PANDA focuses on how
intelligent systems should think, reason, collaborate, decide, and execute.

## What PANDA Means

- **Perception**: Gather information from users, tools, APIs, sensors, memory,
  and the surrounding environment.
- **Analysis**: Understand context, reason through options, evaluate evidence,
  and form plans.
- **Network**: Collaborate with humans, other agents, tools, vector databases,
  documentation, and external systems.
- **Decision**: Select the next best action, tool, workflow, or agent state.
- **Act**: Execute work such as API calls, code changes, emails, database
  updates, automations, or physical actions.

## Core Idea

PANDA is not a linear loop or fixed pipeline. Every state can transition directly
to every other state, allowing agents to adapt their reasoning path to the
current context.

Example flows:

```text
Perception -> Network -> Analysis -> Decision -> Act
```

```text
Perception -> Act -> Perception -> Decision
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

## Long-Term Vision

The goal of PANDA is to become a standard agent architecture for intelligent
agents, similar to how MVC became a standard architecture for web applications.

## Guiding Principle

Perceive deeply. Analyze clearly. Network broadly. Decide wisely. Act
powerfully.
