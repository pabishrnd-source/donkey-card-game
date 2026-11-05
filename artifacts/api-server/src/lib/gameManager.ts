/**
 * WebSocket room manager.
 *
 * The manager owns all mutable room state. The engine module contains pure rule
 * helpers; this file applies those helpers to create games, deal fresh hands,
 * resolve rounds, remove finished players, and assign tournament penalties.
 */

import { WebSocket } from "ws";
import {
  GameState,
  Player,
  Card,
  RoundCard,
  createPlayableDeck,
  shuffleDeck,
  dealCards,
  findStartingPlayerId,
  validatePlay,
  getHighestPlayableCard,
  determineRoundWinner,
  getNextPenaltyCard,
  getFirstPenaltyCardInSequence,
  cardLabel,
  sameCard,
  nextActivePlayerId,
} from "./gameEngine.js";
import { logger } from "./logger.js";
import { randomBytes, randomUUID } from "node:crypto";
import { tokenUser, friendData, requestFriend, answerFriend, removeFriend, areFriends, sessionEvents } from "./accounts.js";
import { validMessage, isCard } from "./messageSecurity.js";

const rooms = new Map<string, Set<WebSocket>>();
const gameStates = new Map<string, GameState>();
const clientMeta = new Map<WebSocket, { gameId: string; playerId: string }>();
const voiceRooms = new Map<string, Set<string>>();
const roomMusic = new Map<string, { title: string; playing: boolean; hostId: string }>();
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TURN_DURATION_MS = 60_000;
const accounts = new Map<WebSocket, string>();
const resumeSecrets = new Map<string, string>();
const bannedAccounts = new Map<string, Set<string>>();
const invitations = new Map<string, { id: string; from: string; to: string; gameId: string; expires: number }>();
const accountOf = (ws: WebSocket) => tokenUser(accounts.get(ws) || "");
const emptySince = new Map<string, number>();
const roomCreation = new Map<string, { count: number; until: number }>();
const RESUME_RETENTION_MS = 30 * 60_000;

function deleteRoom(gameId: string) {
  clearTurnTimer(gameId);
  rooms.delete(gameId);
  gameStates.delete(gameId);
  voiceRooms.delete(gameId);
  roomMusic.delete(gameId);
  bannedAccounts.delete(gameId);
  emptySince.delete(gameId);
  for (const key of resumeSecrets.keys()) if (key.startsWith(gameId + ":")) resumeSecrets.delete(key);
  for (const [id, invite] of invitations) if (invite.gameId === gameId) invitations.delete(id);
}
function expireSessions() {
  for (const ws of [...accounts.keys()]) if (!accountOf(ws)) {
    handleDisconnect(ws);
    sendSuccess(ws, "removed", { message: "Sign-in session expired. Please sign in again." });
    socialState(ws);
  }
}
function sweepRooms() {
  expireSessions();
  const now = Date.now();
  for (const [id, since] of emptySince) if (now - since >= RESUME_RETENTION_MS) deleteRoom(id);
  for (const [id, entry] of roomCreation) if (entry.until <= now) roomCreation.delete(id);
  for (const [id, invite] of invitations) if (invite.expires <= now) invitations.delete(id);
}
sessionEvents.on("changed", expireSessions);
const cleanupTimer = setInterval(sweepRooms, 30_000);
cleanupTimer.unref();
function socialState(ws: WebSocket) {
  const user = accountOf(ws);
  if (!user) return sendSuccess(ws, "social_state", { user: null, friends: [], incoming: [], outgoing: [], invitations: [] });
  const online = (id: string) => [...accounts.keys()].some(socket => socket.readyState === WebSocket.OPEN && accountOf(socket)?.id === id);
  const state = friendData(user.id);
  for (const [id, invite] of invitations) if (invite.expires < Date.now()) invitations.delete(id);
  sendSuccess(ws, "social_state", {
    user, ...state,
    friends: state.friends.map(friend => ({ ...friend, online: online(friend!.id) })),
    invitations: [...invitations.values()].filter(invite => invite.to === user.id).map(invite => ({
      ...invite, fromName: state.friends.find(friend => friend?.id === invite.from)?.username || "Friend",
    })),
  });
}
function refreshSocial() { for (const ws of accounts.keys()) if (ws.readyState === WebSocket.OPEN) socialState(ws); }
function joined(ws: WebSocket, gameId: string, playerId: string) {
  const key = gameId + ":" + playerId;
  if (!resumeSecrets.has(key)) resumeSecrets.set(key, randomBytes(32).toString("hex"));
  sendSuccess(ws, "joined", { gameId, playerId, resumeToken: resumeSecrets.get(key) });
}
function attachAccount(ws: WebSocket, player: Player) {
  const account = accountOf(ws);
  if (account) Object.assign(player, { accountId: account.id, username: account.username });
}

