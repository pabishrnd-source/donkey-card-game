/**
 * Shared type definitions for the card game frontend.
 * These mirror the types in the backend gameEngine.ts.
 */

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  tricksWon: number;
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

export interface GameState {
  gameId: string;
  players: Player[];
  currentTurn: string;
  roundCards: RoundCard[];
  phase: GamePhase;
  roundWinnerId: string | null;
  roundNumber: number;
  leadSuit: Suit | null;
  gameOverLoserId: string | null;
  penaltyCard: Card | null;
  message: string;
  hostId: string;
}

/** WebSocket messages sent from client to server */
export type ClientMessage =
  | { type: "create_game"; payload: { playerName: string } }
  | { type: "join_game"; payload: { gameId: string; playerName: string } }
  | { type: "start_game"; payload: { gameId: string } }
  | { type: "play_card"; payload: { gameId: string; card: Card } }
  | { type: "restart_game"; payload: { gameId: string } };

/** WebSocket messages received from server by client */
export type ServerMessage =
  | { type: "game_state"; payload: GameState }
  | { type: "joined"; payload: { gameId: string; playerId: string } }
  | { type: "error"; payload: { message: string } };
