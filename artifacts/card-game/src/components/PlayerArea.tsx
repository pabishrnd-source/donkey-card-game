/**
 * PlayerArea component
 *
 * Displays a player's name, trick count, and their hand of cards.
 * Highlights the active player and shows playable cards.
 */

import { type Player, type Card, type GameState } from "@/lib/gameTypes";
import { PlayingCard } from "./PlayingCard";
import { cn } from "@/lib/utils";

interface PlayerAreaProps {
  player: Player;
  isMe: boolean;         // Is this the current user viewing the page?
  isCurrentTurn: boolean;
  gameState: GameState;
  onPlayCard?: (card: Card) => void;
}

/**
 * Determines if a card in the player's hand is legally playable.
 * Rules are re-checked client-side for UI feedback (server also validates).
 */
function isCardPlayable(card: Card, player: Player, gameState: GameState): boolean {
  if (gameState.phase !== "playing") return false;
  if (gameState.currentTurn !== player.id) return false;

  const isFirstRound = gameState.roundNumber === 1;
  const isFirstCardOfRound = gameState.roundCards.length === 0;

  // First round, first card: only Ace of Spades
  if (isFirstRound && isFirstCardOfRound) {
    return card.suit === "spades" && card.rank === "A";
  }

  // First round, following cards: must play Spades if available
  if (isFirstRound && !isFirstCardOfRound) {
    const hasSpades = player.hand.some((c) => c.suit === "spades");
    if (hasSpades) return card.suit === "spades";
    return true; // no Spades — anything goes
  }

  // Later rounds, first card: any card
  if (!isFirstRound && isFirstCardOfRound) return true;

  // Later rounds, following cards: must follow lead suit if possible
  const leadSuit = gameState.leadSuit;
  if (!leadSuit) return true;
  const hasLeadSuit = player.hand.some((c) => c.suit === leadSuit);
  if (hasLeadSuit) return card.suit === leadSuit;
  return true; // no lead suit cards — anything goes
}

export function PlayerArea({
  player,
  isMe,
  isCurrentTurn,
  gameState,
  onPlayCard,
}: PlayerAreaProps) {
  return (
    <div
      className={cn(
        "rounded-xl p-3 border-2 transition-all duration-300",
        isCurrentTurn
          ? "border-yellow-400 bg-yellow-50 shadow-lg shadow-yellow-100"
          : "border-gray-200 bg-white/80",
        isMe && "ring-2 ring-blue-400"
      )}
    >
      {/* Player header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Turn indicator dot */}
          <div
            className={cn(
              "w-3 h-3 rounded-full transition-all",
              isCurrentTurn ? "bg-yellow-400 animate-pulse" : "bg-gray-300"
            )}
          />
          <span className="font-semibold text-gray-800">
            {player.name}
            {isMe && (
              <span className="ml-1 text-xs text-blue-500 font-normal">(you)</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <span className="text-gray-400">🃏</span>
            <span className="font-medium text-gray-700">{player.hand.length}</span>
            <span>cards</span>
          </span>
          {player.tricksWon > 0 && (
            <span className="flex items-center gap-1">
              <span>Tricks won:</span>
              <span className="font-bold text-amber-600">{player.tricksWon}</span>
            </span>
          )}
        </div>
      </div>

      {/* Card hand — only shown for "me" */}
      {isMe && gameState.phase !== "lobby" && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {player.hand.length === 0 ? (
            <span className="text-sm text-gray-400 italic">No cards</span>
          ) : (
            player.hand.map((card, idx) => {
              const playable = isCardPlayable(card, player, gameState);
              return (
                <PlayingCard
                  key={`${card.suit}-${card.rank}-${idx}`}
                  card={card}
                  playable={playable && isCurrentTurn}
                  onClick={
                    playable && isCurrentTurn && onPlayCard
                      ? () => onPlayCard(card)
                      : undefined
                  }
                  size="md"
                />
              );
            })
          )}
        </div>
      )}

      {/* For other players: show card-back placeholders */}
      {!isMe && gameState.phase !== "lobby" && (
        <div className="flex flex-wrap gap-1 mt-2">
          {Array.from({ length: player.hand.length }).map((_, i) => (
            <PlayingCard
              key={i}
              card={{ suit: "spades", rank: "2" }}
              hidden
              size="sm"
            />
          ))}
        </div>
      )}
    </div>
  );
}
