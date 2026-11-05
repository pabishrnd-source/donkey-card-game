import { useState } from "react";
import { Copy, Check, Crown, LogOut, Play, Plus, Trophy, Users, Volume2, VolumeX, MessageCircle, Settings, LayoutGrid } from "lucide-react";
import { type ChatMessage, type GameState, type ClientMessage, type VoiceEvent } from "@/lib/gameTypes";
import { type SavedSession } from "@/hooks/useGameSocket";
import { GameDashboard } from "./GameDashboard";
import { ChatPanel } from "./ChatPanel";
import { VoiceChatControls } from "./VoiceChatPanel";
import type { useVoiceChat } from "@/hooks/useVoiceChat";
import "./WaitingRoom.css";
import "./TableLobby.css";
import { ProfileButton, PlayerAvatar } from "./ProfileButton";
import type { Profile } from "@/lib/profile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export interface LobbyProps {
  voiceSession: ReturnType<typeof useVoiceChat>;
  onProfileSave: (profile: Profile) => void;
  gameState: GameState | null;
  myPlayerId: string | null;
  myGameId: string | null;
  connected: boolean;
  error: string | null;
  onClearError: () => void;
  chatMessages: ChatMessage[];
  voiceEvents: VoiceEvent[];
  savedSession: SavedSession | null;
  musicOn: boolean;
  onToggleMusic: () => void;
  onSendChatMessage: (text: string) => void;
  sendMessage: (message: ClientMessage) => void;
  onCreateGame: (name: string) => void;
  onJoinGame: (gameId: string, name: string) => void;
  onResumeGame: () => void;
  onEndGame: () => void;
  onStartGame: () => void;
  onBackToStart: () => void;
}

const suitMarks = { spades: "♠", clubs: "♣", hearts: "♥", diamonds: "♦" };

