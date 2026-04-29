/**
 * Game Manager
 *
 * Manages all active game rooms and player WebSocket connections.
 * Each game room has a unique gameId, a set of connected WebSocket clients,
 * and a GameState object that is the single source of truth.
 *
 * All state mutations go through this manager, which then broadcasts
 * the updated state to all connected clients in the room.
 */

import { WebSocket } from "ws";
import {
  GameState,
  Player,
  Card,
  GamePhase,
  RoundCard,
  createDeck,
  shuffleDeck,
  dealCards,
  findAceOfSpadesHolder,
  validatePlay,
  determineRoundWinner,
  checkGameOver,
  cardLabel,
} from "./gameEngine.js";
import { logger } from "./logger.js";

/** Map from gameId → list of connected WebSocket clients */
const rooms = new Map<string, Set<WebSocket>>();

/** Map from gameId → current GameState */
const gameStates = new Map<string, GameState>();

/** Map from WebSocket → { gameId, playerId } — for cleanup on disconnect */
const clientMeta = new Map<WebSocket, { gameId: string; playerId: string }>();

/** Generate a random 6-char room code */
function generateGameId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** Broadcast updated state to all clients in a room */
function broadcast(gameId: string, state: GameState): void {
  const clients = rooms.get(gameId);
  if (!clients) return;

  // Each client gets a tailored view: their own hand is visible, others' hands are hidden
  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    const meta = clientMeta.get(client);
    if (!meta) continue;

    // Build a view where only the current client's hand is fully revealed
    const personalizedState: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === meta.playerId
          ? p // show full hand to this player
          : { ...p, hand: p.hand.map(() => ({ suit: "spades" as const, rank: "?" as never })) }
          // NOTE: hand length is preserved so card counts show correctly
      ),
    };

    client.send(
      JSON.stringify({ type: "game_state", payload: personalizedState })
    );
  }
}

/** Send an error message to a single client */
function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "error", payload: { message } }));
  }
}

/** Send a success message to a single client */
function sendSuccess(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

/** Create a new game room and return the gameId */
export function createGame(ws: WebSocket, playerName: string): string {
  const gameId = generateGameId();
  const playerId = `player_${Math.random().toString(36).substring(2, 10)}`;

  const player: Player = {
    id: playerId,
    name: playerName,
    hand: [],
    tricksWon: 0,
  };

  const state: GameState = {
    gameId,
    players: [player],
    currentTurn: "",
    roundCards: [],
    phase: "lobby",
    roundWinnerId: null,
    roundNumber: 0,
    leadSuit: null,
    gameOverLoserId: null,
    penaltyCard: null,
    message: `${playerName} created the game. Waiting for players...`,
    hostId: playerId,
  };

  rooms.set(gameId, new Set([ws]));
  gameStates.set(gameId, state);
  clientMeta.set(ws, { gameId, playerId });

  sendSuccess(ws, "joined", { gameId, playerId });
  broadcast(gameId, state);

  logger.info({ gameId, playerId, playerName }, "Game created");
  return gameId;
}

/** Join an existing game room */
export function joinGame(
  ws: WebSocket,
  gameId: string,
  playerName: string
): void {
  const state = gameStates.get(gameId);
  if (!state) {
    sendError(ws, `Game "${gameId}" not found`);
    return;
  }
  if (state.phase !== "lobby") {
    sendError(ws, "Game already started");
    return;
  }
  if (state.players.length >= 6) {
    sendError(ws, "Game is full (max 6 players)");
    return;
  }

  const playerId = `player_${Math.random().toString(36).substring(2, 10)}`;
  const player: Player = {
    id: playerId,
    name: playerName,
    hand: [],
    tricksWon: 0,
  };

  state.players.push(player);
  state.message = `${playerName} joined. ${state.players.length} player(s) in lobby.`;

  const clients = rooms.get(gameId)!;
  clients.add(ws);
  clientMeta.set(ws, { gameId, playerId });

  sendSuccess(ws, "joined", { gameId, playerId });
  broadcast(gameId, state);

  logger.info({ gameId, playerId, playerName }, "Player joined game");
}

/** Start the game — only the host can do this, min 2 players */
export function startGame(ws: WebSocket, gameId: string): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);

  if (!state || !meta) {
    sendError(ws, "Game not found");
    return;
  }
  if (meta.playerId !== state.hostId) {
    sendError(ws, "Only the host can start the game");
    return;
  }
  if (state.players.length < 2) {
    sendError(ws, "Need at least 2 players to start");
    return;
  }
  if (state.phase !== "lobby") {
    sendError(ws, "Game already started");
    return;
  }

  // Create, shuffle, and deal the deck
  const deck = shuffleDeck(createDeck());
  state.players = dealCards(state.players, deck);
  state.phase = "playing";
  state.roundNumber = 1;

  // First turn always goes to the player holding the Ace of Spades
  const aceHolder = findAceOfSpadesHolder(state.players);
  if (!aceHolder) {
    sendError(ws, "Internal error: Ace of Spades not found after deal");
    return;
  }
  state.currentTurn = aceHolder;
  state.leadSuit = null;
  state.roundCards = [];
  state.message = `Game started! ${state.players.find((p) => p.id === aceHolder)?.name} has the Ace of Spades and must play it first.`;

  broadcast(gameId, state);
  logger.info({ gameId }, "Game started");
}

/**
 * Process a card play.
 * Validates the move, updates the hand, detects round/game end.
 */