function handleSocial(ws: WebSocket, type: string, payload: Record<string, unknown>): boolean {
  if (type === "authenticate") {
    const token = String(payload.token || "");
    if (!tokenUser(token)) {
      handleDisconnect(ws);
      sendSuccess(ws, "removed", { message: "Sign-in session expired." });
      socialState(ws); return true;
    }
    const previous = accountOf(ws)?.id;
    if (previous && previous !== tokenUser(token)?.id) handleDisconnect(ws);
    accounts.set(ws, token);
    const meta = clientMeta.get(ws), state = meta && gameStates.get(meta.gameId);
    const player = state?.players.find(player => player.id === meta?.playerId);
    if (player && !player.accountId && !state!.players.some(other => other.accountId === accountOf(ws)?.id)) {
      attachAccount(ws, player); broadcast(meta!.gameId, state!);
    }
    refreshSocial(); return true;
  }
  if (!["social_refresh", "friend_request", "friend_answer", "friend_remove", "match_invite", "invite_answer", "sign_out"].includes(type)) return false;
  if (type === "sign_out") {
    const meta = clientMeta.get(ws);
    if (meta) leaveGame(ws, meta.gameId);
    handleDisconnect(ws); socialState(ws); return true;
  }
  const user = accountOf(ws);
  if (!user) { sendError(ws, "Sign in to use friends and invitations."); socialState(ws); return true; }
  try {
    if (type === "friend_request") {
      requestFriend(user.id, String(payload.username || ""));
      sendSuccess(ws, "social_notice", { message: "Friend request sent." });
    }
    if (type === "friend_answer") answerFriend(user.id, String(payload.userId || ""), payload.accept === true);
    if (type === "friend_remove") {
      const other = String(payload.userId || "");
      removeFriend(user.id, other);
      for (const [id, invite] of invitations) if ((invite.from === user.id && invite.to === other) || (invite.to === user.id && invite.from === other)) invitations.delete(id);
    }
    if (type === "match_invite") {
      const meta = clientMeta.get(ws), state = meta && gameStates.get(meta.gameId);
      const to = String(payload.userId || "");
      if (!meta || !state || state.hostId !== meta.playerId || state.phase !== "lobby") throw new Error("Only the admin can invite players from the waiting room.");
      if (!areFriends(user.id, to)) throw new Error("Accept the friend request first.");
      if (state.players.length >= 10) throw new Error("Room is full.");
      if (![...accounts.keys()].some(socket => socket.readyState === WebSocket.OPEN && accountOf(socket)?.id === to)) throw new Error("Your friend is offline.");
      for (const [id, invite] of invitations) if (invite.from === user.id && invite.to === to) invitations.delete(id);
      const id = randomUUID();
      invitations.set(id, { id, from: user.id, to, gameId: meta.gameId, expires: Date.now() + 120000 });
      sendSuccess(ws, "social_notice", { message: "Match invitation sent." });
    }
    if (type === "invite_answer") {
      const id = String(payload.inviteId || ""), invite = invitations.get(id);
      if (!invite || invite.to !== user.id || invite.expires < Date.now()) throw new Error("Invitation expired.");
      if (payload.accept === true) {
        if (clientMeta.has(ws)) throw new Error("Leave your current room before accepting an invitation.");
        if (!areFriends(invite.from, user.id)) throw new Error("Invitation no longer valid.");
        joinGame(ws, invite.gameId, user.username);
      }
      invitations.delete(id);
    }
    refreshSocial();
  } catch (error) { sendError(ws, error instanceof Error ? error.message : "Request failed."); }
  return true;
}

export function removePlayer(ws: WebSocket, gameId: string, playerId: string) {
  const meta = clientMeta.get(ws), state = gameStates.get(gameId);
  if (!state || meta?.gameId !== gameId || meta.playerId !== state.hostId) return sendError(ws, "Only the match admin can remove players.");
  if (playerId === state.hostId) return sendError(ws, "The admin cannot remove themselves.");
  const target = state.players.find(player => player.id === playerId);
  if (!target) return sendError(ws, "Player not found.");
  if (target.accountId) {
    const banned = bannedAccounts.get(gameId) || new Set<string>();
    banned.add(target.accountId); bannedAccounts.set(gameId, banned);
  }
  for (const client of [...(rooms.get(gameId) || [])]) if (clientMeta.get(client)?.playerId === playerId) {
    leaveVoice(client, gameId);
    clientMeta.delete(client); rooms.get(gameId)?.delete(client);
    sendSuccess(client, "removed", { message: "The admin removed you from this room." });
  }
  resumeSecrets.delete(gameId + ":" + playerId);
  clearTurnTimer(gameId);
  // Membership changes cancel an unfinished deal; no winner or penalty is fabricated.
  const remaining = state.players.filter(player => player.id !== playerId).map(player => ({ ...player, hand: [], finished: false, finishOrder: null }));
  const next = freshGameState(gameId, state.hostId, remaining);
  next.dealNumber = state.dealNumber;
  next.dealerId = remaining.some(p => p.id === state.dealerId) ? state.dealerId :
    state.dealNumber > 0 ? nextActivePlayerId(state.players.map(p => p.id), state.dealerId ?? "") : null;
  next.message = `${target.name} was removed by the admin. Ready for a new deal.`;
  gameStates.set(gameId, next); broadcast(gameId, next);
}

function generateGameId(): string {
  let gameId = "";
  do {
    // Room codes are six characters everywhere in the client UI and join forms.
    gameId = randomBytes(6).toString("base64url").slice(0, 6).toUpperCase();
  } while (gameStates.has(gameId));
  return gameId;
}

