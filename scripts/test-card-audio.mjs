import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const effects = [], cleanups = [], sources = [], contexts = [], listeners = new Map(), tones = [];
globalThis.__hooks = {
  useRef: value => ({ current: value }),
  useState: value => [value, () => {}],
  useCallback: fn => fn,
  useEffect: fn => effects.push(fn),
};
class Context {
  constructor() { this.state = 'suspended'; this.destination = {}; contexts.push(this); }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createOscillator() { const tone = { frequency: { setValueAtTime(value) { tone.frequencyValue = value; } }, connect() {}, start() {}, stop() {} }; tones.push(tone); return tone; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  async decodeAudioData(bytes) { assert.equal(bytes.byteLength, 3); return { decoded: true }; }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start(...args) { this.started = true; this.startArgs = args; }, stop() { this.stopped = true; this.onended?.(); } };
    sources.push(source); return source;
  }
}
globalThis.window = { AudioContext: Context, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), clearInterval() {} };
let fetches = 0;
globalThis.fetch = async url => { fetches++; assert.ok(['/game/card-play.mp3', '/game/card-mixing.mp3', '/game/game-lost.mp3'].includes(url)); return { ok: true, arrayBuffer: async () => new ArrayBuffer(3) }; };
const output = new URL('../artifacts/api-server/.local/profile-tests/card-audio.mjs', import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL('../artifacts/card-game/src/hooks/useGameAudio.ts', import.meta.url))],
  outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm',
  define: { 'import.meta.env.BASE_URL': '"/game/"' },
  plugins: [{ name: 'mock-hooks', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const {useState,useRef,useCallback,useEffect}=globalThis.__hooks;' }));
  }}],
});
const { useGameAudio } = await import(output.href);
const audio = useGameAudio();
for (const effect of effects.splice(0)) cleanups.push(effect());
listeners.get('pointerdown')();
await audio.playCard(); await audio.playCard();
assert.equal(fetches, 2); assert.equal(contexts[0].state, 'running');
assert.equal(sources.length, 2); assert.equal(sources[0].stopped, true); assert.equal(sources[1].started, true);
await audio.playDeal(); await audio.playDeal();
assert.equal(fetches, 2); assert.equal(sources[2].stopped, true); assert.equal(sources[3].started, true);
await audio.playTurn(); assert.deepEqual(tones.map(tone => tone.frequencyValue), [660, 880]);
for (const cleanup of cleanups) cleanup?.();
assert.equal(contexts[0].state, 'closed'); assert.equal(listeners.size, 0);
const retry = useGameAudio();
globalThis.fetch = async () => { throw new Error('Offline'); };
await assert.doesNotReject(retry.playCard());
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(3) });
await retry.playCard(); assert.equal(sources.length, 5);
console.log('PASS card audio: gesture unlock, base-path URL, cached MP3 decode, replay, cleanup, failure recovery');
const spoken = [];
globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
let cancelled = 0;
window.speechSynthesis = { speak: utterance => spoken.push(utterance.text), cancel: () => cancelled++ };
await retry.playResult('Pabish');
assert.deepEqual(spoken, ['Pabish is Donkey.'], 'Name must start alongside the sound');
assert.deepEqual(sources.at(-1).startArgs, [0, 0, 3], 'Bray must be limited to three seconds');
sources.at(-1).onended();
assert.equal(spoken.length, 1, 'Clip ending must not repeat the announcement');
retry.stopResult();
assert.equal(cancelled, 1);
await retry.playResult('Player Two');
const stoppedResult = sources.at(-1);
retry.stopResult();
assert.equal(stoppedResult.stopped, true);
assert.equal(stoppedResult.onended, null);
assert.equal(spoken.length, 2, 'Stopping the clip must not repeat the name');
assert.equal(cancelled, 2, 'Stopping results must also cancel speech');
const sourceCount = sources.length;
const pendingResult = retry.playResult('Cancelled');
retry.stopResult();
await pendingResult;
assert.equal(sources.length, sourceCount, 'Cancelled loading must not start playback');
assert.equal(spoken.length, 2, 'Cancelled loading must not announce a name');
console.log('PASS result audio: simultaneous loser announcement, three-second clip, cancellation, no late playback');
window.speechSynthesis.speak = () => { throw new Error('Speech engine unavailable'); };
await assert.doesNotReject(retry.playResult('Test'));
assert.equal(sources.at(-1).started, true, 'Sound must still play without a speech engine');
retry.stopResult();
console.log('PASS unavailable speech engine does not break results');
const sequenceOutput = new URL('../artifacts/api-server/.local/profile-tests/deal-sequence.mjs', import.meta.url);
await build({ entryPoints: [fileURLToPath(new URL('../artifacts/card-game/src/lib/dealSequence.ts', import.meta.url))], outfile: fileURLToPath(sequenceOutput), platform: 'node', format: 'esm' });
const { dealSequence, dealDuration } = await import(sequenceOutput.href);
for (let players = 2; players <= 10; players++) {
  for (const total of [52, 51, 37, 9]) {
    const counts = Array.from({ length: players }, (_, i) => Math.floor(total / players) + Number(i < total % players));
    const sequence = dealSequence(counts);
    assert.equal(sequence.length, total);
    assert.deepEqual(sequence, Array.from({ length: total }, (_, i) => i % players));
    assert.ok(dealDuration(total) < 5000);
  }
}
console.log('PASS fast round-robin dealing for 2-10 players, uneven hands and excluded penalty cards');
