/**
 * GameTable component
 *
 * Displays the "table" in the center of the game — the cards currently
 * played in the active round, with each card labeled by the player's name.
 * Also shows the lead suit indicator and round status.
 */

import { type GameState, type Suit } from "@/lib/gameTypes";
import { PlayingCard } from "./PlayingCard";

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const SUIT_COLORS: Record<Suit, string> = {
  spades: "text-gray-900",
  hearts: "text-red-500",
  diamonds: "text-red-500",
  clubs: "text-gray-900",
};

interface GameTableProps {
  gameState: GameState;
}

export function GameTable({ gameState }: GameTableProps) {
  const { roundCards, players, leadSuit, roundNumber, phase } = gameState;

  return (
    <div className="bg-green-800 rounded-2xl p-6 shadow-inner border-4 border-green-900">
      {/* Table header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-green-100 text-sm font-medium">
          {phase === "lobby" ? "Waiting to start..." : `Round ${roundNumber}`}
        </div>

        {leadSuit && (
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
            <span className="text-green-200 text-xs">Lead suit:</span>
            <span className={`text-lg font-bold ${SUIT_COLORS[leadSuit]}`}>
              {SUIT_SYMBOLS[leadSuit]}
            </span>
            <span className="text-white text-xs capitalize">{leadSuit}</span>
          </div>
        )}
      </div>

      {/* Cards on the table */}
      {roundCards.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-green-300 text-sm italic">
          {phase === "lobby"
            ? "Cards will appear here once the game starts"
            : phase === "round_end"
            ? "Preparing next round..."
            : "Waiting for first card..."}
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 justify-center">
          {roundCards.map(({ playerId, card }) => {
            const player = players.find((p) => p.id === playerId);
            const isRoundWinner =
              gameState.roundWinnerId === playerId && phase === "round_end";
            return (
              <div key={`${playerId}-${card.suit}-${card.rank}`} className="flex flex-col items-center gap-1">
                <div
                  className={
                    isRoundWinner
                      ? "ring-4 ring-yellow-400 rounded-lg animate-pulse"
                      : ""
                  }
                >
                  <PlayingCard card={card} size="lg" played />
                </div>
                <span className="text-green-100 text-xs font-medium">
                  {player?.name ?? "?"}
                  {isRoundWinner && " 🏆"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
