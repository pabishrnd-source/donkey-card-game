# Local Play

The start screen's **Offline / Wi-Fi** button is available without the online server.

## Pass & Play

Choose 2-10 players, enter their names, and start. Before each turn, the hand is
hidden until the named player presses **Show my cards**. Backgrounding the app
hides it again. Cards and penalties remain on this phone for the current session.
Leaving this mode or closing the app ends the local session; there is no saved
offline resume yet. No account, laptop, internet, microphone, or cloud service
is needed. The APK contains the rules and assets. The web version must first
be loaded from the laptop; it is not an installable offline PWA.

## Nearby Wi-Fi (Android APK)

Install the updated APK on every phone. Connect all phones to the same trusted
Wi-Fi, or enable a hotspot on one phone and connect the others to it. Internet
and mobile data are not required. Some Wi-Fi networks isolate clients; use a
hotspot if the phones cannot reach each other.

1. On the host, open Offline / Wi-Fi > Host Wi-Fi, enter a name, and host a room.
2. Keep that screen open. It displays the host address and six-digit room code.
3. Friends open Join Wi-Fi, enter their names, the address, and code.
4. Once 2-10 players have joined, the host starts the game.

Hosting runs on TCP port 47831 only while the local mode is open. Exiting closes
the listener and connections. The host phone runs the game rules and validates
turns and cards; each guest receives only their own card faces. Players cannot
join mid-deal. A disconnected guest cancels the unfinished deal and returns the
remaining players to the lobby, preserving penalties. A disconnected host ends
the connection; there is no automatic host migration or reconnection/resume.

Keep the host app foreground and the screen awake. Local traffic is unencrypted,
so use trusted networks only. No passwords, account tokens, photos, friend lists,
voice, or shared songs are transmitted by this local transport. Nearby mode does
not yet include online account, friend, voice/music, or admin-removal controls.
The existing online mode retains those features. Android-only transport uses the
standard socket APIs and a Capacitor plugin; there is no new cloud dependency.

## Verification

`node scripts/test-local-game.mjs` checks 2-10 players, masked opponent hands,
turn validation, immediate off-suit pickup, round advance, winners, losers,
and penalties excluded from the next deal. Typecheck/build and a two-phone
hotspot test should accompany releases; a single connected phone cannot confirm
real-world peer connectivity on every Wi-Fi/hotspot configuration.
