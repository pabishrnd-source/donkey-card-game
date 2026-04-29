/**
 * useGameSocket — manages the WebSocket connection to the game server.
 *
 * Handles:
 * - Connection lifecycle (open, close, error, reconnect)
 * - Sending typed messages to the server
 * - Dispatching received messages to the game state reducer
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { ClientMessage, ServerMessage, GameState } from "@/lib/gameTypes";

// Build the WebSocket URL from the current location.
// In development on Replit: wss://<domain>/ws
function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
}

export interface UseGameSocketReturn {
  gameState: GameState | null;
  myPlayerId: string | null;
  myGameId: string | null;
  connected: boolean;
  error: string | null;
  sendMessage: (msg: ClientMessage) => void;
  clearError: () => void;
}

export function useGameSocket(): UseGameSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myGameId, setMyGameId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = buildWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (msg.type === "game_state") {
        setGameState(msg.payload);
      } else if (msg.type === "joined") {
        setMyPlayerId(msg.payload.playerId);
        setMyGameId(msg.payload.gameId);
      } else if (msg.type === "error") {
        setError(msg.payload.message);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setError("Connection error. Please refresh the page.");
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    gameState,
    myPlayerId,
    myGameId,
    connected,
    error,
    sendMessage,
    clearError,
  };
}
