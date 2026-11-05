# Security Fixes

## Applied

1. Network messages now have runtime type and size validation before dispatch.
   Invalid, missing and null cards are rejected. A WebSocket exception boundary
   prevents unexpected handler errors from terminating the server.
2. Expired sessions are detached on input and by a periodic sweep. Password
   changes and HTTP logout immediately revoke associated live sockets.
   Game, chat, signaling and audio delivery also check authorization, preventing
   passive expired listeners from receiving private data between sweeps.
3. Explicit departures remove the seat, invalidate its resume secret and transfer
   host ownership to a remaining connected player when possible. A departure
   cancels an unfinished deal without fabricating a result or penalty.
   Temporary network loss continues to preserve the seat for reconnection.
4. Empty disconnected rooms expire after 30 minutes. Room states, voice/music,
   resume secrets, bans, invitations and timers are cleaned up together.
   Explicitly abandoned single-player rooms are deleted immediately.
5. Room creation is limited to five per account per minute and three retained
   room memberships per account. Global rooms and connections are bounded.
   Each socket has an 80-message / 1-MiB-per-second budget.
6. Opponent hands are empty arrays in network views, including local Wi-Fi views.
   Real card identities and lengths are available only to the hand's owner.
   The opening deal animation derives initial allocation from public deck,
   penalty and dealer rules; it no longer reads opponents' current hands or
   displays their numerical counts. Public play history still permits deductions,
   as it does in a physical card game.
7. Patched compatible server, frontend and tooling dependencies and recorded
   security floors for pinned transitive versions. Vite is 7.3.7, and ws is
   at least 8.21.0. The package release-age guard remains enabled.
8. Vite defaults to localhost and no longer disables host checks. Its package
   scripts no longer override the safer bind address.
9. API CORS now allows only the local web client, Capacitor localhost clients,
   and origins explicitly listed in `CORS_ORIGINS`. The API also sends basic
   anti-framing and content-sniffing headers. WebSocket connections are capped
   per remote address, and room, player, and chat identifiers use cryptographic
   randomness instead of `Math.random()`.

## LAN Development

USB development remains compatible with adb reverse. For intentional Wi-Fi
development, set `DONKEY_LAN_DEV=1` before starting `scripts/dev.mjs`.
If using a custom DNS hostname, add that exact hostname to the comma-separated
`DONKEY_DEV_HOSTS` variable. Localhost and IP-address hosts use Vite's built-in
allowance. Keep the development server off the public Internet.

## Verification

- Security regressions: malformed JSON shapes, malformed cards, passive expired
  listeners, revocation, private card counts, host transfer, reconnect, cleanup,
  room limits and message budgets pass.
- Account registration/login, hashed credentials, password changes, logout,
  friends, invites, admin removal and cross-device resume pass.
- Profile, voice relay, WebRTC signaling and room-music authorization pass.
- Dealer rotation, 52-card conservation with locked exclusions, duplicate/stale
  request guards and real three-client WebSocket tests pass.
- Immediate pickup, local games, UI privacy, village menu/login and token
  storage tests pass.
- Backend and frontend TypeScript checks and production builds pass.
- xcode's use of the updated CommonJS uuid.v4 API passes a compatibility check.
- Server restarted with user approval. API health returns `{"status":"ok"}`.
  The frontend returns HTTP 403 for an untrusted Host header.
- Browser login and the connected home menu were verified after restart.

## Remaining Dependency Advisory

The full workspace audit decreased from 71 entries (12 critical) to one high
entry, with no critical entries. No production-classified advisories remain.

The remaining `braces` advisory is
https://github.com/advisories/GHSA-vfj7-8cjw-p6xm.
There is no published patched version in the registry at this review.
It is pulled in by `artifacts/mockup-sandbox` through fast-glob and micromatch,
not by the game runtime. That tool currently supplies fixed internal glob
patterns, not user-supplied patterns. Do not expose arbitrary pattern input.
No exploit test was run against a live service. This residual finding is
documented, not suppressed or represented as fixed.

## Operation

The approved restart cleared old in-memory rooms. Accounts and friends were
preserved. The village artwork, music, intro duration and Donkey rules were
not redesigned. An Android build is prepared separately from installing it
onto a connected phone.
