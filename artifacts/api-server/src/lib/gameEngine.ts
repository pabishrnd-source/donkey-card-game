/**
 * Card Game Engine
 *
 * This module implements the core game logic for the multiplayer trick-taking card game.
 *
 * GAME RULES SUMMARY:
 * - Standard 52-card deck, shuffled and dealt equally to 2-6 players
 * - First round MUST start with the Ace of Spades
 * - Players must follow suit if possible
 * - Highest card of the led suit wins the round (Ace is high)
 * - Round winner starts the next round
 * - Game ends when all cards are played
 * - Player with the most "tricks won" (penalty accumulation) loses
 * - Loser receives the Ace of Spades as a penalty card
 */

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
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
  id: string;
  name: string;
  hand: Card[];
  tricksWon: number; // number of rounds/tricks this player has won (used to determine loser)
}

export type GamePhase =
  | "lobby"        // waiting for players to join
  | "playing"      // game in progress
  | "round_end"    // a round just finished (brief pause to show winner)
  | "game_over";   // all cards played, final result shown

export interface RoundCard {
  playerId: string;
  card: Card;
}

export interface GameState {
  gameId: string;
  players: Player[];
  currentTurn: string;       // playerId whose turn it is
  roundCards: RoundCard[];   // cards played in the current round
  phase: GamePhase;
  roundWinnerId: string | null;
  roundNumber: number;
  leadSuit: Suit | null;     // suit that must be followed (set by first card of round)
  gameOverLoserId: string | null;
  penaltyCard: Card | null;  // Ace of Spades penalty assigned to loser
  message: string;           // informational message for the UI
  hostId: string;            // player who can start the game
}

/** Card rank ordering — higher index = higher rank */
const RANK_ORDER: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

/** Returns the numeric rank value (higher = stronger) */
export function rankValue(rank: Rank): number {
  return RANK_ORDER.indexOf(rank);
}

/** Create a full standard 52-card deck */
export function createDeck(): Card[] {
  const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
  const ranks: Rank[] = [
    "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
  ];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle */
export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/**
 * Deal cards equally to all players.
 * Any remainder cards (when 52 doesn't divide evenly) are discarded.
 */
export function dealCards(players: Player[], deck: Card[]): Player[] {
  const count = players.length;
  const cardsPerPlayer = Math.floor(deck.length / count);
  return players.map((p, i) => ({
    ...p,
    hand: deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer),
    tricksWon: 0,
  }));
}

/** Find the player who holds the Ace of Spades */
export function findAceOfSpadesHolder(players: Player[]): string | null {
  for (const player of players) {
    if (player.hand.some((c) => c.suit === "spades" && c.rank === "A")) {
      return player.id;
    }
  }
  return null;
}

/** Check if a player has any card of the given suit */
export function hasSuit(player: Player, suit: Suit): boolean {
  return player.hand.some((c) => c.suit === suit);
}

/**
 * Validate whether a player can legally play a given card.
 *
 * Rules:
 * 1. First round, first card MUST be Ace of Spades
 * 2. First round, other players MUST play Spades if they have them
 * 3. Subsequent rounds, if you have the lead suit, you must play it
 * 4. If you don't have the lead suit (or any required suit), you can play anything
 */
export function validatePlay(
  gameState: GameState,
  playerId: string,
  card: Card
): { valid: boolean; reason?: string } {
  const player = gameState.players.find((p) => p.id === playerId);
  if (!player) return { valid: false, reason: "Player not found" };

  if (gameState.currentTurn !== playerId) {
    return { valid: false, reason: "It is not your turn" };
  }

  if (!player.hand.some((c) => c.suit === card.suit && c.rank === card.rank)) {
    return { valid: false, reason: "You do not have that card" };
  }

  const isFirstRound = gameState.roundNumber === 1;
  const isFirstCardOfRound = gameState.roundCards.length === 0;

  // First round, first player: MUST play Ace of Spades
  if (isFirstRound && isFirstCardOfRound) {
    if (card.suit !== "spades" || card.rank !== "A") {
      return { valid: false, reason: "The first card must be the Ace of Spades" };
    }
    return { valid: true };
  }

  // First round, other players: MUST follow spades
  if (isFirstRound && !isFirstCardOfRound) {
    const hasSpades = hasSuit(player, "spades");
    if (hasSpades && card.suit !== "spades") {
      return { valid: false, reason: "You must play a Spades card (you have Spades in hand)" };
    }
    return { valid: true };
  }

  // Later rounds, first card: any card is valid (round winner leads freely)
  if (!isFirstRound && isFirstCardOfRound) {
    return { valid: true };
  }

  // Later rounds, following cards: must follow lead suit if possible
  const leadSuit = gameState.leadSuit;
  if (leadSuit && hasSuit(player, leadSuit) && card.suit !== leadSuit) {
    return {
      valid: false,
      reason: `You must follow the lead suit (${leadSuit}) — you have ${leadSuit} cards`,
    };
  }

  return { valid: true };
}

/**
 * Determine the winner of the current round.
 *
 * Only the lead suit matters — cards of other suits cannot win even if
 * they are higher in absolute rank, because they are off-suit plays.
 * Among cards of the lead suit, highest rank wins.
 */
export function determineRoundWinner(
  roundCards: RoundCard[],
  leadSuit: Suit
): string {
  let winnerCard = roundCards[0];
  for (const played of roundCards) {
    // Only cards of the lead suit can win
    if (played.card.suit !== leadSuit) continue;
    if (
      winnerCard.card.suit !== leadSuit ||
      rankValue(played.card.rank) > rankValue(winnerCard.card.rank)
    ) {
      winnerCard = played;
    }
  }
  return winnerCard.playerId;
}

/**
 * Check if the game is over (all players have empty hands).
 * Determine the loser: the player who won the most tricks.
 * Ties are broken by the player with the higher sum of won-trick rank values (not implemented — first found wins).
 */
export function checkGameOver(players: Player[]): {
  isOver: boolean;
  loserId: string | null;
} {
  const allEmpty = players.every((p) => p.hand.length === 0);
  if (!allEmpty) return { isOver: false, loserId: null };

  // The loser is the player who won the most tricks (rounds)
  let maxTricks = -1;
  let loserId: string | null = null;
  for (const p of players) {
    if (p.tricksWon > maxTricks) {
      maxTricks = p.tricksWon;
      loserId = p.id;
    }
  }
  return { isOver: true, loserId };
}

/** Helper: get a card's display label, e.g. "A♠" */
export function cardLabel(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}
