import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');

// Minimal hook scheduler and media doubles test lifecycle without opening a real mic.
let cursor = 0;
const slots = [], effects = [];
const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => v !== b[i]);
globalThis.__hooks = {
  useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
  useState(value) {
    const i = cursor++;
    slots[i] ??= { value };
    return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }];
  },
  useCallback(fn, deps) {
    const i = cursor++;
    if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn, deps };
    return slots[i].value;
  },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!slots[i] || changed(slots[i].deps, deps)) {
      const previous = slots[i];
      effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    }
  },
};
const output = new URL('../artifacts/api-server/.local/profile-tests/live-voice.mjs', import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL('../artifacts/card-game/src/hooks/useVoiceChat.ts', import.meta.url))],
  outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm',
  define: { 'import.meta.env.VITE_RTC_ICE_SERVERS': '"[]"' },
  plugins: [{ name: 'mock-hooks', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const {useState,useRef,useCallback,useEffect}=globalThis.__hooks;' }));
  }}],
});
const pcs = [], audios = [], tracks = [];
class Peer {
  constructor() { pcs.push(this); this.connectionState = 'new'; this.transceivers = []; }
  addTransceiver() {
    const sender = { track: null, replaceTrack: async track => { sender.track = track; } };
    const transceiver = { sender };
    this.transceivers.push(transceiver);
    this.sender ??= sender;
    return transceiver;
  }
  async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  async addIceCandidate(value) { (this.candidates ??= []).push(value); }
  close() { this.connectionState = 'closed'; }
}
globalThis.RTCPeerConnection = Peer;
globalThis.window = { RTCPeerConnection: Peer, addEventListener() {}, removeEventListener() {} };
globalThis.Audio = class {
  constructor() { audios.push(this); this.paused = true; }
  setAttribute() {}
  removeAttribute() {}
  load() {}
  async play() { this.played = true; this.paused = false; this.onplaying?.(); }
  pause() { this.paused = true; this.onpause?.(); }
};
const contexts = [];
globalThis.AudioContext = class {
  constructor() { contexts.push(this); this.destination = {}; }
  createMediaStreamDestination() {
    this.track = { stopped: false, stop() { this.stopped = true; } };
    return { stream: { getAudioTracks: () => [this.track], getTracks: () => [this.track] } };
  }
  createGain() { this.gain = { gain: { value: 1 }, connect() {}, disconnect() {} }; return this.gain; }
  createMediaElementSource() { return { connect() {}, disconnect() {} }; }
  async resume() {}
  async close() { this.closed = true; }
};
globalThis.MediaStream = class { constructor(value) { this.tracks = value; } };
let visibility;
globalThis.document = { hidden: false, addEventListener(_, fn) { visibility = fn; }, removeEventListener() {} };
const makeStream = () => {
  const track = { stopped: false, stop() { this.stopped = true; } };
  tracks.push(track);
  return { getTracks: () => [track], getAudioTracks: () => [track] };
};
let getMedia = async () => makeStream();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => getMedia() } } });
const { useVoiceChat } = await import(output.href);
const sent = [];
const options = { gameId: 'test-room', myPlayerId: 'me', hostId: 'me', voiceEvents: [], connected: true, sendMessage: message => sent.push(message) };
const render = () => { cursor = 0; const session = useVoiceChat(options); while (effects.length) effects.shift()(); return session; };
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); return render(); };
let session = render();
await session.joinVoice(false);
session = render();
assert.equal(session.muted, false);
options.voiceEvents = [{ type: 'voice_peers', payload: { peers: [{ playerId: 'peer', playerName: 'Guest' }] } }];
render(); session = await settle();
assert.equal(sent.at(-1).payload.signal.type, 'offer');
assert.equal(pcs[0].sender.track, tracks[0]);
await session.toggleMute();
session = render();
assert.equal(tracks[0].stopped, true);
assert.equal(pcs[0].sender.track, null);
assert.equal(session.muted, true);
await session.toggleMute();
session = render();
assert.equal(session.muted, false);
assert.equal(pcs[0].sender.track, tracks[1]);
session.toggleSpeaker(); session = render();
assert.equal(audios[0].muted, true);
session.enableSpeakers(); session = render();
assert.equal(audios[0].muted, false);
options.voiceEvents = [...options.voiceEvents, { type: 'voice_signal', payload: { fromPlayerId: 'peer', signal: { type: 'candidate', candidate: { candidate: 'candidate:test' } } } }];
render(); await settle();
assert.equal(pcs[0].candidates, undefined);
options.voiceEvents = [...options.voiceEvents, { type: 'voice_signal', payload: { fromPlayerId: 'peer', signal: { type: 'answer', description: { type: 'answer', sdp: 'v=0' } } } }];
render(); session = await settle();
assert.equal(pcs[0].candidates.length, 1);
document.hidden = true; visibility(); session = render();
assert.equal(session.muted, true);
assert.equal(tracks[1].stopped, true);
document.hidden = false;
await session.chooseSong(new File(['test'], 'room.mp3', { type: 'audio/mpeg' }));
session = render();
assert.equal(session.song.title, 'room.mp3');
assert.equal(pcs[0].transceivers[1].sender.track, contexts[0].track);
await session.toggleSong(); session = render();
assert.equal(session.song.playing, true);
assert.equal(sent.at(-1).type, 'voice_music');
await session.toggleMute(); session = render();
assert.equal(session.muted, false);
assert.notEqual(pcs[0].sender.track, pcs[0].transceivers[1].sender.track);
await session.toggleMute(); session = render();
assert.equal(session.muted, true);
assert.equal(pcs[0].transceivers[1].sender.track.stopped, false);
assert.equal(session.song.playing, true);
await session.chooseSong({ name: 'too-big.mp3', type: 'audio/mpeg', size: 101 * 1024 * 1024 });
session = render();
assert.match(session.error, /100 MB/);
assert.equal(session.song.title, 'room.mp3');
await session.chooseSong({ name: 'not-a-song.txt', type: 'text/plain', size: 4 });
session = render();
assert.match(session.error, /supported audio/);
assert.equal(contexts.length, 1);
session.setMusicVolume(0.2); session.setVoiceVolume(0.7); session = render();
assert.equal(contexts[0].gain.gain.value, 0.2);
assert.equal(audios[0].volume, 0.7);
assert.equal(pcs[0].transceivers[1].sender.track.stopped, false);
// A guest's second track is ignored, not played as room music.
pcs[0].ontrack({ track: {}, transceiver: pcs[0].transceivers[1] });
assert.equal(audios[1].srcObject, undefined);
await session.toggleSong(); session = render();
assert.equal(session.song.playing, false);
session.stopSong(); session = render();
assert.equal(contexts[0].track.stopped, true);
assert.equal(contexts[0].closed, true);
assert.equal(pcs[0].transceivers[1].sender.track, null);
// After host changes, only the new host's music can be received.
options.hostId = 'peer'; session = render();
pcs[0].ontrack({ track: {}, transceiver: pcs[0].transceivers[1] });
assert.ok(audios[1].srcObject);
assert.equal(audios[1].volume, 0.2);
session.toggleSpeaker(); session = render();
assert.equal(audios[0].muted, true);
assert.notEqual(audios[1].muted, true);
const contextCount = contexts.length;
await session.chooseSong(new File(['test'], 'guest.mp3', { type: 'audio/mpeg' }));
assert.equal(contexts.length, contextCount);
let resolveCapture;
getMedia = () => new Promise(resolve => { resolveCapture = resolve; });
const pending = session.toggleMute();
session.leaveVoice();
const lateStream = makeStream();
resolveCapture(lateStream);
await pending; session = render();
assert.equal(tracks.at(-1).stopped, true);
assert.equal(session.joined, false);
assert.equal(pcs[0].connectionState, 'closed');
assert.equal(audios[0].srcObject, null);
assert.equal(sent.at(-1).type, 'voice_leave');
console.log('PASS live voice: offer, ICE queue, capture/release, unmute, speaker mute, background mute, late permission cancellation, cleanup');
assert.equal(audios[1].srcObject, null);
console.log('PASS shared music: separate track, host playback/pause/stop, independent volumes, guest track rejected, host change and cleanup');
// Automatic listening must never request microphone access, including reconnects.
for (const slot of slots) slot?.cleanup?.();
slots.length = 0;
options.autoListen = true;
options.voiceEvents = [];
getMedia = async () => { throw new Error('Automatic listening opened the microphone'); };
const trackCount = tracks.length;
render(); session = await settle();
assert.equal(session.joined, true);
assert.equal(session.muted, true);
assert.equal(session.speakerMuted, false);
assert.equal(sent.at(-1).type, 'voice_join');
options.connected = false;
render(); session = await settle();
assert.equal(session.joined, false);
options.connected = true;
render(); session = await settle();
assert.equal(session.joined, true);
assert.equal(session.muted, true);
assert.equal(tracks.length, trackCount);
assert.equal(sent.at(-1).type, 'voice_join');
session.leaveVoice();
console.log('PASS automatic listening: speakers enabled, microphone untouched, reconnect rejoins muted');
for (const slot of slots) slot?.cleanup?.();
slots.length = 0;
const recorders = [];
globalThis.MediaRecorder = class {
  static isTypeSupported() { return true; }
  constructor() { recorders.push(this); this.state = 'inactive'; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
};
getMedia = async () => makeStream();
render(); session = await settle();
await session.toggleMute(); session = render();
assert.equal(session.muted, false);
recorders.at(-1).onerror(); session = render();
assert.equal(session.muted, true, 'Recorder failure must reset the mute button');
assert.equal(tracks.at(-1).stopped, true, 'Recorder failure must release the microphone');
await session.toggleMute(); session = render();
assert.equal(session.muted, false, 'Unmute must retry recording after a failure');
session.leaveVoice();
console.log('PASS recording failure releases microphone and allows retry');