export function playCard(
  ws: WebSocket,
  gameId: string,
  card: Card
): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);

  if (!state || !meta) {
    sendError(ws, "Game not found");
    return;
  }
  if (state.phase !== "playing") {
    sendError(ws, "Game is not in playing phase");
    return;
  }

  const { valid, reason } = validatePlay(state, meta.playerId, card);
  if (!valid) {
    sendError(ws, reason ?? "Invalid move");
    return;
  }

  const player = state.players.find((p) => p.id === meta.playerId)!;

  // Remove the card from the player's hand
  player.hand = player.hand.filter(
    (c) => !(c.suit === card.suit && c.rank === card.rank)
  );

  // If this is the first card of the round, set the lead suit
  if (state.roundCards.length === 0) {
    state.leadSuit = card.suit;
  }

  // Add card to the round table
  const roundEntry: RoundCard = { playerId: meta.playerId, card };
  state.roundCards.push(roundEntry);

  logger.info(
    { gameId, playerId: meta.playerId, card: cardLabel(card) },
    "Card played"
  );

  // Check if all players have played in this round
  if (state.roundCards.length === state.players.length) {
    // Determine who won the round
    const winnerId = determineRoundWinner(state.roundCards, state.leadSuit!);
    const winner = state.players.find((p) => p.id === winnerId)!;
    winner.tricksWon += 1;

    state.roundWinnerId = winnerId;
    state.phase = "round_end";
    state.message = `${winner.name} wins round ${state.roundNumber} with ${cardLabel(
      state.roundCards.find((rc) => rc.playerId === winnerId)!.card
    )}!`;

    // Check if the game is over (all hands empty)
    const { isOver, loserId } = checkGameOver(state.players);
    if (isOver) {
      state.phase = "game_over";
      const loser = state.players.find((p) => p.id === loserId)!;
      // Assign penalty card (Ace of Spades) to the loser
      state.penaltyCard = { suit: "spades", rank: "A" };
      state.gameOverLoserId = loserId;
      state.message = `Game over! ${loser.name} loses with ${loser.tricksWon} trick(s) won. Penalty: Ace of Spades!`;
    }

    broadcast(gameId, state);

    // If game is not over, auto-advance to next round after a short delay
    if (state.phase === "round_end") {
      setTimeout(() => {
        const currentState = gameStates.get(gameId);
        if (!currentState || currentState.phase !== "round_end") return;

        // Winner starts the next round
        currentState.roundNumber += 1;
        currentState.currentTurn = winnerId;
        currentState.roundCards = [];
        currentState.leadSuit = null;
        currentState.roundWinnerId = null;
        currentState.phase = "playing";
        currentState.message = `Round ${currentState.roundNumber} — ${winner.name} leads.`;
        broadcast(gameId, currentState);
      }, 2500); // 2.5 second pause so players can see the round result
    }
  } else {
    // Advance to the next player's turn (in player-list order, cycling)
    const currentIndex = state.players.findIndex((p) => p.id === meta.playerId);
    const nextIndex = (currentIndex + 1) % state.players.length;
    state.currentTurn = state.players[nextIndex].id;
    state.message = `${state.players[nextIndex].name}'s turn.`;
    broadcast(gameId, state);
  }
}

/** Restart the game (host only) — resets to lobby with same players */
export function restartGame(ws: WebSocket, gameId: string): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);

  if (!state || !meta) {
    sendError(ws, "Game not found");
    return;
  }
  if (meta.playerId !== state.hostId) {
    sendError(ws, "Only the host can restart the game");
    return;
  }

  // Reset all player hands and tricks
  state.players = state.players.map((p) => ({
    ...p,
    hand: [],
    tricksWon: 0,
  }));
  state.currentTurn = "";
  state.roundCards = [];
  state.phase = "lobby";
  state.roundWinnerId = null;
  state.roundNumber = 0;
  state.leadSuit = null;
  state.gameOverLoserId = null;
  state.penaltyCard = null;
  state.message = "Game restarted. Waiting for host to start...";

  broadcast(gameId, state);
  logger.info({ gameId }, "Game restarted");
}

/** Handle client disconnect — remove from room, notify others */
export function handleDisconnect(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;

  const { gameId, playerId } = meta;
  clientMeta.delete(ws);

  const clients = rooms.get(gameId);
  if (clients) {
    clients.delete(ws);
  }

  const state = gameStates.get(gameId);
  if (state) {
    const player = state.players.find((p) => p.id === playerId);
    state.message = `${player?.name ?? "A player"} disconnected.`;
    // Don't remove the player from the game — they may reconnect
    broadcast(gameId, state);
  }

  logger.info({ gameId, playerId }, "Player disconnected");
}

/** Route incoming WebSocket messages to the correct handler */
export function handleMessage(
  ws: WebSocket,
  rawMessage: string
): void {
  let msg: { type: string; payload: Record<string, unknown> };
  try {
    msg = JSON.parse(rawMessage);
  } catch {
    sendError(ws, "Invalid message format");
    return;
  }

  const { type, payload } = msg;

  switch (type) {
    case "create_game":
      createGame(ws, String(payload.playerName ?? "Player"));
      break;

    case "join_game":
      joinGame(
        ws,
        String(payload.gameId ?? ""),
        String(payload.playerName ?? "Player")
      );
      break;

    case "start_game":
      startGame(ws, String(payload.gameId ?? ""));
      break;

    case "play_card":
      playCard(
        ws,
        String(payload.gameId ?? ""),
        payload.card as Card
      );
      break;

    case "restart_game":
      restartGame(ws, String(payload.gameId ?? ""));
      break;

    default:
      sendError(ws, `Unknown message type: ${type}`);
  }
}