export function Lobby(props: LobbyProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const [view, setView] = useState("seats");
  const [dealerPickerOpen, setDealerPickerOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState("");
  const { gameState, myGameId, myPlayerId, connected, musicOn,
    onToggleMusic, onEndGame, onStartGame, chatMessages, voiceEvents,
    onSendChatMessage, sendMessage } = props;

  if (!gameState || !myGameId) return <GameDashboard {...props} />;
  const isHost = gameState.hostId === myPlayerId;
  const canSelectDealer = isHost && connected && gameState.phase === "lobby";
  const canStart = canSelectDealer && gameState.players.length >= 2 &&
    gameState.players.some(player => player.id === selectedDealer);
  function chooseDealer(playerId: string) {
    if (!canSelectDealer) return;
    sendMessage({ type: "select_dealer", payload: { gameId: myGameId!, playerId } });
  }
  const penalty = gameState.nextPenaltyCard;
  // Four seats are a visual preview, not a player limit. Expand with room membership.
  const emptySeats = Math.max(0, 4 - gameState.players.length);
  const seatCount = gameState.players.length + emptySeats;
  function seatPosition(index: number) {
    if (seatCount >= 5) {
      const bottomCount = Math.ceil(seatCount / 2);
      const bottom = index < bottomCount;
      const count = bottom ? bottomCount : seatCount - bottomCount;
      const column = bottom ? index : index - bottomCount;
      return { left: `${10 + column * 80 / (count - 1)}%`, top: bottom ? "84%" : "16%" };
    }
    const angle = Math.PI / 2 + index * Math.PI * 2 / seatCount;
    return { left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 34 * Math.sin(angle)}%` };
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(myGameId!);
      setCopyStatus("Room code copied");
    } catch {
      setCopyStatus("Select the code to copy it");
    }
  }

  return (
    <div className="room-lounge table-lobby" data-view={view}>
      <header className="rl-header">
        <div className="rl-heading"><Users aria-hidden="true" /><div><span>DONKEY</span><h1>Waiting Room</h1></div></div>
        <div className="rl-actions">
          <ProfileButton onSave={props.onProfileSave} />
          <nav className="rl-view-tabs" aria-label="Room views">{[{id: "seats", label: "Table", icon: LayoutGrid}, {id: "details", label: "Players and details", icon: Users}, {id: "chat", label: "Chat and voice", icon: MessageCircle}].map(({id, label, icon: Icon}) => <button type="button" key={id} title={label} aria-label={label} aria-pressed={view === id} onClick={() => setView(id)}><Icon size={20} /></button>)}</nav>
          <button className="rl-icon" type="button" onClick={onToggleMusic} aria-label={musicOn ? "Turn music off" : "Turn music on"} title={musicOn ? "Turn music off" : "Turn music on"}>{musicOn ? <Volume2 /> : <VolumeX />}</button>
          <button className="rl-leave" type="button" onClick={onEndGame} aria-label="Leave room" title="Leave room"><LogOut /><span>Leave Room</span></button>
        </div>
      </header>
      <main className="rl-main">
        <section className="rl-invite" aria-label="Room invitation">
          <div className="rl-code-block"><span className="rl-label">Room code</span><div className="rl-code-line"><strong>{myGameId}</strong><button type="button" className="rl-icon" onClick={copyCode} aria-label="Copy room code" title="Copy room code">{copyStatus === "Room code copied" ? <Check /> : <Copy />}</button></div><span className="rl-copy-status" role="status">{copyStatus}</span></div>
          <div className="rl-connection"><i className={connected ? "online" : ""} />{connected ? `${gameState.players.length} player${gameState.players.length === 1 ? "" : "s"} connected` : "Reconnecting..."}</div>
          <label className="rl-dealer">Round {gameState.dealNumber + 1} · Dealer
            <select aria-label="Dealer" value={gameState.dealerId ?? ""} disabled={!canSelectDealer}
              onChange={event => chooseDealer(event.target.value)}>
              <option value="" disabled>Select dealer</option>
              {gameState.players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
            </select>
          </label>
        </section>

        <section className="rl-table" aria-label="Player seats">
          <div className="rl-seats">
            <div className="rl-center-deck" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}donkey-golden-intro.png`} alt="" /></div>
            {gameState.players.map((player, index) => (
              <div key={player.id} style={seatPosition(index)} className={`rl-seat rl-color-${index % 4} ${player.id === myPlayerId ? "rl-you" : ""}`}>
                <div className="rl-avatar">{player.id === gameState.hostId && <Crown className="rl-crown" aria-label="Host" />}<PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} /></div>
                <strong>{player.id === myPlayerId ? "YOU" : player.id === gameState.hostId ? "HOST" : "PLAYER"}</strong>
                <span className="rl-player-name" title={player.name}>{player.name}</span>
                {player.penaltyCards.length > 0 && <small>{player.penaltyCards.length} locked</small>}
              </div>
            ))}
            {Array.from({ length: emptySeats }, (_, index) => <button type="button" key={`empty-${index}`} style={seatPosition(gameState.players.length + index)} className="rl-seat rl-empty" onClick={copyCode} aria-label="Copy room code to invite a player" title="Copy room code to invite a player"><div className="rl-avatar"><Plus /></div><span>Invite</span></button>)}
          </div>
          <div className="rl-start-row"><p><Trophy /><span>First finisher wins. Last remaining player loses.</span></p>
            {isHost ? <button className="rl-start" type="button" disabled={!canSelectDealer}
              aria-haspopup="dialog"
              onClick={() => { setSelectedDealer(gameState.dealerId ?? ""); setDealerPickerOpen(true); }}>
              <Users />{!connected ? "Reconnecting..." : "Select dealer"}
            </button> : <span className="rl-waiting">Waiting for the host to start.</span>}
          </div>
        </section>

        <div className="rl-details">
          <section aria-labelledby="rl-players-title"><h2 id="rl-players-title"><Users />Players <span>({gameState.players.length}/10)</span></h2>
            <ul className="rl-roster">{gameState.players.map(player => <li key={player.id}><div className="rl-small-avatar"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} /></div><div className="rl-roster-name"><strong>{player.name}</strong><span>{player.id === gameState.hostId ? <><Crown /> Host</> : "Player"}</span></div><span className="rl-count">{player.id === myPlayerId && `${player.hand.length} playable`}{player.penaltyCards.length > 0 && <small>{player.penaltyCards.length} locked</small>}</span></li>)}</ul>
          </section>
          <section aria-labelledby="rl-state-title"><h2 id="rl-state-title"><Settings />Game State</h2><dl className="rl-state"><div><dt>Next penalty</dt><dd>{penalty ? <><span className={penalty.suit === "hearts" || penalty.suit === "diamonds" ? "rl-red" : ""} aria-label={penalty.suit}>{suitMarks[penalty.suit]}</span> {penalty.rank} of {penalty.suit[0].toUpperCase() + penalty.suit.slice(1)}</> : "No penalty queued"}</dd></div><div><dt>Lobby message</dt><dd className="rl-message" role="status">{gameState.message}</dd></div></dl></section>
        </div>
        <section className="rl-chat" aria-label="Lobby chat"><div className="rl-chat-heading"><h2><MessageCircle />Chat <span>(Lobby)</span></h2><VoiceChatControls session={props.voiceSession} /></div><ChatPanel messages={chatMessages} myPlayerId={myPlayerId} onSend={onSendChatMessage} compact /></section>
      </main>
      <Dialog open={dealerPickerOpen && canSelectDealer} onOpenChange={setDealerPickerOpen}>
        <DialogContent className="rl-dealer-dialog">
          <DialogHeader><DialogTitle>Select dealer - Round {gameState.dealNumber + 1}</DialogTitle><DialogDescription className="sr-only">Confirm or change the dealer before starting this game.</DialogDescription></DialogHeader>
          <div className="rl-dealer-options" role="radiogroup" aria-label="Dealer">
            {gameState.players.map(player => <label key={player.id} className="rl-dealer-option">
              <input type="radio" name="dealer" value={player.id} checked={selectedDealer === player.id} onChange={() => setSelectedDealer(player.id)} />
              <span className="rl-small-avatar"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} /></span>
              <span>{player.name}{player.id === myPlayerId ? " (you)" : ""}</span>
            </label>)}
          </div>
          <button className="rl-start" type="button" disabled={!canStart} onClick={() => {
            if (!canStart) return;
            chooseDealer(selectedDealer);
            setDealerPickerOpen(false);
            onStartGame();
          }}><Play />{gameState.players.length < 2 ? "Waiting for one more player..." : "Confirm & Start"}</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
