/**
 * Shared type definitions for the card game frontend.
 * These mirror the types in the backend gameEngine.ts.
 */

export type Suit = "spades" | "clubs" | "hearts" | "diamonds";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

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

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: number;
}

export type VoiceSignal =
  | { type: "offer"; description: RTCSessionDescriptionInit }
  | { type: "answer"; description: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

export type VoiceEvent =
  | { type: "voice_music"; payload: { title: string; playing: boolean; hostId: string } }
  | { type: "voice_peers"; payload: { peers: Array<{ playerId: string; playerName: string }> } }
  | { type: "voice_peer_joined"; payload: { playerId: string; playerName: string } }
  | { type: "voice_peer_left"; payload: { playerId: string } }
  | { type: "voice_signal"; payload: { fromPlayerId: string; signal: VoiceSignal } }
  | { type: "voice_chunk"; payload: { fromPlayerId: string; playerName: string; mimeType: string; data: string } };

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
  lastRoundResolution: "discard" | "pickup" | null;
  currentGameWinnerId: string | null;
  gameOverLoserId: string | null;
  penaltyCard: Card | null;
  nextPenaltyCard: Card | null;
  turnDeadlineAt: number | null;
  message: string;
  hostId: string;
}

/** WebSocket messages sent from client to server */
export type ClientMessage =
  | { type: "authenticate"; payload: { token: string } }
  | { type: "social_refresh" | "sign_out"; payload: Record<string, never> }
  | { type: "friend_request"; payload: { username: string } }
  | { type: "friend_answer"; payload: { userId: string; accept: boolean } }
  | { type: "friend_remove" | "match_invite"; payload: { userId: string } }
  | { type: "invite_answer"; payload: { inviteId: string; accept: boolean } }
  | { type: "remove_player"; payload: { gameId: string; playerId: string } }
  | { type: "create_game"; payload: { playerName: string; avatarUrl?: string | null } }
  | { type: "join_game"; payload: { gameId: string; playerName: string; avatarUrl?: string | null } }
  | { type: "update_profile"; payload: { gameId: string; playerName: string; avatarUrl: string | null } }
  | { type: "resume_game"; payload: { gameId: string; playerId: string; resumeToken?: string } }
  | { type: "leave_game"; payload: { gameId: string } }
  | { type: "select_dealer"; payload: { gameId: string; playerId: string } }
  | { type: "start_game"; payload: { gameId: string; dealNumber: number } }
  | { type: "play_card"; payload: { gameId: string; card: Card } }
  | { type: "chat_message"; payload: { gameId: string; text: string } }
  | { type: "voice_join"; payload: { gameId: string } }
  | { type: "voice_music"; payload: { gameId: string; title: string; playing: boolean } }
  | { type: "voice_leave"; payload: { gameId: string } }
  | { type: "voice_signal"; payload: { gameId: string; toPlayerId: string; signal: VoiceSignal } }
  | { type: "voice_chunk"; payload: { gameId: string; mimeType: string; data: string } }
  | { type: "restart_game"; payload: { gameId: string; dealNumber: number } }
  | { type: "restart_tournament"; payload: { gameId: string } };

/** WebSocket messages received from server by client */
export type ServerMessage =
  | { type: "social_state"; payload: SocialState }
  | { type: "social_notice" | "removed"; payload: { message: string } }
  | { type: "game_state"; payload: GameState }
  | { type: "joined"; payload: { gameId: string; playerId: string; resumeToken?: string } }
  | { type: "chat_message"; payload: ChatMessage }
  | VoiceEvent
  | { type: "error"; payload: { message: string } };

export interface Account { id: string; username: string }
export interface SocialState {
  user: Account | null;
  friends: (Account & { online: boolean })[];
  incoming: Account[];
  outgoing: Account[];
  invitations: { id: string; fromName: string; gameId: string; expires: number }[];
}
