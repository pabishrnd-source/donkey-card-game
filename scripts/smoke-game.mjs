import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { once } from "node:events";

const require = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
);
const { WebSocket } = require("ws");
const origin = process.env.TEST_ORIGIN || "http://localhost:5173";
const wsUrl = new URL("/ws", origin);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

async function connect() {
  const ws = new WebSocket(wsUrl);
  const messages = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  await once(ws, "open", { signal: AbortSignal.timeout(10000) });
  return {
    ws,
    messages,
    send(type, payload) {
      ws.send(JSON.stringify({ type, payload }));
    },
    async wait(type, predicate = () => true, after = 0) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const match = messages
          .slice(after)
          .find((msg) => msg.type === type && predicate(msg.payload));
        if (match) return match.payload;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(
        `Timed out waiting for ${type}: ${JSON.stringify(messages.slice(-2))}`,
      );
    },
  };
}

const health = await fetch(new URL("/api/healthz", origin));
assert.equal(health.status, 200);
assert.equal((await health.json()).status, "ok");
console.log("PASS HTTP health through the frontend proxy");

for (const count of [2, 10]) {
  const clients = [];
  let gameId;
  try {
    const host = await connect();
    clients.push(host);
    host.send("create_game", { playerName: "Connection test host" });
    const joined = await host.wait("joined");
    gameId = joined.gameId;
    host.playerId = joined.playerId;
    for (let i = 1; i < count; i++) {
      const client = await connect();
      clients.push(client);
      client.send("join_game", { gameId, playerName: `Connection test ${i}` });
      const seat = await client.wait("joined");
      client.playerId = seat.playerId;
      client.resumeToken = seat.resumeToken;
    }
    await host.wait("game_state", (state) => state.players.length === count);
    host.send("select_dealer", { gameId, playerId: host.playerId });
    host.send("start_game", { gameId, dealNumber: 0 });
    const states = await Promise.all(
      clients.map((client) =>
        client.wait("game_state", (state) => state.phase === "playing"),
      ),
    );
    const hands = new Map(
      states.map((state, i) => [
        clients[i].playerId,
        state.players.find((p) => p.id === clients[i].playerId).hand,
      ]),
    );
    assert.deepEqual(
      [...hands.values()].map((hand) => hand.length),
      Array.from({length:count}, (_,i) => Math.floor(52/count) + Number(i < 52%count)),
    );
    const suits = ["spades", "clubs", "hearts", "diamonds"];
    const ranks = [
      "A",
      "K",
      "Q",
      "J",
      "10",
      "9",
      "8",
      "7",
      "6",
      "5",
      "4",
      "3",
      "2",
    ];
    const dealt = [...hands.values()].flat();
    const firstCard = suits
      .flatMap((suit) => ranks.map((rank) => ({ suit, rank })))
      .find((card) =>
        dealt.some(
          (held) => held.suit === card.suit && held.rank === card.rank,
        ),
      );
    let state = states[0];
    for (let i = 0; i < count; i++) {
      const playerId = state.currentTurn;
      const client = clients.find((c) => c.playerId === playerId);
      const hand = hands.get(playerId);
      const card =
        i === 0
          ? firstCard
          : hand.find((c) => c.suit === state.leadSuit) || hand[0];
      const after = host.messages.length;
      client.send("play_card", { gameId, card });
      state = await host.wait(
        "game_state",
        (next) => next.roundCards.length === i + 1,
        after,
      );
      if (state.phase === "round_end") break;
    }
    assert.equal(state.phase, "round_end");
    assert.ok(["discard", "pickup"].includes(state.lastRoundResolution));

    const guest = clients[1];
    const disconnected = once(guest.ws, "close");
    guest.ws.close();
    await disconnected;
    const resumed = await connect();
    clients.push(resumed);
    resumed.send("resume_game", { gameId, playerId: guest.playerId, resumeToken: guest.resumeToken });
    assert.equal((await resumed.wait("joined")).playerId, guest.playerId);
    const restored = await resumed.wait("game_state");
    assert.equal(restored.players.length, count);
    assert.equal(restored.roundNumber, 1);
    console.log(
      `PASS ${count} players: create, join, deal, play a round, and resume after disconnect`,
    );
  } finally {
    const host = clients[0];
    if (gameId && host?.ws.readyState === WebSocket.OPEN) {
      host.send("restart_tournament", { gameId });
      await host.wait(
        "game_state",
        (state) =>
          state.phase === "lobby" &&
          state.players.every((p) => p.hand.length === 0),
        host.messages.length,
      );
    }
    for (const client of clients) client.ws.close();
  }
}
