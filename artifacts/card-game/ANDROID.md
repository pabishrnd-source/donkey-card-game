# Donkey Android (USB Debug Build)

The Android wrapper bundles the existing React UI with Capacitor 8. Game rules and the Node multiplayer server are unchanged. This is a development APK, not a signed Play Store release.

## Build and Install on Windows

The project-local toolchain lives in `.tools/android-build` at the repository root: Node 22, Java 21, Android SDK platform 36 and build tools 36.0.0. Capacitor dependencies are in the workspace lockfile. The downloaded tools and Gradle caches are excluded from Git.

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/android-debug.ps1 -Install
```

Use `-Serial DEVICE_SERIAL` if several Android devices are connected. The phone must authorize USB debugging for this computer. The script stops if build, USB routing or installation fails.

APK output: `android/app/build/outputs/apk/debug/app-debug.apk` relative to this directory.

## Connection

Keep the laptop's API server running on port 3001 and the USB cable connected. The script uses `adb reverse tcp:3001 tcp:3001` to connect the phone to that server. After reconnecting USB, repeat that command using `.tools/android-build/sdk/platform-tools/adb.exe` from the repository root.

`.env.android` configures HTTP and WebSocket URLs only for the Android build mode. Localhost cleartext traffic is allowed by a debug-only Android network policy; other cleartext domains are blocked. Normal Vite development is unchanged.

## Profile and Voice

Profile is available on the dashboard, waiting room, and match screen. Select a JPG, PNG, or WebP photo up to 8 MB. The app crops it to a 160-pixel square JPEG and stores the profile on this device. Your saved photo is shared with room members when you create/join a room or save your profile inside a room. Remove Photo clears it; it is not an online account or cross-device profile.

The mobile match fits one screen, with card-page arrows and compact controls for players, status, chat, and voice. The dashboard and waiting room still scroll vertically. The Android app opens in landscape.

Room listening joins automatically with speakers enabled and the microphone muted. The only voice control is Mute / Unmute. Unmute requests microphone permission; Mute stops capture without silencing other players. Voice stays joined when the waiting room becomes a match. Backgrounding mutes the microphone; reconnecting resumes listening with the microphone muted. No audio is stored by the game server. Use headphones to reduce feedback.

## Shared Local Songs

Only the room host can choose, play, pause, replace or stop a local audio file. Open Voice & songs, choose a song (up to 100 MB), then press Play. MP3 and WAV are recommended; other formats depend on the device decoder. Only share audio you are entitled to share. File selection does not upload the original file: the host streams decoded audio over a separate WebRTC track. Listeners join automatically; if browser playback is blocked, tap anywhere to retry.

Every player has a My music volume slider; voice playback uses full app volume and the device's volume control. Setting music volume to zero silences it on that device only. Muting the microphone does not stop the shared music. The host can speak over the song. New listeners hear the current live point, not the start; minor network latency differences are expected. Host disconnecting or closing the app stops the song for everyone. Files are not retained across reconnects. Keep the host app foreground; Android can suspend background playback. Both phones must use the updated APK to receive the separate music track.

Shared music and the direct-voice fallback use WebRTC. USB routing for port 3001 does not carry WebRTC audio: put devices on the same reachable Wi-Fi network or configure STUN/TURN. Set VITE_RTC_ICE_SERVERS to an RTCIceServer JSON array before building. Reliable cross-network WebRTC requires your own TURN provider; no TURN service or credentials are included. Vite variables are public, so use short-lived TURN credentials, never a provider API secret. A production deployment should issue short-lived credentials through an authenticated backend endpoint.

Voice & songs includes an external Open Spotify shortcut. It opens Spotify separately; it does not embed Spotify playback, access accounts, or synchronize songs. Spotify's developer policy prohibits game integrations. Android/background playback is controlled by Spotify and the device.

Both frontend and backend must be updated for photo sharing and opt-in voice isolation. Restarting the current in-memory backend clears existing rooms. Recreate the room after the update. A physical two-device microphone/playback test is still required.

Regression tests: run `node scripts/test-profile-voice.mjs` and `node scripts/test-live-voice.mjs` from the repository root. These use isolated room state and mocked media devices and do not change live rooms or record microphone audio. They do not replace a physical two-device audio test.

## Public Release Checklist

Before distributing publicly, deploy the game server with HTTPS/WSS, build with the corresponding `VITE_API_URL` and `VITE_WS_URL`, use Capacitor's HTTPS Android scheme, and sign the release with a private release keystore. Do not distribute the USB debug build as an online standalone game. The backend does not run on the phone.
# Voice compatibility

Server voice is enabled by default where MediaRecorder is available.
Join the same room and select `Unmute` on each speaking device; listeners
need no extra controls. Speech is relayed as short in-memory clips through the
existing authenticated room connection in 200 ms segments rather than relying
on direct UDP connectivity. Playback retains at most one waiting clip, dropping
older queued clips when a device falls behind. Actual delay includes encoding,
network and playback overhead; 200 ms is not an end-to-end latency guarantee.
No voice files are stored on the server.
Mute, leaving the room, or backgrounding the app stops microphone capture.
Tap anywhere to retry browser-blocked playback. Shared music still uses WebRTC and
may need TURN on restricted/different networks. Physical two-device audibility
must be checked separately from automated signaling/recorder lifecycle tests.

