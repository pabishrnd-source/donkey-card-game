import { mkdir, writeFile } from 'node:fs/promises';
// A quiet, synthetic 60-second tone for local playback checks. No recorded audio.
const rate = 8000, seconds = 60, dataSize = rate * seconds * 2;
const wav = Buffer.alloc(44 + dataSize);
wav.write('RIFF'); wav.writeUInt32LE(36 + dataSize, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(dataSize, 40);
for (let i = 0; i < rate * seconds; i++) wav.writeInt16LE(Math.round(120 * Math.sin(2 * Math.PI * 220 * i / rate)), 44 + i * 2);
const directory = new URL('../artifacts/api-server/.local/profile-tests/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('room-audio-test.wav', directory), wav);
console.log('Created local synthetic audio fixture.');
