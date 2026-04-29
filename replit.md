# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **WebSockets**: ws (attached to the HTTP server in api-server)

## Artifacts

### Multiplayer Card Game (`artifacts/card-game`)
- React + Vite frontend at `/`
- Full trick-taking card game (2–6 players, 52-card deck)
- Connects via WebSocket to `artifacts/api-server` at `/ws`
- Game logic in `artifacts/api-server/src/lib/gameEngine.ts`
- Game state management in `artifacts/api-server/src/lib/gameManager.ts`

### API Server (`artifacts/api-server`)
- Express 5 + Node.js
- WebSocket server on `/ws` for real-time game state
- REST API on `/api`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Game Rules

- Standard 52-card deck shuffled and dealt equally to all players
- First round starts with the Ace of Spades (holder must play it)
- Follow suit if you have it; otherwise play any card
- Highest card of the lead suit wins the round
- Round winner leads the next round
- Player with the most tricks won at the end loses
- Loser receives the Ace of Spades as a penalty card
