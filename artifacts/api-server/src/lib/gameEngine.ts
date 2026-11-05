/**
 * Core tournament rules for the card game.
 *
 * The game has two card zones per player:
 * - hand: playable cards dealt from the remaining deck
 * - penaltyCards: locked cards that stay visible but cannot be played
 *
 * A tournament continues across games. After each game, the current winner
 * passes one locked penalty card to the final loser if they have one. Otherwise
 * the final loser receives the next penalty card in suit/rank order. Assigned
 * penalty cards are removed from future playable decks, while all original
 * players return for the next fresh deal.
 */

export type Suit = "spades" | "clubs" | "hearts" | "diamonds";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  accountId?: string;
  username?: string;
  id: string;
  name: string;
  avatarUrl?: string | null;
  hand: Card[];
  penaltyCards: Card[];
  finished: boolean;
  finishOrder: number | null;
}

export type GamePhase =
  | "lobby"
  | "playing"
  | "round_end"
  | "game_over";

export interface RoundCard {
  playerId: string;
  card: Card;
}

export type RoundResolution = "discard" | "pickup";

export interface GameState {
  gameId: string;
  players: Player[];
  activePlayerIds: string[];
  finishedPlayerIds: string[];
  currentTurn: string;
  roundCards: RoundCard[];
  phase: GamePhase;
  roundWinnerId: string | null;
  roundNumber: number;
  dealNumber: number;
  dealerId: string | null;
  leadSuit: Suit | null;
  lastRoundResolution: RoundResolution | null;
  currentGameWinnerId: string | null;
  gameOverLoserId: string | null;
  penaltyCard: Card | null;
  nextPenaltyCard: Card | null;
  turnDeadlineAt: number | null;
  message: string;
  hostId: string;
}

const RANK_ORDER: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

const PENALTY_SUITS: Suit[] = ["spades", "clubs", "hearts", "diamonds"];
const PENALTY_RANKS: Rank[] = [
  "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2",
];

export const PENALTY_SEQUENCE: Card[] = PENALTY_SUITS.flatMap((suit) =>
  PENALTY_RANKS.map((rank) => ({ suit, rank }))
);

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function rankValue(rank: Rank): number {
  return RANK_ORDER.indexOf(rank);
}

