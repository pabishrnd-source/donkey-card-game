/**
 * Lobby component
 *
 * Shown before the game starts. Allows players to:
 * - Create a new game (host)
 * - Join an existing game by entering a room code
 * The host can then start the game when at least 2 players have joined.
 */

import { useState } from "react";
import { type GameState } from "@/lib/gameTypes";

interface LobbyProps {
  gameState: GameState | null;
  myPlayerId: string | null;
  myGameId: string | null;
  connected: boolean;
  onCreateGame: (name: string) => void;
  onJoinGame: (gameId: string, name: string) => void;
  onStartGame: () => void;
}

export function Lobby({
  gameState,
  myPlayerId,
  myGameId,
  connected,
  onCreateGame,
  onJoinGame,
  onStartGame,
}: LobbyProps) {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");

  const isHost = gameState?.hostId === myPlayerId;

  // If already in a lobby, show the waiting room
  if (gameState && myGameId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Waiting Room</h1>
          <p className="text-gray-500 text-sm mb-6">Share this code with other players:</p>

          {/* Room code display */}
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6 text-center">
            <p className="text-xs text-green-600 font-medium uppercase tracking-widest mb-1">Room Code</p>
            <p className="text-4xl font-mono font-bold text-green-800 tracking-widest">
              {myGameId}
            </p>
          </div>

          {/* Players in lobby */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-2">
              Players ({gameState.players.length}/6):
            </p>
            <ul className="space-y-2">
              {gameState.players.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      p.id === gameState.hostId ? "bg-amber-400" : "bg-green-400"
                    }`}
                  />
                  <span className="text-gray-800 font-medium">{p.name}</span>
                  {p.id === gameState.hostId && (
                    <span className="text-xs text-amber-600 font-semibold ml-auto">HOST</span>
                  )}
                  {p.id === myPlayerId && p.id !== gameState.hostId && (
                    <span className="text-xs text-blue-500 font-semibold ml-auto">YOU</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Start button (host only) */}
          {isHost ? (
            gameState.players.length >= 2 ? (
              <button
                onClick={onStartGame}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Start Game ({gameState.players.length} players)
              </button>
            ) : (
              <p className="text-center text-gray-500 text-sm italic">
                Waiting for at least 1 more player...
              </p>
            )
          ) : (
            <p className="text-center text-gray-500 text-sm italic animate-pulse">
              Waiting for host to start...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Initial screen — choose create or join
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold text-gray-900">Card Game</h1>
          <p className="text-gray-500 text-sm mt-1">2–6 players · Trick-taking</p>
        </div>

        {/* Connection status */}
        <div className={`flex items-center gap-2 text-xs mb-6 ${connected ? "text-green-600" : "text-red-500"}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          {connected ? "Connected to server" : "Connecting..."}
        </div>

        {mode === "choose" && (
          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              disabled={!connected}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Create New Game
            </button>
            <button
              onClick={() => setMode("join")}
              disabled={!connected}
              className="w-full border-2 border-green-600 text-green-700 hover:bg-green-50 disabled:opacity-50 font-bold py-3 rounded-xl transition-colors"
            >
              Join Existing Game
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-4">
            <button
              onClick={() => setMode("choose")}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              ← Back
            </button>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:border-green-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && playerName.trim()) {
                    onCreateGame(playerName.trim());
                  }
                }}
              />
            </div>
            <button
              onClick={() => playerName.trim() && onCreateGame(playerName.trim())}
              disabled={!playerName.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Create Game
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-4">
            <button
              onClick={() => setMode("choose")}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              ← Back
            </button>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Room Code</label>
              <input
                type="text"
                placeholder="e.g. AB12CD"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 font-mono uppercase tracking-widest focus:outline-none focus:border-green-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && playerName.trim() && joinCode.trim()) {
                    onJoinGame(joinCode.trim(), playerName.trim());
                  }
                }}
              />
            </div>
            <button
              onClick={() => {
                if (playerName.trim() && joinCode.trim()) {
                  onJoinGame(joinCode.trim(), playerName.trim());
                }
              }}
              disabled={!playerName.trim() || !joinCode.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Join Game
            </button>
          </div>
        )}

        {/* Rules summary */}
        <div className="mt-8 border-t pt-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">How to Play</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• First round starts with the Ace of Spades</li>
            <li>• Follow the lead suit if you can</li>
            <li>• Highest card of the lead suit wins the round</li>
            <li>• Player with most tricks at the end loses</li>
            <li>• Loser receives the Ace of Spades as a penalty</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