function publicPlayerView(player: Player, viewerPlayerId: string): Player {
  if (player.id === viewerPlayerId) return player;
  return {
    ...player,
    hand: [],
  };
}

function broadcast(gameId: string, state: GameState): void {
  const clients = rooms.get(gameId);
  if (!clients) return;

  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN || !accountOf(client)) continue;
    const meta = clientMeta.get(client);
    if (!meta) continue;

    const personalizedState: GameState = {
      ...state,
      players: state.players.map((p) => publicPlayerView(p, meta.playerId)),
    };

    client.send(JSON.stringify({ type: "game_state", payload: personalizedState }));
  }
}

function clearTurnTimer(gameId: string): void {
  const timer = turnTimers.get(gameId);
  if (!timer) return;
  clearTimeout(timer);
  turnTimers.delete(gameId);
}

function scheduleTurnTimer(gameId: string, state: GameState): void {
  clearTurnTimer(gameId);
  if (state.phase !== "playing" || !state.currentTurn) {
    state.turnDeadlineAt = null;
    return;
  }

  const turnPlayerId = state.currentTurn;
  state.turnDeadlineAt = Date.now() + TURN_DURATION_MS;
  turnTimers.set(
    gameId,
    setTimeout(() => {
      const currentState = gameStates.get(gameId);
      if (
        !currentState ||
        currentState.phase !== "playing" ||
        currentState.currentTurn !== turnPlayerId
      ) {
        return;
      }

      const player = currentState.players.find((p) => p.id === turnPlayerId);
      const card = getHighestPlayableCard(currentState, turnPlayerId);
      if (!player || !card) return;

      playCardForPlayer(gameId, turnPlayerId, card, true);
    }, TURN_DURATION_MS),
  );
}

function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "error", payload: { message } }));
  }
}

function sendSuccess(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function playerName(gameId: string, playerId: string): string {
  return gameStates.get(gameId)?.players.find((p) => p.id === playerId)?.name ?? "Player";
}

function socketForPlayer(gameId: string, playerId: string): WebSocket | null {
  const clients = rooms.get(gameId);
  if (!clients) return null;
  for (const client of clients) {
    const meta = clientMeta.get(client);
    if (meta?.playerId === playerId && client.readyState === WebSocket.OPEN && accountOf(client)) return client;
  }
  return null;
}

function broadcastVoiceEvent(gameId: string, type: string, payload: unknown, exceptPlayerId?: string): void {
  const clients = rooms.get(gameId);
  if (!clients) return;
  for (const client of clients) {
    const meta = clientMeta.get(client);
    if (!meta || meta.playerId === exceptPlayerId || client.readyState !== WebSocket.OPEN || !accountOf(client)) continue;
    client.send(JSON.stringify({ type, payload }));
  }
}

function broadcastChatMessage(gameId: string, playerId: string, text: string): void {
  const state = gameStates.get(gameId);
  const clients = rooms.get(gameId);
  const player = state?.players.find((p) => p.id === playerId);
  if (!state || !clients || !player) return;

  const cleanText = text.trim().slice(0, 240);
  if (!cleanText) return;

  const payload = {
    id: `chat_${randomUUID()}`,
    playerId,
    playerName: player.name,
    text: cleanText,
    createdAt: Date.now(),
  };

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && accountOf(client)) {
      client.send(JSON.stringify({ type: "chat_message", payload }));
    }
  }
}

function cleanAvatar(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 60000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Invalid profile photo");
  const bytes = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) throw new Error("Invalid JPEG photo");
  return value;
}

function createPlayer(playerId: string, playerName: string, avatarUrl: string | null = null): Player {
  return {
    id: playerId,
    name: playerName.trim().slice(0, 20) || "Player",
    avatarUrl,
    hand: [],
    penaltyCards: [],
    finished: false,
    finishOrder: null,
  };
}

function freshGameState(gameId: string, hostId: string, players: Player[]): GameState {
  return {
    gameId,
    players,
    activePlayerIds: players.map((p) => p.id),
    finishedPlayerIds: [],
    currentTurn: "",
    roundCards: [],
    phase: "lobby",
    roundWinnerId: null,
    roundNumber: 0,
    dealNumber: 0,
    dealerId: null,
    leadSuit: null,
    lastRoundResolution: null,
    currentGameWinnerId: null,
    gameOverLoserId: null,
    penaltyCard: null,
    nextPenaltyCard: getNextPenaltyCard(players),
    turnDeadlineAt: null,
    message: "Waiting for players...",
    hostId,
  };
}

function resetForNextDeal(state: GameState): void {
  const playableDeck = shuffleDeck(createPlayableDeck(state.players));
  state.players = dealCards(state.players, playableDeck, state.dealerId ?? undefined);
  state.dealNumber += 1;
  state.activePlayerIds = state.players.map((p) => p.id);
  state.finishedPlayerIds = [];
  state.currentGameWinnerId = null;
  state.gameOverLoserId = null;
  state.penaltyCard = null;
  state.nextPenaltyCard = getNextPenaltyCard(state.players);
  state.roundCards = [];
  state.roundWinnerId = null;
  state.roundNumber = 1;
  state.leadSuit = null;
  state.lastRoundResolution = null;
  state.phase = "playing";

  const starterId = findStartingPlayerId(state.players);
  state.currentTurn = starterId ?? state.activePlayerIds[0] ?? "";
  const starter = state.players.find((p) => p.id === state.currentTurn);
  state.message = starter
    ? `Game started. ${starter.name} starts.`
    : "Game started.";
}

