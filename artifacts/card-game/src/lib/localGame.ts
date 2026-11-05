import { createPlayableDeck, shuffleDeck, dealCards, findStartingPlayerId, getNextPenaltyCard, getFirstPenaltyCardInSequence, validatePlay, sameCard, determineRoundWinner, nextActivePlayerId } from "../../../api-server/src/lib/gameEngine";
import type { GameState, Player, Card } from "./gameTypes";

export function localPlayer(id: string, name: string): Player {
  return { id, name: name.trim().slice(0, 20) || "Player", hand: [], penaltyCards: [], finished: false, finishOrder: null };
}

export function localLobby(players: Player[], gameId = "OFFLINE", previous?: GameState): GameState {
  const dealerId = players.some(p => p.id === previous?.dealerId) ? previous!.dealerId :
    previous?.dealNumber ? nextActivePlayerId(previous.players.map(p => p.id), previous.dealerId ?? "") : null;
  return { gameId, players, hostId: players[0].id, activePlayerIds: players.map(p => p.id), finishedPlayerIds: [], currentTurn: "", roundCards: [], phase: "lobby", roundWinnerId: null, roundNumber: 0, dealNumber: previous?.dealNumber ?? 0, dealerId, leadSuit: null, lastRoundResolution: null, currentGameWinnerId: null, gameOverLoserId: null, penaltyCard: null, nextPenaltyCard: getNextPenaltyCard(players), turnDeadlineAt: null, message: "Waiting for players." };
}

export function startLocal(state: GameState): GameState {
  if (state.phase !== "lobby") throw new Error("This deal has already started.");
  if (!state.dealerId) throw new Error("Select the first dealer.");
  if (state.players.length < 2 || state.players.length > 10) throw new Error("Choose 2 to 10 players.");
  const players = dealCards(state.players, shuffleDeck(createPlayableDeck(state.players)), state.dealerId);
  if (players.some(p => p.hand.length === 0)) throw new Error("Not enough playable cards. Restart the tournament.");
  return { ...localLobby(players, state.gameId, state), dealNumber: state.dealNumber + 1, phase: "playing", roundNumber: 1, currentTurn: findStartingPlayerId(players)!, message: "Game started." };
}

export function playLocal(previous: GameState, playerId: string, card: Card): GameState {
  if (previous.phase !== "playing") throw new Error("Wait for the next round.");
  const validation = validatePlay(previous, playerId, card);
  if (!validation.valid) throw new Error(validation.reason);
  const state = structuredClone(previous);
  const player = state.players.find(p => p.id === playerId)!;
  player.hand = player.hand.filter(c => !sameCard(c, card));
  state.leadSuit ??= card.suit;
  state.roundCards.push({ playerId, card });
  if (card.suit === state.leadSuit && state.roundCards.length < state.activePlayerIds.length) {
    state.currentTurn = nextActivePlayerId(state.activePlayerIds, playerId);
    return state;
  }
  const { winnerId, resolution } = determineRoundWinner(state.roundCards, state.leadSuit);
  const winner = state.players.find(p => p.id === winnerId)!;
  if (resolution === "pickup") winner.hand.push(...state.roundCards.map(entry => entry.card));
  state.roundWinnerId = winnerId;
  state.lastRoundResolution = resolution;
  // Resolve pickups before marking anyone finished, matching the online game.
  for (const id of [winnerId, ...state.activePlayerIds.filter(id => id !== winnerId)]) {
    const p = state.players.find(p => p.id === id)!;
    if (!p.finished && p.hand.length === 0) {
      p.finished = true;
      p.finishOrder = state.finishedPlayerIds.push(id);
      state.activePlayerIds = state.activePlayerIds.filter(active => active !== id);
      state.currentGameWinnerId ??= id;
    }
  }
  state.message = resolution === "pickup" ? `${winner.name} picks up the table.` : `${winner.name} wins the round. Cards discarded.`;
  if (state.activePlayerIds.length <= 1) {
    const loser = state.players.find(p => p.id === (state.activePlayerIds[0] ?? state.finishedPlayerIds.at(-1)))!;
    const first = state.players.find(p => p.id === state.currentGameWinnerId);
    const transferred = first && first.id !== loser.id ? getFirstPenaltyCardInSequence(first.penaltyCards) : null;
    if (transferred && first) first.penaltyCards = first.penaltyCards.filter(c => !sameCard(c, transferred));
    const penalty = transferred ?? getNextPenaltyCard(state.players);
    if (penalty) loser.penaltyCards.push(penalty);
    Object.assign(state, { phase: "game_over", gameOverLoserId: loser.id, penaltyCard: penalty, nextPenaltyCard: getNextPenaltyCard(state.players), currentTurn: "", roundCards: [], leadSuit: null });
    state.dealerId = nextActivePlayerId(state.players.map(p => p.id), state.dealerId ?? "");
  } else {
    state.phase = "round_end";
  }
  return state;
}

export function advanceLocal(state: GameState): GameState {
  if (state.phase !== "round_end") return state;
  return { ...state, phase: "playing", roundNumber: state.roundNumber + 1, currentTurn: state.activePlayerIds.includes(state.roundWinnerId!) ? state.roundWinnerId! : state.activePlayerIds[0], roundCards: [], leadSuit: null, roundWinnerId: null, lastRoundResolution: null };
}

export function localView(state: GameState, viewer: string): GameState {
  return { ...state, players: state.players.map(p => ({ ...p, hand: p.id === viewer ? p.hand : [] })) };
}
