import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CircleUserRound,
  Club,
  Crown,
  Diamond,
  Heart,
  Home,
  LoaderCircle,
  LogIn,
  Plus,
  RotateCcw,
  Settings,
  Spade,
  Users,
  Volume2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { SavedSession } from "@/hooks/useGameSocket";
import "./GameDashboard.css";
import "./VillageLobby.css";
import { ProfileButton, PlayerAvatar } from "./ProfileButton";
import { saveProfile, useProfile } from "@/lib/profile";

interface GameDashboardProps {
  connected: boolean;
  musicOn: boolean;
  savedSession: SavedSession | null;
  error: string | null;
  onClearError: () => void;
  onToggleMusic: () => void;
  onCreateGame: (name: string) => void;
  onJoinGame: (gameId: string, name: string) => void;
  onResumeGame: () => void;
  onBackToStart: () => void;
}

type Panel = "create" | "join" | "settings" | "rules";
const PROFILE_KEY = "donkey-player-name";

function readPlayerName(): string {
  try {
    return localStorage.getItem(PROFILE_KEY)?.slice(0, 20) ?? "";
  } catch {
    return "";
  }
}

function rememberPlayerName(name: string) {
  try {
    localStorage.setItem(PROFILE_KEY, name);
  } catch {
    /* A blocked storage permission must not stop room creation. */
  }
}

const seatStyles = [
  { suit: Spade, tone: "green", label: "Your seat", detail: "Ready to play" },
  { suit: Heart, tone: "blue", label: "Friend", detail: "Invite to your room" },
  { suit: Diamond, tone: "violet", label: "Opponent", detail: "Room seat" },
  { suit: Club, tone: "amber", label: "Opponent", detail: "Room seat" },
] as const;