function finishPlayerIfEmpty(state: GameState, playerId: string): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.finished || player.hand.length > 0) return;

  player.finished = true;
  player.finishOrder = state.finishedPlayerIds.length + 1;
  state.finishedPlayerIds.push(player.id);
  state.activePlayerIds = state.activePlayerIds.filter((id) => id !== player.id);
  if (!state.currentGameWinnerId) {
    state.currentGameWinnerId = player.id;
  }
}

function finishEmptyPlayersAfterRound(state: GameState, roundWinnerId: string): void {
  finishPlayerIfEmpty(state, roundWinnerId);

  for (const playerId of [...state.activePlayerIds]) {
    finishPlayerIfEmpty(state, playerId);
  }
}

function assignFinalLoserPenalty(state: GameState): void {
  const loserId =
    state.activePlayerIds[0] ??
    state.finishedPlayerIds[state.finishedPlayerIds.length - 1];
  if (!loserId) return;

  const loser = state.players.find((p) => p.id === loserId);
  if (!loser) return;

  const winner = state.currentGameWinnerId
    ? state.players.find((p) => p.id === state.currentGameWinnerId)
    : null;

  let penaltyCard: Card | null = null;
  let transferredFromWinner = false;

  if (winner && winner.id !== loser.id) {
    penaltyCard = getFirstPenaltyCardInSequence(winner.penaltyCards);
    if (penaltyCard) {
      winner.penaltyCards = winner.penaltyCards.filter((card) => !sameCard(card, penaltyCard!));
      transferredFromWinner = true;
    }
  }

  penaltyCard ??= getNextPenaltyCard(state.players);
  if (!penaltyCard) return;

  loser.penaltyCards = [...loser.penaltyCards, penaltyCard];
  state.penaltyCard = penaltyCard;
  state.gameOverLoserId = loser.id;
  state.nextPenaltyCard = getNextPenaltyCard(state.players);
  state.phase = "game_over";
  state.currentTurn = "";
  state.turnDeadlineAt = null;
  state.message =
    transferredFromWinner && winner
      ? `${winner.name} wins and passes ${cardLabel(penaltyCard)} to ${loser.name}.`
      : `${loser.name} is the final loser and receives ${cardLabel(penaltyCard)} as a locked penalty card.`;
}

export function createGame(ws: WebSocket, playerName: string, avatarUrl: string | null = null): string {
  sweepRooms();
  const account = accountOf(ws);
  if (!account) { sendError(ws, "Please sign in before playing online."); return ""; }
  const limit = roomCreation.get(account.id) ?? { count: 0, until: Date.now() + 60_000 };
  if (limit.count >= 5 || gameStates.size >= 1000 ||
      [...gameStates.values()].filter(state => state.players.some(p => p.accountId === account.id)).length >= 3) {
    sendError(ws, "Room limit reached. Leave an existing room or try again later."); return "";
  }
  limit.count++; roomCreation.set(account.id, limit);
  const previous = clientMeta.get(ws);
  if (previous) leaveGame(ws, previous.gameId);
  const gameId = generateGameId();
  const playerId = `player_${randomUUID()}`;
  const player = createPlayer(playerId, playerName, avatarUrl);
  attachAccount(ws, player);
  const state = freshGameState(gameId, playerId, [player]);

  state.message = `${playerName} created the game. Waiting for players...`;
  rooms.set(gameId, new Set([ws]));
  gameStates.set(gameId, state);
  clientMeta.set(ws, { gameId, playerId });

  joined(ws, gameId, playerId);
  broadcast(gameId, state);
  logger.info({ gameId, playerId, playerName }, "Game created");
  return gameId;
}

export function joinGame(ws: WebSocket, gameId: string, playerName: string, avatarUrl: string | null = null): void {
  const state = gameStates.get(gameId);
  if (!state) return sendError(ws, `Game "${gameId}" not found`);
  const existingSeat = state.players.find(player => player.accountId && player.accountId === accountOf(ws)?.id);
  if (existingSeat && !clientMeta.has(ws)) return resumeGame(ws, gameId, existingSeat.id);
  if (state.phase !== "lobby") return sendError(ws, "Game already started");
  if (state.players.length >= 10) return sendError(ws, "Game is full (max 10 players)");
  const account = accountOf(ws);
  if (state.players.find(player => player.id === state.hostId)?.accountId && !account) return sendError(ws, "Sign in to join this room.");
  if (account && bannedAccounts.get(gameId)?.has(account.id)) return sendError(ws, "The admin removed you from this room.");
  if (account && state.players.some(player => player.accountId === account.id)) return sendError(ws, "This account already has a seat. Resume your room instead.");
  if (clientMeta.has(ws)) return sendError(ws, "Leave your current room first.");

  const playerId = `player_${randomUUID()}`;
  const player = createPlayer(playerId, playerName, avatarUrl);
  attachAccount(ws, player);

  state.players.push(player);
  state.activePlayerIds.push(player.id);
  state.nextPenaltyCard = getNextPenaltyCard(state.players);
  state.message = `${playerName} joined. ${state.players.length} player(s) in lobby.`;

  rooms.get(gameId)!.add(ws);
  emptySince.delete(gameId);
  clientMeta.set(ws, { gameId, playerId });

  joined(ws, gameId, playerId);
  broadcast(gameId, state);
  logger.info({ gameId, playerId, playerName }, "Player joined game");
}

