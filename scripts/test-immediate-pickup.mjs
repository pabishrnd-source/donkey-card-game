import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const output = new URL('../artifacts/api-server/.local/profile-tests/pickup.mjs', import.meta.url);
// Expose fixtures only inside this generated test bundle, never in the server API.
await build({ entryPoints: [fileURLToPath(new URL('../artifacts/api-server/src/lib/gameManager.ts', import.meta.url))], outfile: fileURLToPath(output), bundle:true, platform:'node', format:'esm', packages:'external', plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/gameManager\.ts$/},async args=>({contents:await readFile(args.path,'utf8')+'\nexport { gameStates as fixtureStates };',loader:'ts'}));}}] });
process.env.NODE_ENV='production'; process.env.LOG_LEVEL='silent';
const fixtureDir = mkdtempSync(join(tmpdir(), 'donkey-pickup-'));
process.env.ACCOUNTS_FILE = join(fixtureDir, 'accounts.json');
const tokens = Array.from({length:4}, () => randomBytes(32).toString('hex'));
writeFileSync(process.env.ACCOUNTS_FILE, JSON.stringify({
  users: tokens.map((_, i) => ({id:String(i), username:`fixture_${i}`, salt:'', hash:''})),
  sessions: tokens.map((token,i) => ({hash:createHash('sha256').update(token).digest('hex'), userId:String(i), expires:Date.now()+60000})),
  friends:[], requests:[],
}));
const {handleMessage, handleDisconnect, fixtureStates}=await import(output.href);
const socket=()=>({readyState:1,messages:[],send(raw){this.messages.push(JSON.parse(raw));}});
const send=(ws,type,payload)=>handleMessage(ws,JSON.stringify({type,payload}));
const last=(ws,type)=>ws.messages.filter(m=>m.type===type).at(-1)?.payload;
const card=(suit,rank)=>({suit,rank});
async function scenario(cards, recipient, shouldPickup=true) {
  const clients=Array.from({length:4},socket);
  clients.forEach((ws,i)=>send(ws,'authenticate',{token:tokens[i]}));
  send(clients[0],'create_game',{playerName:'Test 1'});
  const {gameId}=last(clients[0],'joined');
  for(let i=1;i<4;i++)send(clients[i],'join_game',{gameId,playerName:`Test ${i+1}`});
  const ids=clients.map(ws=>last(ws,'joined').playerId);
  send(clients[0],'select_dealer',{gameId,playerId:ids[0]});
  send(clients[0],'start_game',{gameId,dealNumber:0});
  const state=fixtureStates.get(gameId);
  state.roundNumber=2; state.currentTurn=ids[0]; state.roundCards=[]; state.leadSuit=null;
  state.players.forEach((p,i)=>{p.hand=[cards[i] || card('diamonds','7'),card('clubs',String(i+2))];});
  try {
    for(let i=0;i<cards.length;i++)send(clients[i],'play_card',{gameId,card:cards[i]});
    assert.equal(state.phase,'round_end');
    assert.equal(state.roundCards.length,cards.length);
    assert.equal(state.lastRoundResolution,shouldPickup?'pickup':'discard');
    assert.equal(state.roundWinnerId,ids[recipient]);
    assert.equal(state.players[recipient].hand.length,shouldPickup?1+cards.length:1);
    if(cards.length<4){
      const before=structuredClone(state.players[3].hand);
      send(clients[3],'play_card',{gameId,card:before[0]});
      assert.ok(last(clients[3],'error')); assert.deepEqual(state.players[3].hand,before);
    }
    await new Promise(resolve=>setTimeout(resolve,1850));
    assert.equal(state.phase,'playing'); assert.equal(state.currentTurn,ids[recipient]);
  } finally {
    send(clients[0],'restart_tournament',{gameId});
    clients.forEach(ws=>{ send(ws,'leave_game',{gameId}); handleDisconnect(ws); });
  }
}
try {
await scenario([card('hearts','3'),card('spades','A')],0);
await scenario([card('hearts','3'),card('hearts','K'),card('spades','A')],1);
await scenario([card('hearts','K'),card('hearts','3'),card('spades','A')],0);
await scenario([card('hearts','3'),card('hearts','K'),card('hearts','2'),card('hearts','4')],1,false);
console.log('PASS immediate pickup after second/third card, highest led suit only, skipped players blocked, recipient leads, all-follow discard unchanged');
} finally { rmSync(fixtureDir, {recursive:true, force:true}); }
