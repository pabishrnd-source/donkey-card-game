/**
 * GameOverScreen component
 *
 * Shown when all cards have been played.
 * Displays:
 * - The loser (player who won the most tricks)
 * - The penalty card (Ace of Spades) assigned to the loser
 * - Final trick counts for all players
 * - A "Restart Game" button (host only) or waiting message (others)
 */

import { type GameState } from "@/lib/gameTypes";
import { PlayingCard } from "./PlayingCard";

interface GameOverScreenProps {
  gameState: GameState;
  myPlayerId: string | null;
  onRestart: () => void;
}

export function GameOverScreen({
  gameState,
  myPlayerId,
  onRestart,
}: GameOverScreenProps) {
  const loser = gameState.players.find((p) => p.id === gameState.gameOverLoserId);
  const isHost = myPlayerId === gameState.hostId;
  const isLoser = myPlayerId === gameState.gameOverLoserId;

  // Sort players by tricks won descending for the scoreboard
  const sortedPlayers = [...gameState.players].sort(
    (a, b) => b.tricksWon - a.tricksWon
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🎴</div>
          <h1 className="text-3xl font-bold text-gray-900">Game Over</h1>
        </div>

        {/* Loser announcement */}
        {loser && (
          <div
            className={`rounded-xl p-4 mb-6 text-center ${
              isLoser
                ? "bg-red-50 border-2 border-red-200"
                : "bg-amber-50 border-2 border-amber-200"
            }`}
          >
            <p className="text-sm text-gray-500 mb-1">
              {isLoser ? "You lose! Better luck next time 😅" : "The loser is..."}
            </p>
            <p className="text-2xl font-bold text-red-600">{loser.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              won {loser.tricksWon} trick{loser.tricksWon !== 1 ? "s" : ""} — the most of all players
            </p>

            {/* Penalty card */}
            {gameState.penaltyCard && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Penalty Card
                </p>
                <PlayingCard card={gameState.penaltyCard} size="lg" played />
                <p className="text-xs text-gray-500">Ace of Spades goes to {loser.name}</p>
              </div>
            )}
          </div>
        )}

        {/* Scoreboard */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 uppercase tracking-widest mb-3">
            Final Scores
          </p>
          <div className="space-y-2">
            {sortedPlayers.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  p.id === gameState.gameOverLoserId
                    ? "bg-red-50 border border-red-200"
                    : "bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm font-mono w-5">{i + 1}.</span>
                  <span className="font-medium text-gray-800">{p.name}</span>
                  {p.id === myPlayerId && (
                    <span className="text-xs text-blue-500">(you)</span>
                  )}
                  {p.id === gameState.gameOverLoserId && (
                    <span className="text-xs text-red-500 font-semibold">LOSER</span>
                  )}
                </div>
                <span className="font-bold text-gray-700">
                  {p.tricksWon} trick{p.tricksWon !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Restart */}
        {isHost ? (
          <button
            onClick={onRestart}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Restart Game
          </button>
        ) : (
          <p className="text-center text-gray-500 text-sm italic animate-pulse">
            Waiting for host to restart...
          </p>
        )}
      </div>
    </div>
  );
}
