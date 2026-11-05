import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';

const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const base = new URL('../artifacts/api-server/.local/profile-tests/', import.meta.url);
async function bundle(name, source, plugins = []) {
  const output = new URL(name + '.mjs', base);
  await build({ entryPoints:[fileURLToPath(new URL(source,import.meta.url))], outfile:fileURLToPath(output), bundle:true, platform:'node', format:'esm', packages:'external', plugins });
  return output.href;
}
const engine = await import(await bundle('dealer-engine','../artifacts/api-server/src/lib/gameEngine.ts'));
const local = await import(await bundle('dealer-local','../artifacts/card-game/src/lib/localGame.ts'));
const animation = await import(await bundle('dealer-animation','../artifacts/card-game/src/lib/dealSequence.ts'));
const key = c => `${c.suit}:${c.rank}`;
const players = n => Array.from({length:n},(_,i)=>local.localPlayer(String(i),String.fromCharCode(65+i)));
const deck = engine.createDeck();
assert.equal(deck.length,52);
assert.equal(new Set(deck.map(key)).size,52);
for (const suit of ['hearts','diamonds','clubs','spades']) assert.equal(deck.filter(c=>c.suit===suit).length,13);

for(let count=2;count<=10;count++) for(let dealer=0;dealer<count;dealer++) {
  for(const locked of [0,1,7,52-count]) {
    const seats=players(count);
    seats[0].penaltyCards=deck.slice(0,locked);
    const available=engine.createPlayableDeck(seats);
    const shuffled=engine.shuffleDeck(available);
    assert.deepEqual([...shuffled].map(key).sort(),available.map(key).sort());
    const dealt=engine.dealCards(seats,shuffled,String(dealer));
    assert.deepEqual(dealt.map(p=>p.id),seats.map(p=>p.id),'Seats must not rotate');
    assert.ok(seats.every(p=>p.hand.length===0),'Input players must not be mutated');
    const all=dealt.flatMap(p=>p.hand);
    assert.equal(all.length,52-locked);
    assert.equal(new Set(all.map(key)).size,52-locked);
    assert.equal(new Set([...all,...seats[0].penaltyCards].map(key)).size,52);
    for(let offset=0;offset<count;offset++) {
      const seat=(dealer+offset)%count;
      assert.equal(dealt[seat].hand.length,Math.floor(available.length/count)+Number(offset<available.length%count));
      assert.deepEqual(dealt[seat].hand,shuffled.filter((_,i)=>i%count===offset));
    }
    const seq=animation.dealSequence(dealt.map(p=>p.hand.length),dealer);
    assert.deepEqual(animation.initialDealCounts(dealt.map(p=>({...p,hand:[]})),dealer),dealt.map(p=>p.hand.length));
    assert.deepEqual(seq,shuffled.map((_,i)=>(dealer+i)%count));
  }
}
const example=[[11,11,10,10,10],[10,11,11,10,10],[10,10,11,11,10],[10,10,10,11,11],[11,10,10,10,11]];
example.forEach((counts,i)=>assert.deepEqual(engine.dealCards(players(5),deck,String(i)).map(p=>p.hand.length),counts));
assert.throws(()=>engine.dealCards(players(5),deck.slice(1)));
assert.throws(()=>engine.dealCards(players(5),[...deck.slice(1),deck[1]]));
assert.throws(()=>engine.dealCards(players(5),[...deck.slice(1),{rank:'Joker',suit:'wild'}]));
assert.throws(()=>local.startLocal(local.localLobby(players(5))));
let offline={...local.localLobby(players(5)),dealerId:'3'};
offline=local.startLocal(offline);
assert.equal(offline.dealNumber,1);
assert.throws(()=>local.startLocal(offline));
for(let round=0;round<7;round++) {
  const expectedDealer=String((3+round)%5);
  assert.equal(offline.dealerId,expectedDealer);
  assert.equal(offline.dealNumber,round+1);
  offline.activePlayerIds=['0','1']; offline.finishedPlayerIds=['2','3','4'];
  offline.currentGameWinnerId='2'; offline.roundNumber=2; offline.currentTurn='0';
  offline.players.forEach((p,i)=>{p.finished=i>1; p.hand=i===0?[{suit:'hearts',rank:'A'}]:i===1?[{suit:'hearts',rank:'2'},{suit:'clubs',rank:'3'}]:[];});
  offline=local.playLocal(offline,'0',offline.players[0].hand[0]);
  offline=local.playLocal(offline,'1',offline.players[1].hand[0]);
  assert.equal(offline.phase,'game_over');
  assert.equal(offline.dealerId,String((4+round)%5));
  offline=local.startLocal(local.localLobby(offline.players,offline.gameId,offline));
  assert.equal(offline.players.flatMap(p=>p.hand).length+offline.players.flatMap(p=>p.penaltyCards).length,52);
}