export function resumeGame(ws: WebSocket, gameId: string, playerId: string, resumeToken = ""): void {
  const previousSeat = clientMeta.get(ws);
  if (previousSeat && (previousSeat.gameId !== gameId || previousSeat.playerId !== playerId)) return sendError(ws, "Leave your current room before resuming another seat.");
  const state = gameStates.get(gameId);
  if (!state) return sendError(ws, "Resume failed: game not found");

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return sendError(ws, "Resume failed: player not found");
  if (player.accountId ? accountOf(ws)?.id !== player.accountId : resumeSecrets.get(gameId + ":" + playerId) !== resumeToken || !resumeToken) return sendError(ws, "Resume failed: sign in to the original account.");
  for (const client of [...(rooms.get(gameId) || [])]) if (client !== ws && clientMeta.get(client)?.playerId === playerId) {
    leaveVoice(client, gameId); clientMeta.delete(client); rooms.get(gameId)?.delete(client);
    sendSuccess(client, "removed", { message: "This seat was resumed on another device." });
  }

  rooms.get(gameId)?.add(ws);
  emptySince.delete(gameId);
  clientMeta.set(ws, { gameId, playerId });
  joined(ws, gameId, playerId);
  state.message = `${player.name} resumed the game.`;
  broadcast(gameId, state);
  logger.info({ gameId, playerId }, "Player resumed game");
}

export function selectDealer(ws: WebSocket, gameId: string, playerId: string): void {
  const state = gameStates.get(gameId), meta = clientMeta.get(ws);
  if (!state || meta?.gameId !== gameId || meta.playerId !== state.hostId) return sendError(ws, "Only the host can select the dealer.");
  if (state.phase !== "lobby") return sendError(ws, "The dealer can only be selected before the game starts.");
  if (!state.players.some(player => player.id === playerId)) return sendError(ws, "Dealer must be a player in this room.");
  state.dealerId = playerId;
  broadcast(gameId, state);
}

export function startGame(ws: WebSocket, gameId: string, dealNumber: number): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);
  if (!state || !meta || meta.gameId !== gameId) return sendError(ws, "Game not found");
  if (meta.playerId !== state.hostId) return sendError(ws, "Only the host can start the game");
  if (state.players.length < 2) return sendError(ws, "Need at least 2 players to start");
  if (state.phase !== "lobby") return sendError(ws, "Game already started");
  if (dealNumber !== state.dealNumber) return sendError(ws, "This deal request is out of date.");
  if (!state.dealerId || !state.players.some(p => p.id === state.dealerId)) return sendError(ws, "Select the first dealer before starting.");

  try { resetForNextDeal(state); }
  catch (error) { return sendError(ws, error instanceof Error ? error.message : "Could not deal cards."); }
  scheduleTurnTimer(gameId, state);
  broadcast(gameId, state);
  logger.info({ gameId }, "Game started");
}

function playCardForPlayer(gameId: string, playerId: string, card: Card, automatic = false): void {
  const state = gameStates.get(gameId);
  if (!state || state.phase !== "playing") return;

  const { valid } = validatePlay(state, playerId, card);
  if (!valid) return;

  clearTurnTimer(gameId);
  const player = state.players.find((p) => p.id === playerId)!;
  player.hand = player.hand.filter((c) => !sameCard(c, card));

  if (state.roundCards.length === 0) {
    state.leadSuit = card.suit;
  }
  const roundEntry: RoundCard = { playerId, card };
  state.roundCards.push(roundEntry);
  logger.info({ gameId, playerId, card: cardLabel(card), automatic }, "Card played");

  // The first off-suit card ends the round; later players do not take a turn.
  const brokeSuit = card.suit !== state.leadSuit;
  if (!brokeSuit && state.roundCards.length < state.activePlayerIds.length) {
    state.currentTurn = nextActivePlayerId(state.activePlayerIds, playerId);
    const nextPlayer = state.players.find((p) => p.id === state.currentTurn);
    state.message = automatic
      ? `${player.name} took too long, so ${cardLabel(card)} was played automatically. ${nextPlayer?.name ?? "Next player"}'s turn.`
      : nextPlayer
      ? `${nextPlayer.name}'s turn.`
      : "Next player's turn.";
    scheduleTurnTimer(gameId, state);
    broadcast(gameId, state);
    return;
  }

  const { winnerId, resolution } = determineRoundWinner(state.roundCards, state.leadSuit!);
  const winner = state.players.find((p) => p.id === winnerId)!;
  const tableCards = state.roundCards.map((rc) => rc.card);
  state.roundWinnerId = winnerId;
  state.lastRoundResolution = resolution;

  if (resolution === "pickup") {
    winner.hand = [...winner.hand, ...tableCards];
    state.message = `Suit broken. ${winner.name} played the highest card of the required suit and picks up all ${tableCards.length} table cards.`;
  } else {
    state.message = `${winner.name} wins the round. All players followed suit, so table cards are discarded.`;
  }

  finishEmptyPlayersAfterRound(state, winnerId);

  if (state.activePlayerIds.length <= 1) {
    assignFinalLoserPenalty(state);
    state.dealerId = nextActivePlayerId(state.players.map(p => p.id), state.dealerId ?? "");
    state.roundCards = [];
    state.leadSuit = null;
    clearTurnTimer(gameId);
    broadcast(gameId, state);
    return;
  }

  const nextLeaderId = state.activePlayerIds.includes(winnerId)
    ? winnerId
    : state.activePlayerIds[0];
  state.phase = "round_end";
  state.turnDeadlineAt = null;
  broadcast(gameId, state);

  setTimeout(() => {
    const currentState = gameStates.get(gameId);
    if (currentState !== state || currentState.phase !== "round_end") return;

    currentState.roundNumber += 1;
    currentState.currentTurn = nextLeaderId;
    currentState.roundCards = [];
    currentState.leadSuit = null;
    currentState.roundWinnerId = null;
    currentState.lastRoundResolution = null;
    currentState.phase = "playing";
    const leader = currentState.players.find((p) => p.id === nextLeaderId);
    currentState.message = leader ? `Round ${currentState.roundNumber}. ${leader.name} leads.` : "Next round.";
    scheduleTurnTimer(gameId, currentState);
    broadcast(gameId, currentState);
  }, 1800);
}

