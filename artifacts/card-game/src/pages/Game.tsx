/**
 * Game page - the main game view.
 *
 * Orchestrates lobby, active match, and game over states.
 */

import "./MatchTable.css";
import { useEffect, useRef, useState } from "react";
import { LogOut, Volume2, VolumeX, LayoutGrid, Users, Info, MessageCircle, Headphones } from "lucide-react";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useGameAudio } from "@/hooks/useGameAudio";
import { Lobby } from "@/components/Lobby";
import { StartScreen } from "@/components/StartScreen";
import { PlayerArea } from "@/components/PlayerArea";
import { GameTable } from "@/components/GameTable";
import { GameOverScreen } from "@/components/GameOverScreen";
import { DealAnimation } from "@/components/DealAnimation";
import { dealDuration } from "@/lib/dealSequence";
import { ChatPanel } from "@/components/ChatPanel";
import { VoiceChatControls, VoiceMicButton } from "@/components/VoiceChatPanel";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { type Card } from "@/lib/gameTypes";
import "./Landscape.css";
import "./MobileMatch.css";
import { readProfile, type Profile } from "@/lib/profile";
import { ProfileButton, PlayerAvatar } from "@/components/ProfileButton";
import { AccountProvider } from "@/components/AccountHub";
import type { UseGameSocketReturn } from "@/hooks/useGameSocket";
import { LocalGame } from "@/components/LocalGame";

const SUIT_LABELS = {
  spades: "Spades",
  clubs: "Clubs",
  hearts: "Hearts",
  diamonds: "Diamonds",
} as const;

export default function Game() {
  const [local, setLocal] = useState(false);
  return local ? <LocalGame onLeave={() => setLocal(false)} /> : <OnlineGame onLocal={() => setLocal(true)} />;
}

function OnlineGame({ onLocal }: { onLocal: () => void }) {
  const socket = useGameSocket();
  return <AccountProvider socket={socket} onLocal={onLocal}><GameContent socket={socket} onLocal={onLocal} /></AccountProvider>;
}

