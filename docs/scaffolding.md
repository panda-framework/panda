# PANDA Initial Scaffolding

This scaffold follows the initial specification in
`PANDA_Initial_Scaffolding_Specification.docx`.

## Implemented

- pnpm workspace with `apps/*` and `packages/*`.
- TypeScript build and typecheck pipeline.
- Fastify daemon with local HTTP API.
- WebSocket event stream at `/events`.
- In-memory agent session store.
- LangGraph.js PANDA loop nodes:
  - Perception
  - Analysis
  - Network
  - Decision
  - Action
- React/Vite/Tailwind dashboard with the required pages:
  - Home
  - Agent Console
  - Tasks
  - Memory
  - Settings
  - Logs
- Commander-based CLI with the required commands.
- SDK client for daemon API calls.

## Deferred

The following specification items are intentionally not implemented yet:

- Plugin marketplace
- MCP support
- Docker deployment
- Cloud synchronization
- Multiple agents
- Authentication
- Vector memory
- Mobile apps

## Local Service Direction

The daemon is structured as a long-lived local Node.js process. It can later be
wrapped with a `systemd` unit or optional PM2 process file without changing the
API contract.
