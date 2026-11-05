# Donkey

The current game lives in `artifacts/card-game` (React) and
`artifacts/api-server` (Express and WebSocket). `deploy-package` is a separate,
standalone deployment copy.

Username/password accounts, friends and admin controls are documented in
[ACCOUNTS.md](ACCOUNTS.md). No SMS or Firebase project is needed.

## Run locally

Use Node.js 20.19+ and pnpm 10. From this folder:

```sh
pnpm install
pnpm dev
```

On this Windows checkout, `.\.tools\pnpm.CMD` can also be used for pnpm.
Keep the terminal open while playing. Ctrl+C stops the development services.

- Game: http://localhost:5173
- Backend health: http://localhost:3001/api/healthz
- WebSocket: /ws (forwarded to the backend by Vite)

Open the game in two browsers or tabs. Create a room in the first, join its
room code in the second, then start the game. Rooms support 2 to 10 players.

No environment file is needed for local development. Optional settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| FRONTEND_PORT | 5173 | Frontend port for `pnpm dev` |
| API_PORT | 3001 | Backend port for `pnpm dev` |
| PORT | 3001 (backend), 5173 (frontend) | Port when running either service separately |
| BASE_PATH | / | Frontend base path |
| API_PROXY_TARGET | http://127.0.0.1:3001 | Vite development proxy destination |
| VITE_API_URL | Current origin | HTTP URL for a separately hosted frontend |
| VITE_WS_URL | Current host, /ws | WebSocket URL for a separately hosted frontend |

For custom development ports in PowerShell:

```powershell
$env:FRONTEND_PORT = "5174"
$env:API_PORT = "3002"
pnpm dev
```

Game rooms and penalties are stored in server memory. Restarting the backend
clears them; the client returns to the lobby if a saved room no longer exists.

## Checks

```sh
pnpm --filter @workspace/card-game typecheck
pnpm --filter @workspace/card-game build
pnpm --filter @workspace/api-server build
```

With `pnpm dev` running, `pnpm test:connection` checks HTTP and WebSocket
proxying, 2- and 10-player games, card play, and session recovery.

See `deploy-package/README.md` for the Vercel/Render deployment setup.
