// Security regressions using isolated fixtures; no live accounts or rooms are touched.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";

const require = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const { build } = require("esbuild");
// Keep the fixture under the workspace so Windows can atomically replace the file.
// The OS sandbox temp directory can deny rename() even when the app itself is healthy.
const dir = await mkdtemp(join(process.cwd(), ".security-review-"));
process.env.ACCOUNTS_FILE = join(dir, "accounts.json");
process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "production";
const tokens = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
await writeFile(process.env.ACCOUNTS_FILE, JSON.stringify({
  users: tokens.map((_, i) => ({ id: `audit-${i}`, username: `audit${i}`, salt: "", hash: "" })),
  sessions: tokens.map((token, i) => ({
    hash: createHash("sha256").update(token).digest("hex"),
    userId: `audit-${i}`, expires: Date.now() + (i === 0 ? 60_000 : 600_000),
  })),
  friends: [], requests: [],
}));
const output = new URL("../artifacts/api-server/.local/profile-tests/security-review.mjs", import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL("../artifacts/api-server/src/lib/gameManager.ts", import.meta.url))],
  outfile: fileURLToPath(output), bundle: true, platform: "node", format: "esm", packages: "external",
  plugins: [{ name: "review-fixtures", setup(b) {
    b.onLoad({ filter: /gameManager\.ts$/ }, async args => ({
      contents: await readFile(args.path, "utf8") +
        "\nexport { gameStates as fixtureStates, rooms as fixtureRooms, clientMeta as fixtureMeta, broadcast as fixtureBroadcast, clearTurnTimer as fixtureClearTimer, sweepRooms as fixtureSweep, resumeSecrets as fixtureSecrets };\nexport { messageBudget } from './messageSecurity.js';\nexport { revokeTestSession as fixtureRevoke } from './accounts.js';",
      loader: "ts",
    }));
    b.onLoad({ filter: /accounts\.ts$/ }, async args => ({
      contents: await readFile(args.path, "utf8") +
        '\nexport function revokeTestSession(token: string) { commit(next => { next.sessions = next.sessions.filter(session => session.hash !== digest(token)); }); sessionEvents.emit("changed"); }',
      loader: "ts",
    }));
  } }],
});
const manager = await import(output.href);
const socket = () => ({ readyState: 1, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } });
const clients = [socket(), socket()];
const send = (ws, type, payload) => manager.handleMessage(ws, JSON.stringify({ type, payload }));
const last = (ws, type) => ws.messages.filter(m => m.type === type).at(-1)?.payload;
const clock = Date.now;
try {
  clients.forEach((ws, i) => send(ws, "authenticate", { token: tokens[i] }));
  send(clients[0], "create_game", { playerName: "Audit A" });
  const { gameId, playerId } = last(clients[0], "joined");
  send(clients[1], "join_game", { gameId, playerName: "Audit B" });
  send(clients[0], "select_dealer", { gameId, playerId });
  send(clients[0], "start_game", { gameId, dealNumber: 0 });
  const state = manager.fixtureStates.get(gameId);
  const current = clients.find(ws => last(ws, "joined").playerId === state.currentTurn);
  for (const card of [null, undefined, [], {}, "A", { suit: { toString: null }, rank: "A" }, { suit: "wild", rank: "Joker" }]) {
    assert.doesNotThrow(() => send(current, "play_card", { gameId, card }));
    assert.match(last(current, "error").message, /Invalid/);
  }
  for (const value of [null, [], { type: "__proto__", payload: {} }, { type: "create_game", payload: { playerName: { toString: null } } }]) {
    assert.doesNotThrow(() => manager.handleMessage(current, JSON.stringify(value)));
    assert.match(last(current, "error").message, /Invalid/);
  }
  console.log("PASS malformed messages are rejected without exceptions.");

  const opponent = last(clients[0], "game_state").players.find(p => p.id !== playerId);
  assert.equal(opponent.hand.length, 0);
  assert.equal(last(clients[0], "game_state").players.find(p => p.id === playerId).hand.length, 26);
  for (const count of [1, 7, 26]) {
    const original = state.players[1].hand;
    state.players[1].hand = original.slice(0, count);
    manager.fixtureBroadcast(gameId, state);
    assert.deepEqual(last(clients[0], "game_state").players[1].hand, []);
    state.players[1].hand = original;
  }
  console.log("PASS opponent hand counts never appear in game_state.");

  clients.forEach(ws => send(ws, "voice_join", { gameId }));
  Date.now = () => clock() + 61_000;
  clients[0].messages.length = 0;
  manager.fixtureBroadcast(gameId, state);
  manager.relayVoiceChunk(clients[1], gameId, "audio/webm", "AAAA");
  assert.equal(clients[0].messages.length, 0, "Expired passive listener receives neither game nor audio");
  send(clients[0], "chat_message", { gameId, text: "expired session probe" });
  assert.match(last(clients[0], "error").message, /sign in/i);
  assert.ok(!manager.fixtureMeta.has(clients[0]), "Expired socket is detached");
  clients[0].messages.length = 0;
  manager.fixtureBroadcast(gameId, state);
  assert.equal(last(clients[0], "game_state"), undefined);
  console.log("PASS expired sessions cannot receive private state or room audio.");
  Date.now = clock;

  send(clients[0], "authenticate", { token: tokens[0] });
  send(clients[0], "resume_game", { gameId, playerId });
  assert.equal(manager.fixtureMeta.get(clients[0]).playerId, playerId);
  send(clients[0], "leave_game", { gameId });
  assert.equal(manager.fixtureStates.get(gameId).hostId, last(clients[1], "joined").playerId);
  assert.equal(manager.fixtureStates.get(gameId).players.length, 1);
  assert.equal(manager.fixtureStates.get(gameId).phase, "lobby");
  console.log("PASS explicit departure removes the seat and transfers host; disconnect still resumes.");
  const before = manager.fixtureStates.size;
  for (let i = 0; i < 4; i++) send(clients[0], "create_game", { playerName: "Room retention probe" });
  assert.equal(manager.fixtureStates.size, before + 1);
  const empty = [...manager.fixtureRooms.values()].filter(room => room.size === 0).length;
  assert.equal(empty, 0);
  send(clients[0], "create_game", { playerName: "Rate limit probe" });
  assert.match(last(clients[0], "error").message, /limit/);
  manager.fixtureRevoke(tokens[1]);
  assert.ok(!manager.fixtureMeta.has(clients[1]));
  assert.match(last(clients[1], "removed").message, /expired/);
  console.log("PASS session revocation immediately detaches existing sockets.");
  clients.forEach(ws => manager.handleDisconnect(ws));
  Date.now = () => clock() + 31 * 60_000;
  manager.fixtureSweep();
  assert.equal(manager.fixtureStates.size, 0);
  assert.equal(manager.fixtureRooms.size, 0);
  assert.equal(manager.fixtureSecrets.size, 0);
  console.log("PASS room creation is bounded; abandoned rooms and secrets expire.");
  Date.now = clock;
  const budget = manager.messageBudget();
  for (let i = 0; i < 80; i++) assert.equal(budget(100), true);
  assert.equal(budget(100), false);
  assert.equal(manager.messageBudget()(1024 * 1024 + 1), false);
  Date.now = () => clock() + 1100;
  assert.equal(budget(100), true);
  console.log("PASS message and byte budgets reject floods and reset after their window.");
} finally {
  Date.now = clock;
  for (const id of manager.fixtureStates.keys()) manager.fixtureClearTimer(id);
  clients.forEach(ws => manager.handleDisconnect(ws));
  await unlink(process.env.ACCOUNTS_FILE);
  await unlink(process.env.ACCOUNTS_FILE + ".tmp").catch(error => { if (error.code !== "ENOENT") throw error; });
  await rmdir(dir);
}