export function GameDashboard({
  connected,
  musicOn,
  savedSession,
  error,
  onClearError,
  onToggleMusic,
  onCreateGame,
  onJoinGame,
  onResumeGame,
  onBackToStart,
}: GameDashboardProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [lastPanel, setLastPanel] = useState<Panel>("create");
  const [profileName, setProfileName] = useState(readPlayerName);
  const profile = useProfile();
  useEffect(() => { setProfileName(profile.name); setName(profile.name); }, [profile.name]);
  const [name, setName] = useState(profileName);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const activePanel = panel ?? lastPanel;
  const isRoomForm = activePanel === "create" || activePanel === "join";

  useEffect(() => {
    if (error || !connected) setPending(false);
  }, [error, connected]);

  useEffect(() => {
    if (!pending) return;
    // Successful joins unmount this dashboard; keep failed requests retryable.
    const timer = window.setTimeout(() => {
      setPending(false);
      setFormError(
        "No response yet. Please check your connection and try again.",
      );
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  function openPanel(next: Panel, event: MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget;
    setLastPanel(next);
    setPanel(next);
    setName(profileName);
    setFormError(null);
    onClearError();
  }

  function closePanel() {
    setPanel(null);
    setPending(false);
    setFormError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError("Enter your player name.");
      return;
    }
    if (isRoomForm && !connected) {
      setFormError("Waiting for the server to reconnect.");
      return;
    }
    if (activePanel === "join" && !/^[A-Z0-9]{6}$/.test(code)) {
      setFormError("Enter the 6-character room code.");
      return;
    }
    if (activePanel === "settings") {
      try {
        saveProfile({ ...profile, name: cleanName });
      } catch {
        setFormError("Your profile could not be saved. Please check device storage and try again.");
        return;
      }
    }
    setProfileName(cleanName);
    rememberPlayerName(cleanName);
    setFormError(null);
    onClearError();
    if (activePanel === "settings") {
      setPanel(null);
      return;
    }
    setPending(true);
    if (activePanel === "create") onCreateGame(cleanName);
    else onJoinGame(code, cleanName);
  }

  const menuItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "create", label: "Create Room", icon: Plus },
    { id: "join", label: "Join Room", icon: LogIn },
    { id: "rules", label: "How to Play", icon: BookOpen },
    { id: "settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <div className="donkey-dashboard">
      <header className="dd-header">
        <button
          type="button"
          className="dd-brand"
          onClick={onBackToStart}
          aria-label="Donkey starting screen"
          title="Back to starting screen"
        >
          <Crown aria-hidden="true" />
          <span>Donkey</span>
        </button>
        <span className="dd-header-caption">Village square</span>
        <ProfileButton />
      </header>

      <div className="dd-layout">
        <nav className="dd-navigation" aria-label="Game navigation">
          {menuItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`${id === (panel ?? "home") ? "is-selected" : ""} ${id === "settings" ? "dd-nav-settings" : ""}`}
              aria-current={id === "home" && !panel ? "page" : undefined}
              onClick={(event) => {
                if (id === "home") setPanel(null);
                else openPanel(id, event);
              }}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <button type="button" className="dd-nav-back" onClick={onBackToStart}>
            <ArrowLeft aria-hidden="true" />
            <span>Starting screen</span>
          </button>
        </nav>

        <main className="dd-main">
          <section className="dd-hero" aria-labelledby="dd-title">
            <picture className="dd-hero-art">
              <img
                src={`${import.meta.env.BASE_URL}donkey-tropical-results.png`}
                alt=""
                aria-hidden="true"
                fetchPriority="high"
              />
            </picture>
            <div className="dd-hero-copy">
              <h1 id="dd-title">Donkey</h1>
              <p>Village table</p>
              <span className="dd-hero-meta">
                <Users size={15} aria-hidden="true" />
                2–10 players
              </span>
            </div>
          </section>

          {error && !panel && (
            <div className="dd-alert" role="alert">
              <span>{error}</span>
              <button
                type="button"
                onClick={onClearError}
                aria-label="Dismiss message"
              >
                <X size={18} />
              </button>
            </div>
          )}

          <div className="dd-content dd-village-lobby">
            <section className="dd-room-actions" aria-label="Play Donkey">
              <button
                type="button"
                className="dd-action dd-action-create"
                onClick={(event) => openPanel("create", event)}
              >
                <span className="dd-action-icon">
                  <Plus aria-hidden="true" />
                </span>
                <span>
                  <strong>Create Room</strong>
                  <small>Bring your friends</small>
                </span>
                <ChevronRight className="dd-action-arrow" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="dd-action dd-action-join"
                onClick={(event) => openPanel("join", event)}
              >
                <span className="dd-action-icon">
                  <LogIn aria-hidden="true" />
                </span>
                <span>
                  <strong>Join Room</strong>
                  <small>Got a room code?</small>
                </span>
                <ChevronRight className="dd-action-arrow" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="dd-action dd-action-resume"
                onClick={onResumeGame}
                disabled={!connected || !savedSession}
              >
                <span className="dd-action-icon">
                  <RotateCcw aria-hidden="true" />
                </span>
                <span>
                  <strong>Resume</strong>
                  <small>{savedSession ? `Room ${savedSession.gameId}` : "No saved game"}</small>
                </span>
                <ChevronRight className="dd-action-arrow" aria-hidden="true" />
              </button>
            </section>

            <section
              className="dd-seats-section"
              aria-labelledby="dd-seats-title"
            >
              <div className="dd-section-label">
                <h2 id="dd-seats-title">Your next table</h2>
                <span>2–10 players</span>
              </div>
              <div className="dd-seats">
                {seatStyles.map(
                  ({ suit: Suit, tone, label, detail }, index) => (
                    <button
                      type="button"
                      className={`dd-seat dd-seat-${tone}`}
                      key={tone}
                      onClick={(event) =>
                        openPanel(index === 0 ? "settings" : "create", event)
                      }
                      aria-label={
                        index === 0
                          ? "Edit your player profile"
                          : `Create a room to invite ${index === 1 ? "a friend" : "an opponent"}`
                      }
                    >
                      <Suit
                        className="dd-seat-suit"
                        fill="currentColor"
                        aria-hidden="true"
                      />
                      <span className="dd-seat-avatar">
                        {index === 0 ? (
                          profile.avatarUrl ? <PlayerAvatar {...profile} /> : <CircleUserRound aria-hidden="true" />
                        ) : (
                          <Plus aria-hidden="true" />
                        )}
                        {index === 0 && (
                          <Crown className="dd-seat-crown" aria-hidden="true" />
                        )}
                      </span>
                      <strong>
                        {index === 0 && profileName ? profileName : label}
                      </strong>
                      <small>{detail}</small>
                    </button>
                  ),
                )}
              </div>
            </section>

            <button
              type="button"
              className="dd-rules-link"
              onClick={(event) => openPanel("rules", event)}
            >
              <span className="dd-rules-icon">
                <BookOpen aria-hidden="true" />
              </span>
              <span>
                <strong>How to play</strong>
                <small>First out wins. Last player takes a penalty.</small>
              </span>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            <footer className="dd-footer">
              <span>
                <i className={connected ? "online" : ""} />
                {connected ? "Connected to server" : "Reconnecting to server"}
              </span>
              <span>52 cards. One last player.</span>
            </footer>
          </div>
        </main>
      </div>

      {panel === "create" && (
        <div className="dd-create-overlay" role="dialog" aria-modal="true" aria-labelledby="dd-create-title">
          <div className="dd-create-art-dialog">
            <img
              src={`${import.meta.env.BASE_URL}fantasy-wooden-create-room-ui.png?v=20261031`}
              alt=""
              aria-hidden="true"
            />
            <h2 id="dd-create-title" className="sr-only">Create a room</h2>
            <button type="button" className="dd-create-close" onClick={closePanel} aria-label="Close Create Room">
              <X aria-hidden="true" />
            </button>
            <form className="dd-create-form" onSubmit={submit}>
              <label htmlFor="dd-create-player-name" className="sr-only">Player name</label>
              <input
                id="dd-create-player-name"
                autoComplete="nickname"
                placeholder="Enter your name"
                maxLength={20}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                required
              />
              {(formError || error || !connected) && (
                <p className="dd-create-error" role="alert">{formError || error || "Waiting for the server to reconnect."}</p>
              )}
              <button type="submit" className="dd-create-submit" disabled={pending || !connected}>
                {pending ? "Connecting..." : "Create Room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {panel === "rules" && (
        <div className="dd-rules-art-overlay" role="dialog" aria-modal="true" aria-labelledby="dd-rules-art-title">
          <div className="dd-rules-art-dialog">
            <img
              src={`${import.meta.env.BASE_URL}rustic-how-to-play-board.png?v=20261102`}
              alt="How to play Donkey card game"
            />
            <h2 id="dd-rules-art-title" className="sr-only">How to play</h2>
            <button type="button" className="dd-rules-art-close" onClick={closePanel} aria-label="Close How to Play">
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {panel === "join" && (
        <div className="dd-join-art-overlay" role="dialog" aria-modal="true" aria-labelledby="dd-join-art-title">
          <div className="dd-join-art-dialog">
            <img
              src={`${import.meta.env.BASE_URL}rustic-join-room-game-panel.png?v=20261102`}
              alt="Join a Donkey game room"
            />
            <h2 id="dd-join-art-title" className="sr-only">Join a room</h2>
            <button type="button" className="dd-join-art-close" onClick={closePanel} aria-label="Close Join Room">
              <X aria-hidden="true" />
            </button>
            <form className="dd-join-art-form" onSubmit={submit}>
              <label htmlFor="dd-join-art-player-name" className="sr-only">Player name</label>
              <input
                id="dd-join-art-player-name"
                autoComplete="nickname"
                placeholder="Enter your name"
                maxLength={20}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                required
              />
              <label htmlFor="dd-join-art-room-code" className="sr-only">Room code</label>
              <input
                id="dd-join-art-room-code"
                className="dd-join-art-code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="A1B2C3"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                disabled={pending}
                required
              />
              {(formError || error || !connected) && (
                <p className="dd-join-art-error" role="alert">{formError || error || "Waiting for the server to reconnect."}</p>
              )}
              <button type="submit" className="dd-join-art-submit" disabled={pending || !connected}>
                {pending ? "Connecting..." : "Join Room"}
              </button>
            </form>
          </div>
        </div>
      )}

      <Dialog
        open={panel !== null && panel !== "create" && panel !== "rules" && panel !== "join"}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
      >
        <DialogContent
          className={`dd-dialog ${activePanel === "create" ? "dd-create-dialog" : ""}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            openerRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          {activePanel === "create" && (
            <img
              className="dd-create-art"
              src={`${import.meta.env.BASE_URL}fantasy-wooden-create-room-ui.png?v=20261031`}
              alt=""
              aria-hidden="true"
            />
          )}
          <DialogHeader>
            <span className="dd-dialog-symbol" aria-hidden="true">
              {activePanel === "create" ? (
                <Crown />
              ) : activePanel === "join" ? (
                <LogIn />
              ) : activePanel === "settings" ? (
                <Settings />
              ) : (
                <BookOpen />
              )}
            </span>
            <DialogTitle>
              {activePanel === "create"
                ? "Create a room"
                : activePanel === "join"
                  ? "Join a room"
                  : activePanel === "settings"
                    ? "Player settings"
                    : "How to play"}
            </DialogTitle>
            <DialogDescription>
              {activePanel === "create"
                ? "Your table. Your friends. Your game."
                : activePanel === "join"
                  ? "Your seat is waiting."
                  : activePanel === "settings"
                    ? "Make yourself at home."
                    : "A simple game. A tricky last hand."}
            </DialogDescription>
          </DialogHeader>

          {activePanel !== "rules" ? (
            <form className="dd-form" onSubmit={submit}>
              <label htmlFor="dd-player-name">Player name</label>
              <input
                id="dd-player-name"
                name="playerName"
                autoComplete="nickname"
                placeholder="Enter your name"
                maxLength={20}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                required
              />
              {activePanel === "join" && (
                <>
                  <label htmlFor="dd-room-code">Room code</label>
                  <input
                    id="dd-room-code"
                    className="dd-code-input"
                    name="roomCode"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="A1B2C3"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      setCode(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, ""),
                      )
                    }
                    disabled={pending}
                    required
                  />
                </>
              )}
              {activePanel === "settings" && (
                <div className="dd-music-setting">
                  <label htmlFor="dd-music">
                    <Volume2 size={19} aria-hidden="true" />
                    Music
                  </label>
                  <Switch
                    id="dd-music"
                    checked={musicOn}
                    onCheckedChange={onToggleMusic}
                    className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-stone-600"
                  />
                </div>
              )}
              {(formError || error || (isRoomForm && !connected)) && (
                <p className="dd-form-error" role="alert">
                  {formError || error || "Waiting for the server to reconnect."}
                </p>
              )}
              <button
                type="submit"
                className={`dd-submit ${activePanel === "join" ? "dd-submit-blue" : ""}`}
                disabled={pending || (isRoomForm && !connected)}
              >
                {pending ? (
                  <LoaderCircle className="dd-spinner" aria-hidden="true" />
                ) : activePanel === "join" ? (
                  <LogIn size={20} aria-hidden="true" />
                ) : activePanel === "create" ? (
                  <Plus size={20} aria-hidden="true" />
                ) : null}
                {pending
                  ? "Connecting..."
                  : activePanel === "create"
                    ? "Create Room"
                    : activePanel === "join"
                      ? "Join Room"
                      : "Save settings"}
              </button>
              {activePanel === "create" && (
                <p className="dd-form-meta">
                  <Users size={14} aria-hidden="true" />
                  2–10 players
                  <Spade size={14} aria-hidden="true" />
                  Standard 52-card deck
                </p>
              )}
            </form>
          ) : (
            <ol className="dd-rules-list">
              <li>
                <strong>Be the first out.</strong>
                <p>
                  Finish all playable cards to win. The others continue until
                  only the loser remains.
                </p>
              </li>
              <li>
                <strong>Follow the led suit.</strong>
                <p>
                  If you have the suit on the table, you must play it.
                  Otherwise, play any unlocked card.
                </p>
              </li>
              <li>
                <strong>Take the table.</strong>
                <p>
                  The first different-suit card ends the round immediately.
                  The player with the highest card of the led suit takes all
                  cards already played. Remaining players skip that round.
                  If everyone follows suit, the cards are discarded.
                </p>
              </li>
              <li>
                <strong>Lead the next round.</strong>
                <p>
                  The highest card of the led suit decides who leads next. Ace
                  is high, then King, Queen, Jack, 10 down to 2.
                </p>
              </li>
              <li>
                <strong>Keep penalties locked.</strong>
                <p>
                  Penalty cards stay in hand, cannot be played, and are excluded
                  from the next deal. They do not count toward finishing.
                </p>
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
