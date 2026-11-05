/**
 * useGameSocket — manages the WebSocket connection to the game server.
 *
 * Handles:
 * - Connection lifecycle (open, close, error, reconnect)
 * - Sending typed messages to the server
 * - Dispatching received messages to the game state reducer
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type {
  ClientMessage,
  ServerMessage,
  GameState,
  ChatMessage,
  VoiceEvent,
  SocialState,
} from "@/lib/gameTypes";
import { WS_URL } from "@/lib/apiConfig";
import { readAccountToken, saveAccountToken } from "@/lib/accountToken";

const SESSION_STORAGE_KEY = "card-duel-session";

export interface SavedSession {
  resumeToken?: string;
  gameId: string;
  playerId: string;
}

function buildWsUrl(): string {
  return WS_URL;
}

function readSavedSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (!parsed.gameId || !parsed.playerId) return null;
    return { gameId: parsed.gameId, playerId: parsed.playerId, resumeToken: parsed.resumeToken };
  } catch {
    return null;
  }
}

function saveSession(session: SavedSession): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The live game still works when browser storage is unavailable.
  }
}

function clearSavedSession(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage may be blocked in private or embedded browser sessions.
  }
}

export interface UseGameSocketReturn {
  social: SocialState;
  socialNotice: string;
  authenticate: (token: string) => void;
  forgetAccount: () => void;
  gameState: GameState | null;
  myPlayerId: string | null;
  myGameId: string | null;
  connected: boolean;
  error: string | null;
  chatMessages: ChatMessage[];
  voiceEvents: VoiceEvent[];
  savedSession: SavedSession | null;
  sendMessage: (msg: ClientMessage) => void;
  sendChatMessage: (text: string) => void;
  resumeSavedGame: () => void;
  logoutGame: () => void;
  clearError: () => void;
}

export function useGameSocket(): UseGameSocketReturn {
  const [social, setSocial] = useState<SocialState>({ user: null, friends: [], incoming: [], outgoing: [], invitations: [] });
  const [socialNotice, setSocialNotice] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const activeSessionRef = useRef<SavedSession | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myGameId, setMyGameId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [voiceEvents, setVoiceEvents] = useState<VoiceEvent[]>([]);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(() =>
    readSavedSession(),
  );

  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;

    const connect = () => {
      const url = buildWsUrl();
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        setError("Invalid server address. Check VITE_WS_URL.");
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        retryAttempt = 0;
        setConnected(true);
        setError(null);
        try {
          const token = readAccountToken();
          if (token) ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
        } catch { /* Account storage may be unavailable. */ }
        // Only automatically resume a game joined in this page session.
        const session = activeSessionRef.current;
        if (session)
          ws.send(JSON.stringify({ type: "resume_game", payload: session }));
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (msg.type === "social_state") {
          setSocial(msg.payload);
          if (!msg.payload.user) saveAccountToken(null);
        } else if (msg.type === "social_notice") {
          setSocialNotice(msg.payload.message);
        } else if (msg.type === "removed") {
          activeSessionRef.current = null; clearSavedSession(); setSavedSession(null);
          setGameState(null); setMyPlayerId(null); setMyGameId(null);
          setVoiceEvents([]); setChatMessages([]); setError(msg.payload.message);
        } else if (msg.type === "game_state") {
          setGameState(msg.payload);
        } else if (msg.type === "joined") {
          activeSessionRef.current = msg.payload;
          setMyPlayerId(msg.payload.playerId);
          setMyGameId(msg.payload.gameId);
          saveSession(msg.payload);
          setSavedSession(msg.payload);
        } else if (msg.type === "chat_message") {
          setChatMessages((messages) => [...messages, msg.payload].slice(-80));
        } else if (
          msg.type === "voice_peers" ||
          msg.type === "voice_music" ||
          msg.type === "voice_peer_joined" ||
          msg.type === "voice_peer_left" ||
          msg.type === "voice_signal" ||
          msg.type === "voice_chunk"
        ) {
          setVoiceEvents((events) => [...events, msg].slice(-120));
        } else if (msg.type === "error") {
          if (msg.payload.message.toLowerCase().includes("resume")) {
            activeSessionRef.current = null;
            clearSavedSession();
            setSavedSession(null);
            setGameState(null);
            setMyPlayerId(null);
            setMyGameId(null);
            setChatMessages([]);
            setVoiceEvents([]);
          }
          setError(msg.payload.message);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setSocial(current => ({ ...current, friends: current.friends.map(friend => ({ ...friend, online: false })) }));
        setError("Connection lost. Reconnecting...");
        retryTimer = setTimeout(
          connect,
          Math.min(1000 * 2 ** retryAttempt++, 10000),
        );
      };

      ws.onerror = () => {
        if (disposed) return;
        setError("Cannot connect to the game server. Retrying...");
        setConnected(false);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      setError("Not connected yet. Please wait for the server to reconnect.");
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const authenticate = useCallback((token: string) => {
    saveAccountToken(token);
    sendMessage({ type: "authenticate", payload: { token } });
  }, [sendMessage]);
  const forgetAccount = useCallback(() => {
    saveAccountToken(null);
    sendMessage({ type: "sign_out", payload: {} });
    setSocial({ user: null, friends: [], incoming: [], outgoing: [], invitations: [] });
    setSocialNotice("");
    activeSessionRef.current = null;
    clearSavedSession();
    setSavedSession(null);
    setGameState(null);
    setMyPlayerId(null);
    setMyGameId(null);
    setChatMessages([]);
    setVoiceEvents([]);
    setError(null);
  }, [sendMessage]);
  useEffect(() => {
    if (!social.user || !connected) return;
    const timer = setInterval(() => sendMessage({ type: "social_refresh", payload: {} }), 15000);
    return () => clearInterval(timer);
  }, [social.user?.id, connected, sendMessage]);

  const resumeSavedGame = useCallback(() => {
    const session = readSavedSession();
    if (!session) {
      setSavedSession(null);
      setError("No saved game to resume.");
      return;
    }
    setSavedSession(session);
    sendMessage({ type: "resume_game", payload: session });
  }, [sendMessage]);

  const logoutGame = useCallback(() => {
    activeSessionRef.current = null;
    const gameId = myGameId;
    if (gameId) {
      sendMessage({ type: "voice_leave", payload: { gameId } });
      sendMessage({ type: "leave_game", payload: { gameId } });
    }
    clearSavedSession();
    setSavedSession(null);
    setGameState(null);
    setMyPlayerId(null);
    setMyGameId(null);
    setChatMessages([]);
    setVoiceEvents([]);
    setError(null);
  }, [myGameId, sendMessage]);

  const sendChatMessage = useCallback(
    (text: string) => {
      const cleanText = text.trim();
      if (!myGameId || !cleanText) return;
      sendMessage({
        type: "chat_message",
        payload: { gameId: myGameId, text: cleanText },
      });
    },
    [myGameId, sendMessage],
  );

  return {
    social, socialNotice, authenticate, forgetAccount,
    gameState,
    myPlayerId,
    myGameId,
    connected,
    error,
    chatMessages,
    voiceEvents,
    savedSession,
    sendMessage,
    sendChatMessage,
    resumeSavedGame,
    logoutGame,
    clearError,
  };
}