export function playCard(ws: WebSocket, gameId: string, card: Card): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);
  if (!state || !meta || meta.gameId !== gameId) return sendError(ws, "Game not found");
  if (!isCard(card)) return sendError(ws, "Invalid playing card");
  if (state.phase !== "playing") return sendError(ws, "Game is not in playing phase");

  const { valid, reason } = validatePlay(state, meta.playerId, card);
  if (!valid) return sendError(ws, reason ?? "Invalid move");

  playCardForPlayer(gameId, meta.playerId, { rank: card.rank, suit: card.suit });
}

export function sendChat(ws: WebSocket, gameId: string, text: string): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);
  if (!state || !meta) return sendError(ws, "Game not found");
  if (meta.gameId !== gameId) return sendError(ws, "You are not in this game");
  broadcastChatMessage(gameId, meta.playerId, text);
}

export function joinVoice(ws: WebSocket, gameId: string): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);
  if (!state || !meta) return sendError(ws, "Game not found");
  if (meta.gameId !== gameId) return sendError(ws, "You are not in this game");

  const voiceRoom = voiceRooms.get(gameId) ?? new Set<string>();
  voiceRooms.set(gameId, voiceRoom);
  const existingPeers = [...voiceRoom]
    .filter((playerId) => playerId !== meta.playerId)
    .map((playerId) => ({ playerId, playerName: playerName(gameId, playerId) }));

  voiceRoom.add(meta.playerId);
  sendSuccess(ws, "voice_peers", { peers: existingPeers });
  sendSuccess(ws, "voice_music", roomMusic.get(gameId) ?? { title: "", playing: false, hostId: state.hostId });
  broadcastVoiceEvent(
    gameId,
    "voice_peer_joined",
    { playerId: meta.playerId, playerName: playerName(gameId, meta.playerId) },
    meta.playerId,
  );
}

export function leaveVoice(ws: WebSocket, gameId: string): void {
  const meta = clientMeta.get(ws);
  if (!meta || meta.gameId !== gameId) return;
  voiceRooms.get(gameId)?.delete(meta.playerId);
  clearHostMusic(gameId, meta.playerId);
  broadcastVoiceEvent(gameId, "voice_peer_left", { playerId: meta.playerId }, meta.playerId);
}

export function leaveGame(ws: WebSocket, gameId: string): void {
  const meta = clientMeta.get(ws);
  if (!meta || meta.gameId !== gameId) return;
  const state = gameStates.get(gameId);
  handleDisconnect(ws, true);
  if (!state) return;
  resumeSecrets.delete(gameId + ":" + meta.playerId);
  const remaining = state.players.filter(player => player.id !== meta.playerId);
  if (!remaining.length) { deleteRoom(gameId); return; }
  // Explicit departures cancel the unfinished deal; network loss still permits resume.
  const hostId = state.hostId === meta.playerId
    ? (remaining.find(player => socketForPlayer(gameId, player.id)) ?? remaining[0]).id
    : state.hostId;
  const next = freshGameState(gameId, hostId, remaining.map(player => ({
    ...player, hand: [], finished: false, finishOrder: null,
  })));
  next.dealNumber = state.dealNumber;
  next.dealerId = remaining.some(player => player.id === state.dealerId) ? state.dealerId : hostId;
  next.message = "A player left. Select a dealer and start a new deal.";
  clearTurnTimer(gameId);
  gameStates.set(gameId, next);
  broadcast(gameId, next);
}

