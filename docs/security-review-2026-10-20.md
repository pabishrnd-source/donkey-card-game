# Security and Bug Review

Update: the seven prioritized findings below have been addressed. See
[Security Fixes](security-fixes-2026-10-20.md) for changes, regression results,
deployment status and the remaining mockup-tool dependency advisory.
The original findings below describe the pre-fix state.

Reviewed 2026-10-20. Scope: local source, server message handling, accounts,
room lifecycle, frontend privacy, development configuration and npm advisories.
This is not a penetration-test certification or a guarantee that all issues were found.
No live accounts or rooms were modified; no production dependencies were changed.

## Prioritized Findings

### P1: Malformed play message can terminate the server

`artifacts/api-server/src/lib/gameManager.ts:852` casts untrusted JSON to Card
without runtime validation. When it is the sender's turn, a null or missing card
reaches `sameCard` in `gameEngine.ts:97` and throws TypeError. The WebSocket
message callback in `src/index.ts:36` has no exception boundary.
An authenticated player can therefore interrupt every room, not just their own.
The isolated probe confirmed the exception escapes `handleMessage`.

Fix: validate message schemas and card rank/suit before dispatch, and catch
unexpected handler exceptions per socket. Add null/missing/array/invalid-card tests.

### P1: Expired or revoked sessions keep receiving private game state

`gameManager.ts:811` returns before the expired-session cleanup immediately below
it can run. Broadcasts at lines 172-186 check membership and socket readiness,
but do not revalidate the account token.
The probe expired one account, verified its next command was rejected, and then
verified it still received its own real hand on the next broadcast.
Password changes and HTTP logout invalidate token records without removing
already-connected sockets, so an old authenticated connection can remain a listener.

Fix: centralize session revocation and detach invalid sockets from rooms and voice
channels. Check session validity on delivery, not only on incoming commands.

### P1: Unlimited abandoned-room retention permits memory exhaustion

`gameManager.ts:418` creates a new room whenever requested. Switching rooms only
detaches the socket; `handleDisconnect` at line 776 never removes empty rooms,
states, resume secrets or bans. No room TTL or per-account room creation limit
exists. Four sequential creations in the isolated probe retained three empty rooms.
The WebSocket entry point also has no application message-rate limit.

Fix: bounded resume retention, expiration cleanup of all associated maps/timers,
per-account room limits and per-socket message limits.

### P1: Patch the exposed WebSocket dependency

The lockfile installs `ws` 8.20.0, while `artifacts/api-server/package.json:21`
allows it. npm audit reports a high-severity memory-exhaustion issue involving
tiny fragments/chunks, fixed in 8.21.0. The existing maxPayload bound is not
a substitute for the library fix.
Reference: https://github.com/advisories/GHSA-96hv-2xvq-fx4p

Fix: update ws and the lockfile to a patched compatible version, then rerun
multiplayer and voice tests. No denial-of-service traffic was sent to the live server.

### P1: Development server is exposed with host checks disabled

`artifacts/card-game/vite.config.ts:53` binds to every interface and sets
`allowedHosts: true`; preview repeats this configuration at lines 73-74.
That defeats hostname-based protection against DNS rebinding. The installed
Windows Vite 7.3.2 also has an audited filesystem-deny bypass, fixed in 7.3.5.
Reachability beyond this machine depends on the firewall/network.
Reference: https://github.com/advisories/GHSA-fx2h-pf6j-xcff

Fix: patch Vite, explicitly allow only the needed development hostnames, and
use localhost by default with an explicit LAN opt-in. Do not publish the dev server.

### P2: Opponent card counts remain readable over the network

`gameManager.ts:168` sends one placeholder card for every actual opponent card.
The UI hides the label and shows a fixed fan, but inspecting game_state still
reveals the exact hand length. The isolated two-player deal exposed 26 placeholders.
Actual opponent card identities are masked; this finding concerns counts.

Fix: omit private hands/counts from opponent transport data and use a separate
public player representation. Update dealing animations and privacy tests so
they do not rely on hidden count information.

### P2: Explicit host departure strands the remaining players

`gameManager.ts:649` treats Leave Game as a temporary disconnect. It leaves
the departing player's seat and hostId intact, while start/dealer/restart
operations still require that host. The probe confirmed the host had no socket
but retained sole administrative authority.

Fix: distinguish temporary network loss from explicit departure; transfer host
authority or explicitly end the room, while preserving reconnect behavior for
unintentional disconnects.

## Dependency Audit

- Production-classified packages: 9 audit entries (1 critical, 2 high, 5 moderate, 1 low).
- Full workspace: 71 audit entries (12 critical, 34 high, 22 moderate, 3 low).
- These are registry findings, not 71 demonstrated application exploits. Multiple
  advisories can concern the same package.
- The critical proxy-addr advisory requires a particular IPv6 trusted-proxy
  misconfiguration. The current Express app does not configure trust proxy, so
  that exploit condition was not established here.
- Eleven critical Orval findings involve malicious API-spec content during
  generation. They are build-time risks, not evidence of runtime game-server RCE.
- Many frontend runtime libraries are classified as devDependencies in this
  project, so `audit --prod` alone is not a complete browser dependency review.
- Other affected packages include path-to-regexp, qs, body-parser, PostCSS,
  glob/parser utilities and build tooling. Update with focused regression tests,
  not a blind force-upgrade.

## Verification

Passed:

- `node scripts/security-review.mjs`: five isolated probes reproduced the
  malformed card, expired session, opponent count, absent host and room retention issues.
  This is a diagnostic script asserting current failures, not a clean-security gate.
- `node scripts/test-dealer-rotation.mjs`: engine invariants and a separate
  three-client WebSocket server.
- `node scripts/test-local-game.mjs`.
- `node scripts/test-hidden-opponent-counts.mjs`: UI privacy passes, illustrating
  that these tests do not check transport privacy.
- `node scripts/test-account-token.mjs`.
- API-server and card-game TypeScript checks.
- npm audit completed against the registry for production and full workspace.

Not covered: deployed TLS/reverse-proxy configuration, Android binary security
analysis, sustained load testing, real network attacks, or a comprehensive
third-party dependency reachability audit. No fixes have been applied by this review.
