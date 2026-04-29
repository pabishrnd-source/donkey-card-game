/**
 * Game page — the main game view.
 *
 * Orchestrates:
 * - Lobby (create/join game)
 * - Game table (round cards, lead suit)
 * - Player areas (hands, turns)
 * - Game over screen (loser, penalty)
 * - Status message bar
 * - Error toasts
 */

import { useGameSocket } from "@/hooks/useGameSocket";
import { Lobby } from "@/components/Lobby";
import { PlayerArea } from "@/components/PlayerArea";
import { GameTable } from "@/components/GameTable";
import { GameOverScreen } from "@/components/GameOverScreen";
import type { Card } from "@/lib/gameTypes";

export default function Game() {
  const {
    gameState,
    myPlayerId,
    myGameId,
    connected,
    error,
    sendMessage,
    clearError,
  } = useGameSocket();

  // --- Handlers ---

  function handleCreateGame(name: string) {
    sendMessage({ type: "create_game", payload: { playerName: name } });
  }

  function handleJoinGame(gameId: string, name: string) {
    sendMessage({ type: "join_game", payload: { gameId, playerName: name } });
  }

  function handleStartGame() {
    if (!myGameId) return;
    sendMessage({ type: "start_game", payload: { gameId: myGameId } });
  }

  function handlePlayCard(card: Card) {
    if (!myGameId) return;
    sendMessage({ type: "play_card", payload: { gameId: myGameId, card } });
  }

  function handleRestart() {
    if (!myGameId) return;
    sendMessage({ type: "restart_game", payload: { gameId: myGameId } });
  }

  // --- Render ---

  // Show lobby screen when not yet in a game or game is in lobby phase
  const inLobby =
    !gameState ||
    gameState.phase === "lobby";

  if (inLobby) {
    return (
      <>
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <span>{error}</span>
            <button onClick={clearError} className="ml-2 text-white/70 hover:text-white">✕</button>
          </div>
        )}
        <Lobby
          gameState={gameState}
          myPlayerId={myPlayerId}
          myGameId={myGameId}
          connected={connected}
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          onStartGame={handleStartGame}
        />
      </>
    );
  }

  // Game over screen
  if (gameState.phase === "game_over") {
    return (
      <>
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <span>{error}</span>
            <button onClick={clearError} className="ml-2 text-white/70 hover:text-white">✕</button>
          </div>
        )}
        <GameOverScreen
          gameState={gameState}
          myPlayerId={myPlayerId}
          onRestart={handleRestart}
        />
      </>
    );
  }

  // Active game view
  const myPlayer = gameState.players.find((p) => p.id === myPlayerId);
  const isMyTurn = gameState.currentTurn === myPlayerId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 p-4">
      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3">
          <span>{error}</span>
          <button onClick={clearError} className="ml-2 text-white/70 hover:text-white font-bold">✕</button>
        </div>
      )}

      {/* Top bar */}
      <div className="max-w-5xl mx-auto mb-4 flex items-center justify-between">
        <div>
          <span className="text-green-200 text-sm font-semibold">Card Game</span>
          <span className="text-green-400 text-xs ml-2">Room: {myGameId}</span>
        </div>

        {/* Turn indicator */}
        <div
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
            isMyTurn
              ? "bg-yellow-400 text-yellow-900 animate-pulse"
              : "bg-white/10 text-white/70"
          }`}
        >
          {isMyTurn
            ? "Your turn!"
            : `${
                gameState.players.find((p) => p.id === gameState.currentTurn)
                  ?.name ?? "..."
              }'s turn`}
        </div>
      </div>

      <div className="max-w-5xl mx-auto space-y-4">
        {/* Status message */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center">
          <p className="text-white text-sm">{gameState.message}</p>
        </div>

        {/* Opponent players (everyone except me) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {gameState.players
            .filter((p) => p.id !== myPlayerId)
            .map((player) => (
              <PlayerArea
                key={player.id}
                player={player}
                isMe={false}
                isCurrentTurn={gameState.currentTurn === player.id}
                gameState={gameState}
              />
            ))}
        </div>

        {/* Game table — center cards */}
        <GameTable gameState={gameState} />

        {/* My player area */}
        {myPlayer && (
          <PlayerArea
            player={myPlayer}
            isMe
            isCurrentTurn={isMyTurn}
            gameState={gameState}
            onPlayCard={handlePlayCard}
          />
        )}
      </div>
    </div>
  );
}