function GameContent({ socket, onLocal }: { socket: UseGameSocketReturn; onLocal: () => void }) {
  const {
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
  } = socket;
  const { musicOn, playCard, playDeal, playTurn, playResult, stopResult, toggleMusic } = useGameAudio();
  const voiceSession = useVoiceChat({ gameId: myGameId, myPlayerId, hostId: gameState?.hostId, voiceEvents, sendMessage, connected, autoListen: true });
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [matchView, setMatchView] = useState("table");
  const [showDealAnimation, setShowDealAnimation] = useState(false);
  const previousPhaseRef = useRef<string | null>(null);
  const notifiedTurnRef = useRef<string | null>(null);
  const loserName = gameState?.players.find(player => player.id === gameState.gameOverLoserId)?.name;

  useEffect(() => {
    if (gameState?.phase !== "game_over" || !loserName) return;
    // Stable result dependencies prevent room/chat updates from replaying audio.
    const timer = window.setTimeout(() => { void playResult(loserName); }, 150);
    return () => { window.clearTimeout(timer); stopResult(); };
  }, [myGameId, gameState?.phase, gameState?.gameOverLoserId, loserName, playResult, stopResult]);

  useEffect(() => {
    if (!myGameId) notifiedTurnRef.current = null;
    if (!connected || showDealAnimation || gameState?.phase !== "playing" || gameState.currentTurn !== myPlayerId) return;
    const key = `${myGameId}:${gameState.roundNumber}:${gameState.turnDeadlineAt}`;
    if (notifiedTurnRef.current === key) return;
    // Let the deal overlay appear first; notify once when this player's turn is usable.
    const timer = window.setTimeout(() => { notifiedTurnRef.current = key; void playTurn(); }, 150);
    return () => window.clearTimeout(timer);
  }, [connected, showDealAnimation, myGameId, myPlayerId, gameState?.phase, gameState?.currentTurn, gameState?.roundNumber, gameState?.turnDeadlineAt, playTurn]);

  useEffect(() => {
    setMatchView("table");
  }, [myGameId]);

  function handleCreateGame(name: string) {
    sendMessage({ type: "create_game", payload: { playerName: name, avatarUrl: readProfile().avatarUrl } });
  }

  function handleJoinGame(gameId: string, name: string) {
    sendMessage({ type: "join_game", payload: { gameId, playerName: name, avatarUrl: readProfile().avatarUrl } });
  }

  function handleProfileSave(profile: Profile) {
    if (myGameId) sendMessage({ type: "update_profile", payload: { gameId: myGameId, playerName: profile.name, avatarUrl: profile.avatarUrl } });
  }

  function handleStartGame() {
    if (!myGameId) return;
    sendMessage({ type: "start_game", payload: { gameId: myGameId, dealNumber: gameState?.dealNumber ?? 0 } });
  }

  function handlePlayCard(card: Card) {
    if (!myGameId) return;
    void playCard();
    sendMessage({ type: "play_card", payload: { gameId: myGameId, card } });
  }

  function handleRestart() {
    if (!myGameId) return;
    sendMessage({ type: "restart_game", payload: { gameId: myGameId, dealNumber: gameState?.dealNumber ?? 0 } });
  }

  function handleRestartTournament() {
    if (!myGameId) return;
    sendMessage({ type: "restart_tournament", payload: { gameId: myGameId } });
  }

  useEffect(() => {
    if (
      gameState?.phase === "playing" &&
      gameState.roundNumber === 1 &&
      previousPhaseRef.current === "lobby"
    ) {
      setShowDealAnimation(true);
      void playDeal();
    }

    previousPhaseRef.current = gameState?.phase ?? null;
    return undefined;
  }, [gameState?.phase, gameState?.roundNumber, playDeal]);

  useEffect(() => {
    if (!showDealAnimation) return;
    const count = 52 - (gameState?.players.reduce((sum, player) => sum + player.penaltyCards.length, 0) ?? 0);
    const timeout = window.setTimeout(() => setShowDealAnimation(false), dealDuration(count));
    return () => window.clearTimeout(timeout);
  }, [showDealAnimation]);

  const inLobby = !gameState || gameState.phase === "lobby";

  // A resumed room goes straight to its current screen without losing state.
  if (!gameState && showStartScreen) {
    return (
      <StartScreen
        onLocal={onLocal}
        connected={connected}
        musicOn={musicOn}
        savedSession={savedSession}
        error={error}
        onPlay={() => {
          clearError();
          setShowStartScreen(false);
        }}
        onResume={resumeSavedGame}
        onToggleMusic={toggleMusic}
        onClearError={clearError}
      />
    );
  }

  if (inLobby) {
    return (
      <>
        {error && gameState && (
          <div className="fixed left-1/2 top-4 z-50 flex w-[calc(100%-32px)] max-w-lg break-words -translate-x-1/2 items-center gap-3 rounded-full border border-rose-200/20 bg-rose-500 px-4 py-3 text-white shadow-2xl">
            <span className="text-sm font-semibold">{error}</span>
            <button onClick={clearError} className="text-white/70 hover:text-white" type="button">
              ✕
            </button>
          </div>
        )}
        <Lobby
          voiceSession={voiceSession}
          onProfileSave={handleProfileSave}
          gameState={gameState}
          myPlayerId={myPlayerId}
          myGameId={myGameId}
          connected={connected}
          error={error}
          onClearError={clearError}
          chatMessages={chatMessages}
          voiceEvents={voiceEvents}
          savedSession={savedSession}
          musicOn={musicOn}
          onToggleMusic={toggleMusic}
          onSendChatMessage={sendChatMessage}
          sendMessage={sendMessage}
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          onResumeGame={resumeSavedGame}
          onEndGame={logoutGame}
          onStartGame={handleStartGame}
          onBackToStart={() => {
            clearError();
            setShowStartScreen(true);
          }}
        />
        {showDealAnimation && gameState && <DealAnimation players={gameState.players} myPlayerId={myPlayerId} dealerId={gameState.dealerId} />}
      </>
    );
  }

  if (gameState.phase === "game_over") {
    return (
      <>
        {error && (
          <div className="fixed left-1/2 top-4 z-50 flex w-[calc(100%-32px)] max-w-lg break-words -translate-x-1/2 items-center gap-3 rounded-full border border-rose-200/20 bg-rose-500 px-4 py-3 text-white shadow-2xl">
            <span className="text-sm font-semibold">{error}</span>
            <button onClick={clearError} className="text-white/70 hover:text-white" type="button">
              ✕
            </button>
          </div>
        )}
        <GameOverScreen
          gameState={gameState}
          myPlayerId={myPlayerId}
          onNextGame={handleRestart}
          onRestartTournament={handleRestartTournament}
          onLeave={logoutGame}
          audioControls={<VoiceChatControls session={voiceSession} />}
        />
      </>
    );
  }

  const myPlayer = gameState.players.find((player) => player.id === myPlayerId);
  const isMyTurn = gameState.currentTurn === myPlayerId;
  const opponentPlayers = gameState.players.filter((player) => player.id !== myPlayerId);

  return (
    <div className="match-lounge min-h-screen px-3 py-3 text-white sm:px-4" data-view={matchView}>
      {showDealAnimation && <DealAnimation players={gameState.players} myPlayerId={myPlayerId} dealerId={gameState.dealerId} />}

      {error && (
        <div className="fixed left-1/2 top-4 z-50 flex w-[calc(100%-32px)] max-w-lg break-words -translate-x-1/2 items-center gap-3 rounded-full border border-rose-200/20 bg-rose-500 px-4 py-3 text-white shadow-2xl">
          <span className="text-sm font-semibold">{error}</span>
          <button onClick={clearError} className="text-white/70 hover:text-white" type="button">
            ✕
          </button>
        </div>
      )}

      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="match-header flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-white/15 bg-white/10 px-4 py-3 shadow-[0_18px_36px_rgba(0,24,68,0.22)] backdrop-blur-sm">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.35em] text-white/70">Donkey</div>
            <div className="mt-1 text-2xl font-black">Match table</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ProfileButton onSave={handleProfileSave} />
            <nav className="compact-only compact-tabs" aria-label="Match views">{[{id:"table", icon:LayoutGrid}, {id:"players", icon:Users}, {id:"status", icon:Info}, {id:"chat", icon:MessageCircle}, {id:"voice", icon:Headphones}].map(({id, icon:Icon}) => <button type="button" key={id} title={id === "voice" ? "Voice & songs" : id} aria-label={id === "voice" ? "Voice & songs" : id} aria-pressed={matchView === id} onClick={() => setMatchView(id)}><Icon size={18} /></button>)}</nav>
            <VoiceMicButton session={voiceSession} />
            <div className="rounded-full border border-white/15 bg-black/15 px-3 py-1.5 text-xs font-semibold text-white">
              Room: <span className="font-black">{myGameId}</span>
            </div>
            <div
              className={`rounded-full px-3 py-1.5 text-xs font-black ${
                isMyTurn ? "bg-yellow-300 text-slate-950" : "bg-white/15 text-white"
              }`}
            >
              {isMyTurn
                ? "Your turn"
                : `${gameState.players.find((player) => player.id === gameState.currentTurn)?.name ?? "..."}'s turn`}
            </div>
            <button
              type="button"
              onClick={toggleMusic}
              className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-lg"
              aria-label={musicOn ? "Turn music off" : "Turn music on"}
            >
              {musicOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button
              type="button"
              onClick={logoutGame}
              className="flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-xs font-black text-white shadow-lg"
            >
              <LogOut className="size-4" />
              Leave
            </button>
          </div>
        </header>

        <div className="match-layout grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <main className="space-y-4">
            <section className="match-opponents" aria-label="Opponents">
              {opponentPlayers.map((player) => (
                <PlayerArea
                  key={player.id}
                  player={player}
                  isMe={false}
                  isCurrentTurn={gameState.currentTurn === player.id}
                  gameState={gameState}
                />
              ))}
            </section>

            <GameTable gameState={gameState} />

            {myPlayer && (
              <PlayerArea
                player={myPlayer}
                isMe
                isCurrentTurn={isMyTurn}
                gameState={gameState}
                onPlayCard={handlePlayCard}
              />
            )}
          </main>

          <aside className="match-sidebar space-y-4">
            <section className="match-roster" aria-label="Players">
              <h2>Players ({gameState.players.length}/10)</h2>
              {gameState.players.map(player => <div key={player.id} className={player.id === gameState.currentTurn ? "roster-current" : ""}>
                <span className="roster-avatar"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} /></span>
                <div><strong>{player.name}</strong><small>{player.hand.length} playable{player.penaltyCards.length > 0 ? ` · ${player.penaltyCards.length} locked` : ""}</small></div>
                <span className="roster-status">{player.finished ? "Finished" : player.id === myPlayerId ? "You" : player.id === gameState.currentTurn ? "Playing" : "Waiting"}</span>
              </div>)}
            </section>
            <div className="rounded-[1.5rem] border border-white/15 bg-white/10 px-4 py-4 shadow-[0_18px_36px_rgba(0,24,68,0.22)] backdrop-blur-sm">
              <div className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Match status</div>
              <div className="mt-3 space-y-3 text-sm text-white/90">
                <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-white/65">Required suit</div>
                  <div className="mt-1 font-black">
                    {gameState.leadSuit ? SUIT_LABELS[gameState.leadSuit] : "None yet"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-white/65">Current game winner</div>
                  <div className="mt-1 font-black">
                    {gameState.currentGameWinnerId
                      ? gameState.players.find((player) => player.id === gameState.currentGameWinnerId)?.name ?? "Unknown"
                      : "None yet"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-white/65">Final loser</div>
                  <div className="mt-1 font-black">
                    {gameState.gameOverLoserId
                      ? gameState.players.find((player) => player.id === gameState.gameOverLoserId)?.name ?? "Unknown"
                      : "Pending"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-white/65">Finished players</div>
                  <div className="mt-1 font-black">{gameState.finishedPlayerIds.length}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-white/65">Your playable cards</div>
                  <div className="mt-1 font-black">
                    {gameState.players.find(player => player.id === myPlayerId)?.hand.length ?? 0}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/15 bg-white/10 px-4 py-4 shadow-[0_18px_36px_rgba(0,24,68,0.22)] backdrop-blur-sm">
              <div className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Live chat</div>
              <div className="mt-3">
                <ChatPanel messages={chatMessages} myPlayerId={myPlayerId} onSend={sendChatMessage} compact />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/15 bg-white/10 px-4 py-4 shadow-[0_18px_36px_rgba(0,24,68,0.22)] backdrop-blur-sm">
              <div className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Voice &amp; songs</div>
              <div className="mt-3">
                <VoiceChatControls session={voiceSession} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