function clearHostMusic(gameId: string, playerId: string): void {
  if (roomMusic.get(gameId)?.hostId !== playerId) return;
  roomMusic.delete(gameId);
  broadcastVoiceEvent(gameId, "voice_music", { title: "", playing: false, hostId: playerId });
}

export function setRoomMusic(ws: WebSocket, gameId: string, title: unknown, playing: unknown): void {
  const meta = clientMeta.get(ws);
  const state = gameStates.get(gameId);
  if (!meta || meta.gameId !== gameId || meta.playerId !== state?.hostId) {
    return sendError(ws, "Only the room host can control shared songs");
  }
  if (!voiceRooms.get(gameId)?.has(meta.playerId)) return sendError(ws, "Join room audio first");
  if (typeof title !== "string" || title.length > 160 || typeof playing !== "boolean") {
    return sendError(ws, "Invalid song status");
  }
  const cleanTitle = title.trim();
  const music = { title: cleanTitle, playing: Boolean(cleanTitle) && playing, hostId: meta.playerId };
  if (cleanTitle) roomMusic.set(gameId, music);
  else roomMusic.delete(gameId);
  broadcastVoiceEvent(gameId, "voice_music", music);
}

export function relayVoiceSignal(ws: WebSocket, gameId: string, toPlayerId: string, signal: unknown): void {
  const meta = clientMeta.get(ws);
  if (!meta || meta.gameId !== gameId) return;
  const participants = voiceRooms.get(gameId);
  // Signaling is private to players who explicitly joined this room's voice channel.
  if (!participants?.has(meta.playerId) || !participants.has(toPlayerId) || meta.playerId === toPlayerId) return;
  if (!signal || typeof signal !== "object" || JSON.stringify(signal).length > 32000) return;
  const message = signal as { type?: string; description?: { type?: string; sdp?: unknown }; candidate?: unknown };
  if (message.type === "offer" || message.type === "answer") {
    if (message.description?.type !== message.type || typeof message.description.sdp !== "string") return;
  } else if (message.type === "candidate") {
    if (!message.candidate || typeof message.candidate !== "object") return;
  } else return;
  const target = socketForPlayer(gameId, toPlayerId);
  if (!target) return;
  target.send(JSON.stringify({
    type: "voice_signal",
    payload: { fromPlayerId: meta.playerId, signal },
  }));
}

export function relayVoiceChunk(ws: WebSocket, gameId: string, mimeType: string, data: string): void {
  const meta = clientMeta.get(ws);
  const clients = rooms.get(gameId);
  if (!meta || meta.gameId !== gameId || !clients) return;
  const participants = voiceRooms.get(gameId);
  if (!participants?.has(meta.playerId)) return;
  if (data.length > 120000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || !["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].includes(mimeType)) return;

  const cleanData = data.slice(0, 120_000);
  const payload = {
    fromPlayerId: meta.playerId,
    playerName: playerName(gameId, meta.playerId),
    mimeType: mimeType.slice(0, 80),
    data: cleanData,
  };

  for (const client of clients) {
    const clientMetaForRoom = clientMeta.get(client);
    if (
      client.readyState === WebSocket.OPEN &&
      !!accountOf(client) &&
      clientMetaForRoom?.playerId !== meta.playerId &&
      !!clientMetaForRoom && participants.has(clientMetaForRoom.playerId)
    ) {
      client.send(JSON.stringify({ type: "voice_chunk", payload }));
    }
  }
}

export function restartGame(ws: WebSocket, gameId: string, dealNumber: number): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);
  if (!state || !meta || meta.gameId !== gameId) return sendError(ws, "Game not found");
  if (meta.playerId !== state.hostId) return sendError(ws, "Only the host can start the next game");
  if (state.phase !== "game_over" || dealNumber !== state.dealNumber) return sendError(ws, "This game has not finished or the request is out of date.");

  state.phase = "lobby";
  state.players = state.players.map((p) => ({
    ...p,
    hand: [],
    finished: false,
    finishOrder: null,
  }));
  state.activePlayerIds = state.players.map((p) => p.id);
  state.finishedPlayerIds = [];
  state.currentTurn = "";
  state.turnDeadlineAt = null;
  state.roundCards = [];
  state.roundWinnerId = null;
  state.roundNumber = 0;
  state.leadSuit = null;
  state.lastRoundResolution = null;
  state.currentGameWinnerId = null;
  state.gameOverLoserId = null;
  state.penaltyCard = null;
  state.nextPenaltyCard = getNextPenaltyCard(state.players);
  state.message = "Next game ready. Host can start a fresh deal.";
  clearTurnTimer(gameId);

  broadcast(gameId, state);
  logger.info({ gameId }, "Next game prepared");
}

export function restartTournament(ws: WebSocket, gameId: string): void {
  const state = gameStates.get(gameId);
  const meta = clientMeta.get(ws);
  if (!state || !meta || meta.gameId !== gameId) return sendError(ws, "Game not found");
  if (meta.playerId !== state.hostId) return sendError(ws, "Only the host can restart the tournament");

  const resetPlayers = state.players.map((p) => ({ ...createPlayer(p.id, p.name, p.avatarUrl ?? null), accountId: p.accountId, username: p.username }));
  const nextState = freshGameState(gameId, state.hostId, resetPlayers);
  nextState.message = "Tournament restarted. Waiting for host to start.";
  gameStates.set(gameId, nextState);
  clearTurnTimer(gameId);
  broadcast(gameId, nextState);
  logger.info({ gameId }, "Tournament restarted");
}

