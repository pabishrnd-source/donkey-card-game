import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const output = new URL('../artifacts/api-server/.local/profile-tests/voice-relay.mjs', import.meta.url);
await build({ entryPoints:[fileURLToPath(new URL('../artifacts/card-game/src/lib/voiceRelay.ts',import.meta.url))],outfile:fileURLToPath(output),platform:'node',format:'esm' });
const {VoiceRelayCapture,VoiceRelayPlayback,VOICE_CLIP_MS}=await import(output.href);
assert.equal(VOICE_CLIP_MS,200);
const realSetTimeout=globalThis.setTimeout, realClearTimeout=globalThis.clearTimeout;
const timers=new Map(); let timerId=0;
globalThis.setTimeout=(fn,ms)=>{assert.equal(ms,200); const id=++timerId; timers.set(id,fn); return id;};
globalThis.clearTimeout=id=>timers.delete(id);
const audios=[],recorders=[],readers=[],urls=new Set();
let next=0,errors=0;
URL.createObjectURL=()=>{const id=`blob:${next++}`; urls.add(id); return id;};
URL.revokeObjectURL=id=>urls.delete(id);
globalThis.Audio=class {constructor(){audios.push(this);} setAttribute(){} removeAttribute(){} load(){} pause(){this.paused=true;} async play(){this.played=true;} };
globalThis.MediaRecorder=class {
 static isTypeSupported(type){return type==='audio/webm;codecs=opus';}
 constructor(){this.state='inactive';recorders.push(this);}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['test'])}); this.onstop?.();}
};
globalThis.FileReader=class {readAsDataURL(){this.result='data:audio/webm;base64,dGVzdA==';readers.push(this);} };
const sent=[];
const capture=new VoiceRelayCapture({},(mime,data)=>sent.push({mime,data}),()=>errors++);
const [id,flush]=timers.entries().next().value; timers.delete(id); flush();
readers[0].onload(); assert.equal(sent[0].data,'dGVzdA=='); assert.equal(recorders.length,2);
capture.stop(); readers.slice(1).forEach(reader=>reader.onload()); assert.equal(sent.length,1);
assert.equal(recorders.at(-1).state,'inactive');
assert.equal(timers.size,0);
globalThis.setTimeout=realSetTimeout; globalThis.clearTimeout=realClearTimeout;
const playback=new VoiceRelayPlayback(()=>errors++);
playback.receive('peer','audio/webm','dGVzdA==');
for(let i=0;i<10;i++)playback.receive('peer','audio/webm','dGVzdA==');
assert.equal(urls.size,2); assert.equal(audios[0].played,true);
const newestUrl=`blob:${next-1}`;
playback.configure(.4,false); assert.equal(audios[0].volume,.4);
audios[0].onended(); assert.equal(urls.size,1); assert.equal(audios[0].src,newestUrl);
playback.configure(.4,true); assert.equal(urls.size,0); assert.equal(audios[0].paused,true);
playback.receive('peer','audio/webm','dGVzdA=='); assert.equal(urls.size,0);
playback.configure(1,false); playback.receive('peer','audio/webm','dGVzdA==');
playback.dispose(); assert.equal(urls.size,0); assert.equal(errors,0);
console.log('PASS server voice: decodable segment lifecycle, stop discards pending audio, bounded playback queue, volume, speaker mute, resource cleanup');
