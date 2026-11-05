# Username accounts and friends

Open **Sign in** in Donkey, then **Create account**. No Firebase, phone number,
email or SMS provider is required. Usernames are case-insensitive, 3-20 letters,
digits or underscores; passwords must be 10-128 characters. Use a unique password.

After signing in, **Friends** contains incoming requests, online friends, match
invitations, room administration and password changes. The room creator is the
admin. Admins can invite online friends from the waiting room and remove other
players. Invitations must be accepted; players are never forced into a game.
Removing a player cancels an unfinished deal and returns remaining players to
the waiting room, retaining their penalty cards. A removed account cannot rejoin
that room. Signed-in admin rooms require all participants to sign in.

Signing in on another phone uses the same friends list, provided both phones
connect to the **same backend**. Enter the existing room code to resume your
account's seat. The old device loses control of that seat. Display photos remain
device-local; account names and friendships are server-persisted. Rooms and match
invitations remain in memory and do not survive a backend restart.

## Persistence and deployment

- `ACCOUNTS_FILE` optionally sets the absolute path to the account JSON file.
  Default: `.data/accounts.json` relative to the backend process working directory.
  `scripts/dev.mjs` runs the backend in `artifacts/api-server`.
- Use one backend process with a persistent disk and regular protected backups.
  Atomic file replacement prevents partial writes. This is a small, single-server
  store, not a database for multiple server replicas or large-scale deployment.
- Do not commit this file or expose it through a static web server. It contains
  salted scrypt password hashes, hashed session tokens, and private friend data.
- Sessions expire after seven days. Password changes invalidate existing sessions;
  signing out invalidates that device's session. Authentication attempts are limited.
- Public deployment **requires HTTPS and WSS**, including on mobile. HTTP development
  is for localhost/USB loopback only. Do not enter real passwords over public or
  shared LAN HTTP. Deploy behind a correctly configured trusted reverse proxy and
  add edge abuse controls before opening registration to the public.
- No email/SMS account recovery is configured. A forgotten password cannot be
  automatically reset. Do not delete the account file to troubleshoot connectivity.
- The Android USB build still depends on the laptop server and `adb reverse`.
  Accounts alone do not make the game available over the internet.
- `deploy-package` is a separate older snapshot, not automatically synchronized
  with these new features. Deploy the current workspace or refresh that package first.

## Verification

`node scripts/test-accounts.mjs` uses synthetic credentials, a temporary isolated
store, real HTTP auth requests, and simulated game sockets. It checks registration,
login, friendships, presence, invitations, cross-device seat security, admin removal,
password rotation, and logout without changing real players' account data.