export function handleDisconnect(ws: WebSocket, preserveAccount = false): void {
  if (!preserveAccount) { accounts.delete(ws); refreshSocial(); }
  const meta = clientMeta.get(ws);
  if (!meta) return;

  const { gameId, playerId } = meta;
  voiceRooms.get(gameId)?.delete(playerId);
  clearHostMusic(gameId, playerId);
  broadcastVoiceEvent(gameId, "voice_peer_left", { playerId }, playerId);
  clientMeta.delete(ws);
  rooms.get(gameId)?.delete(ws);
  if (rooms.get(gameId)?.size === 0 && !emptySince.has(gameId)) emptySince.set(gameId, Date.now());

  const state = gameStates.get(gameId);
  if (state) {
    const player = state.players.find((p) => p.id === playerId);
    state.message = `${player?.name ?? "A player"} disconnected.`;
    broadcast(gameId, state);
  }

  logger.info({ gameId, playerId }, "Player disconnected");
}

export function handleMessage(ws: WebSocket, rawMessage: string): void {
  let msg: unknown;
  try {
    msg = JSON.parse(rawMessage);
  } catch {
    sendError(ws, "Invalid message format");
    return;
  }

  if (!validMessage(msg)) return sendError(ws, "Invalid message payload");
  const { type, payload } = msg;
  if (accounts.has(ws) && !accountOf(ws)) {
    handleDisconnect(ws);
    sendSuccess(ws, "removed", { message: "Session expired. Please sign in again." });
    socialState(ws);
    if (type !== "authenticate") return sendError(ws, "Session expired. Please sign in again.");
  }
  if (handleSocial(ws, type, payload)) return;
  if (!accountOf(ws)) return sendError(ws, "Please sign in before playing online.");
  if (payload.gameId && !["join_game", "resume_game"].includes(type) && clientMeta.get(ws)?.gameId !== payload.gameId) return sendError(ws, "You are not in this game");
  let avatarUrl: string | null = null;
  if (["create_game", "join_game", "update_profile"].includes(type)) {
    try { avatarUrl = cleanAvatar(payload.avatarUrl); }
    catch { return sendError(ws, "Choose a valid JPEG profile photo under 45 KB."); }
  }
  switch (type) {
    case "update_profile": {
      const meta = clientMeta.get(ws);
      if (!meta || meta.gameId !== payload.gameId) return sendError(ws, "You are not in this game");
      const state = gameStates.get(meta.gameId);
      const player = state?.players.find(p => p.id === meta.playerId);
      if (!state || !player) return;
      player.name = String(payload.playerName ?? "Player").trim().slice(0, 20) || "Player";
      player.avatarUrl = avatarUrl;
      broadcast(meta.gameId, state);
      break;
    }
    case "create_game":
      createGame(ws, String(payload.playerName ?? "Player"), avatarUrl);
      break;
    case "join_game":
      joinGame(ws, String(payload.gameId ?? ""), String(payload.playerName ?? "Player"), avatarUrl);
      break;
    case "resume_game":
      resumeGame(ws, String(payload.gameId ?? ""), String(payload.playerId ?? ""), String(payload.resumeToken ?? ""));
      break;
    case "remove_player":
      removePlayer(ws, String(payload.gameId ?? ""), String(payload.playerId ?? ""));
      break;
    case "start_game":
      startGame(ws, String(payload.gameId ?? ""), Number(payload.dealNumber));
      break;
    case "select_dealer":
      selectDealer(ws, String(payload.gameId ?? ""), String(payload.playerId ?? ""));
      break;
    case "play_card":
      playCard(ws, String(payload.gameId ?? ""), payload.card as Card);
      break;
    case "chat_message":
      sendChat(ws, String(payload.gameId ?? ""), String(payload.text ?? ""));
      break;
    case "voice_join":
      joinVoice(ws, String(payload.gameId ?? ""));
      break;
    case "voice_music":
      setRoomMusic(ws, String(payload.gameId ?? ""), payload.title, payload.playing);
      break;
    case "voice_leave":
      leaveVoice(ws, String(payload.gameId ?? ""));
      break;
    case "leave_game":
      leaveGame(ws, String(payload.gameId ?? ""));
      break;
    case "voice_signal":
      relayVoiceSignal(
        ws,
        String(payload.gameId ?? ""),
        String(payload.toPlayerId ?? ""),
        payload.signal,
      );
      break;
    case "voice_chunk":
      relayVoiceChunk(
        ws,
        String(payload.gameId ?? ""),
        String(payload.mimeType ?? ""),
        String(payload.data ?? ""),
      );
      break;
    case "restart_game":
      restartGame(ws, String(payload.gameId ?? ""), Number(payload.dealNumber));
      break;
    case "restart_tournament":
      restartTournament(ws, String(payload.gameId ?? ""));
      break;
    default:
      sendError(ws, `Unknown message type: ${type}`);
  }
}