// Isolated accounts and room fixtures: never read or alter the user's account store.
const fixtureDir=await mkdtemp(join(tmpdir(),'donkey-dealer-'));
process.env.ACCOUNTS_FILE=join(fixtureDir,'accounts.json');
process.env.NODE_ENV='production'; process.env.LOG_LEVEL='silent';
const tokens=players(5).map(()=>randomBytes(32).toString('hex'));
await writeFile(process.env.ACCOUNTS_FILE,JSON.stringify({ users:players(5).map(p=>({id:p.id,username:p.name,salt:'',hash:''})), sessions:tokens.map((token,i)=>({hash:createHash('sha256').update(token).digest('hex'),userId:String(i),expires:Date.now()+600000})),friends:[],requests:[] }));
const manager=await import(await bundle('dealer-manager','../artifacts/api-server/src/lib/gameManager.ts',[{name:'fixtures',setup(b){b.onLoad({filter:/gameManager\.ts$/},async args=>({contents:await readFile(args.path,'utf8')+'\nexport { gameStates as fixtureStates, clearTurnTimer as fixtureClearTimer };',loader:'ts'}));}}]));
const socket=()=>({readyState:1,messages:[],send(raw){this.messages.push(JSON.parse(raw));}});
const clients=players(5).map(socket);
const send=(ws,type,payload)=>manager.handleMessage(ws,JSON.stringify({type,payload}));
const last=(ws,type)=>ws.messages.filter(m=>m.type===type).at(-1)?.payload;
let gameId;
try {
  clients.forEach((ws,i)=>send(ws,'authenticate',{token:tokens[i]}));
  send(clients[0],'create_game',{playerName:'A'});
  gameId=last(clients[0],'joined').gameId;
  clients.slice(1).forEach((ws,i)=>send(ws,'join_game',{gameId,playerName:String.fromCharCode(66+i)}));
  const ids=clients.map(ws=>last(ws,'joined').playerId);
  const state=manager.fixtureStates.get(gameId);
  send(clients[0],'start_game',{gameId,dealNumber:0});
  assert.equal(state.phase,'lobby');
  send(clients[1],'select_dealer',{gameId,playerId:ids[1]});
  assert.equal(state.dealerId,null);
  send(clients[0],'select_dealer',{gameId,playerId:'intruder'});
  assert.equal(state.dealerId,null);
  send(clients[0],'select_dealer',{gameId,playerId:ids[0]});
  let dealerIndex=0;
  for(let round=0;round<6;round++) {
    assert.equal(state.dealerId,ids[dealerIndex]);
    send(clients[1],'select_dealer',{gameId,playerId:ids[(dealerIndex+1)%5]});
    assert.equal(state.dealerId,ids[dealerIndex],'Guests cannot change a dealer in later lobbies');
    if(round===2) dealerIndex=4;
    send(clients[0],'select_dealer',{gameId,playerId:ids[dealerIndex]});
    assert.equal(state.dealerId,ids[dealerIndex],'Host can confirm or change the dealer before every game');
    assert.equal(state.phase,'lobby','Selecting a dealer must not start the game');
    send(clients[0],'start_game',{gameId,dealNumber:round});
    assert.equal(state.phase,'playing');
    assert.equal(state.dealNumber,round+1);
    const hands=state.players.map(p=>structuredClone(p.hand));
    const total=hands.flat().length;
    assert.equal(total+state.players.flatMap(p=>p.penaltyCards).length,52);
    assert.equal(new Set(hands.flat().map(key)).size,total);
    clients.forEach((ws,i)=>{
      const view=last(ws,'game_state');
      assert.equal(view.dealerId,state.dealerId);
      assert.equal(view.dealNumber,state.dealNumber);
      assert.deepEqual(view.players.map(p=>p.id),ids);
      assert.deepEqual(view.players.map(p=>p.hand.length),hands.map((h,j)=>j===i?h.length:0));
      assert.deepEqual(view.players[i].hand,hands[i]);
      assert.ok(view.players.filter((_,j)=>j!==i).every(p=>p.hand.length===0));
    });
    send(clients[0],'start_game',{gameId,dealNumber:round});
    send(clients[0],'restart_game',{gameId,dealNumber:round+1});
    send(clients[0],'select_dealer',{gameId,playerId:ids[4]});
    assert.deepEqual(state.players.map(p=>p.hand),hands);
    assert.equal(state.dealerId,ids[dealerIndex]);
    // Drive a legal final trick on a controlled fixture, exercising real completion logic.
    state.activePlayerIds=ids.slice(0,2); state.finishedPlayerIds=ids.slice(2);
    state.currentGameWinnerId=ids[2]; state.roundNumber=2; state.currentTurn=ids[0]; state.roundCards=[]; state.leadSuit=null;
    state.players.forEach((p,i)=>{p.finished=i>1; p.hand=i===0?[{suit:'hearts',rank:'A'}]:i===1?[{suit:'hearts',rank:'2'},{suit:'clubs',rank:'3'}]:[];});
    send(clients[0],'play_card',{gameId,card:state.players[0].hand[0]});
    send(clients[1],'play_card',{gameId,card:state.players[1].hand[0]});
    assert.equal(state.phase,'game_over');
    dealerIndex=(dealerIndex+1)%5;
    assert.equal(state.dealerId,ids[dealerIndex],'Rotation continues from the confirmed dealer');
    const penalties=JSON.stringify(state.players.map(p=>p.penaltyCards));
    send(clients[1],'play_card',{gameId,card:{suit:'hearts',rank:'2'}});
    assert.equal(JSON.stringify(state.players.map(p=>p.penaltyCards)),penalties);
    send(clients[0],'restart_game',{gameId,dealNumber:round});
    assert.equal(state.phase,'game_over','Stale transition must be rejected');
    send(clients[1],'restart_game',{gameId,dealNumber:round+1});
    assert.equal(state.phase,'game_over','Only host advances');
    send(clients[0],'restart_game',{gameId,dealNumber:round+1});
    assert.equal(state.phase,'lobby');
    send(clients[0],'restart_game',{gameId,dealNumber:round+1});
    send(clients[0],'start_game',{gameId,dealNumber:round});
    assert.equal(state.phase,'lobby');
    assert.equal(state.dealNumber,round+1);
  }
  console.log('PASS dealer rotation: 2-10 players, all starting seats, five-player examples, 52 unique standard cards, locked exclusions, no leftovers, animated order, host authority, synchronized private hands, six rounds, duplicate/stale request guards');
  const {WebSocket,WebSocketServer}=require('ws');
  const server=new WebSocketServer({host:'127.0.0.1',port:0});
  await new Promise(resolve=>server.once('listening',resolve));
  server.on('connection',ws=>{ws.on('message',raw=>manager.handleMessage(ws,String(raw)));ws.on('close',()=>manager.handleDisconnect(ws));});
  const peers=[];
  let wireRoom;
  try {
    for(let i=0;i<3;i++) {
      const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`);
      const messages=[];
      ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
      await new Promise(resolve=>ws.once('open',resolve));
      const wait=async(type,predicate=()=>true)=>{
        const deadline=Date.now()+3000;
        while(Date.now()<deadline){const found=messages.findLast(m=>m.type===type&&predicate(m.payload));if(found)return found.payload;await new Promise(r=>setTimeout(r,10));}
        throw new Error(`Timed out waiting for ${type}`);
      };
      const peer={ws,wait,send:(type,payload)=>ws.send(JSON.stringify({type,payload}))};
      peers.push(peer);
      peer.send('authenticate',{token:tokens[i]});
      await wait('social_state',s=>Boolean(s.user));
      peer.send(i===0?'create_game':'join_game',{gameId:wireRoom,playerName:`Wire ${i}`});
      const joined=await wait('joined'); wireRoom=joined.gameId; peer.id=joined.playerId;
    }
    peers[0].send('select_dealer',{gameId:wireRoom,playerId:peers[2].id});
    await Promise.all(peers.map(p=>p.wait('game_state',s=>s.dealerId===peers[2].id)));
    peers[0].send('start_game',{gameId:wireRoom,dealNumber:0});
    const views=await Promise.all(peers.map(p=>p.wait('game_state',s=>s.phase==='playing')));
    assert.ok(views.every(v=>v.dealerId===peers[2].id&&v.dealNumber===1));
    assert.deepEqual(views.map((v,i)=>v.players.find(p=>p.id===peers[i].id).hand.length),[17,17,18]);
    assert.ok(views.every((v,i)=>v.players.filter(p=>p.id!==peers[i].id).every(p=>p.hand.length===0)));
    assert.equal(new Set(views.flatMap((v,i)=>v.players.find(p=>p.id===peers[i].id).hand).map(key)).size,52);
    console.log('PASS real WebSocket transport: three authenticated clients agree on dealer, round, counts and 52 private dealt cards');
  } finally {
    if(wireRoom) manager.fixtureClearTimer(wireRoom);
    await Promise.all(peers.map(({ws})=>new Promise(resolve=>{ws.once('close',resolve);ws.close();})));
    await new Promise(resolve=>server.close(resolve));
  }
} finally {
  if(gameId) manager.fixtureClearTimer(gameId);
  clients.forEach(ws=>manager.handleDisconnect(ws));
  await rm(fixtureDir,{recursive:true,force:true});
}