export function cardLabel(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    spades: "♠",
    clubs: "♣",
    hearts: "♥",
    diamonds: "♦",
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of PENALTY_SUITS) {
    for (const rank of RANK_ORDER) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function getAssignedPenaltyCards(players: Player[]): Card[] {
  return players.flatMap((p) => p.penaltyCards);
}

export function createPlayableDeck(players: Player[]): Card[] {
  const assigned = getAssignedPenaltyCards(players);
  return createDeck().filter((card) => !assigned.some((p) => sameCard(p, card)));
}

export function getNextPenaltyCard(players: Player[]): Card | null {
  const assigned = getAssignedPenaltyCards(players);
  return PENALTY_SEQUENCE.find((card) => !assigned.some((p) => sameCard(p, card))) ?? null;
}

export function getFirstPenaltyCardInSequence(cards: Card[]): Card | null {
  return PENALTY_SEQUENCE.find((card) => cards.some((candidate) => sameCard(candidate, card))) ?? null;
}

export function dealCards(players: Player[], deck: Card[], dealerId = players[0]?.id): Player[] {
  if (players.length < 2 || players.length > 10 || new Set(players.map(p => p.id)).size !== players.length) {
    throw new Error("Choose 2 to 10 distinct players.");
  }
  const start = players.findIndex(p => p.id === dealerId);
  if (start < 0) throw new Error("Select a dealer from the players.");
  const expected = createPlayableDeck(players);
  const keys = deck.map(card => `${card.suit}:${card.rank}`);
  if (deck.length !== expected.length || new Set(keys).size !== deck.length ||
      expected.some(card => !keys.includes(`${card.suit}:${card.rank}`))) {
    throw new Error("The deal must contain every available standard card exactly once.");
  }
  if (deck.length < players.length) throw new Error("Not enough playable cards. Restart the tournament.");
  const dealt = players.map(p => ({
    ...p,
    hand: [] as Card[],
    finished: false,
    finishOrder: null,
  }));
  deck.forEach((card, index) => dealt[(start + index) % dealt.length].hand.push(card));
  return dealt;
}

export function getActivePlayers(state: GameState): Player[] {
  return state.activePlayerIds
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
}

export function hasSuit(player: Player, suit: Suit): boolean {
  return player.hand.some((c) => c.suit === suit);
}

export function findStartingPlayerId(players: Player[]): string | null {
  for (const penaltyCard of PENALTY_SEQUENCE) {
    const holder = players.find((p) => p.hand.some((c) => sameCard(c, penaltyCard)));
    if (holder) return holder.id;
  }
  return players[0]?.id ?? null;
}

export function getRequiredStartingCard(players: Player[]): Card | null {
  for (const penaltyCard of PENALTY_SEQUENCE) {
    if (players.some((p) => p.hand.some((c) => sameCard(c, penaltyCard)))) {
      return penaltyCard;
    }
  }
  return null;
}

export function validatePlay(
  gameState: GameState,
  playerId: string,
  card: Card
): { valid: boolean; reason?: string } {
  if (!card || typeof card !== "object" || !PENALTY_SUITS.includes(card.suit) || !RANK_ORDER.includes(card.rank)) {
    return { valid: false, reason: "Invalid playing card" };
  }
  const player = gameState.players.find((p) => p.id === playerId);
  if (!player) return { valid: false, reason: "Player not found" };
  if (player.finished || !gameState.activePlayerIds.includes(playerId)) {
    return { valid: false, reason: "This player has already finished" };
  }
  if (gameState.currentTurn !== playerId) {
    return { valid: false, reason: "It is not your turn" };
  }
  if (!player.hand.some((c) => sameCard(c, card))) {
    return { valid: false, reason: "You do not have that playable card" };
  }

  const isFirstRound = gameState.roundNumber === 1;
  const isFirstCardOfRound = gameState.roundCards.length === 0;
  const requiredStart = getRequiredStartingCard(gameState.players);

  if (isFirstRound && isFirstCardOfRound && requiredStart && !sameCard(card, requiredStart)) {
    return {
      valid: false,
      reason: `The first card must be ${cardLabel(requiredStart)}`,
    };
  }

  const leadSuit = gameState.leadSuit;
  if (leadSuit && hasSuit(player, leadSuit) && card.suit !== leadSuit) {
    return { valid: false, reason: `You must follow ${leadSuit}` };
  }

  return { valid: true };
}

export function getHighestPlayableCard(gameState: GameState, playerId: string): Card | null {
  const player = gameState.players.find((p) => p.id === playerId);
  if (!player) return null;

  const playableCards = player.hand.filter((card) => validatePlay(gameState, playerId, card).valid);
  if (playableCards.length === 0) return null;

  return playableCards.reduce((highest, card) =>
    rankValue(card.rank) > rankValue(highest.rank) ? card : highest
  );
}

export function allFollowedLeadSuit(roundCards: RoundCard[], leadSuit: Suit): boolean {
  return roundCards.every((played) => played.card.suit === leadSuit);
}

export function determineRoundWinner(
  roundCards: RoundCard[],
  leadSuit: Suit
): { winnerId: string; resolution: RoundResolution } {
  const allFollowed = allFollowedLeadSuit(roundCards, leadSuit);
  let winnerCard =
    roundCards.find((played) => played.card.suit === leadSuit) ?? roundCards[0];

  for (const played of roundCards) {
    if (played.card.suit !== leadSuit) continue;
    if (rankValue(played.card.rank) > rankValue(winnerCard.card.rank)) {
      winnerCard = played;
    }
  }

  return {
    winnerId: winnerCard.playerId,
    resolution: allFollowed ? "discard" : "pickup",
  };
}

export function nextActivePlayerId(activeIds: string[], currentId: string): string {
  const currentIndex = activeIds.indexOf(currentId);
  if (currentIndex < 0) return activeIds[0] ?? "";
  return activeIds[(currentIndex + 1) % activeIds.length] ?? "";
}
