import { useState } from "react";
import {
  BookOpen,
  Club,
  Diamond,
  Heart,
  Layers,
  Play,
  RotateCcw,
  Settings,
  Spade,
  Users,
  Volume2,
  VolumeX,
  Wifi,
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
import "./StartScreen.css";
import "./RoyalLobby.css";
import "./VillageMenu.css";
import { AccountButton } from "./AccountHub";

const portraitLetterEdges = [150, 325, 545, 704, 840, 974, 1100];
const landscapeLetterEdges = [490, 633, 816, 925, 1039, 1146, 1267];

interface StartScreenProps {
  onLocal: () => void;
  connected: boolean;
  musicOn: boolean;
  savedSession: SavedSession | null;
  error: string | null;
  onPlay: () => void;
  onResume: () => void;
  onToggleMusic: () => void;
  onClearError: () => void;
}

export function StartScreen({
  onLocal,
  connected,
  musicOn,
  savedSession,
  error,
  onPlay,
  onResume,
  onToggleMusic,
  onClearError,
}: StartScreenProps) {
  const [panel, setPanel] = useState<"settings" | "rules" | null>(null);

  return (
    <main className="donkey-start royal-start courtyard-start village-menu">
      <div className="donkey-start-account"><AccountButton /></div>
      <picture>
      <source media="(orientation: landscape)" srcSet={`${import.meta.env.BASE_URL}donkey-tropical-landscape-stage.png`} />
      <img
        className="donkey-start-art"
        src={`${import.meta.env.BASE_URL}donkey-tropical-stage.png`}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
      />
      </picture>
      {/* Match the artwork's contain/cover mapping so eyelids stay aligned on rotation. */}
      <svg className="courtyard-logo-scene courtyard-blink-portrait" viewBox="0 0 1198 1313" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
        <defs><clipPath id="courtyard-logo-portrait">
          <path d="M150 494 L320 463 L357 431 Q315 390 325 320 Q344 301 370 352 L422 335 Q441 280 460 300 Q499 351 474 412 L490 437 Q790 423 981 471 L1038 505 L1100 539 L1052 647 L1054 718 L1014 747 Q600 730 210 754 L153 726 L163 559 Z" />
        </clipPath><clipPath id="courtyard-eyes-portrait">
          <ellipse cx="414" cy="441" rx="23" ry="25" />
          <ellipse cx="459" cy="431" rx="14" ry="20" />
        </clipPath>
          {portraitLetterEdges.slice(0, -1).map((x, index) => <clipPath key={x} id={`courtyard-letter-portrait-${index}`}>
            <rect x={x} y="0" width={portraitLetterEdges[index + 1] - x} height="1313" />
          </clipPath>)}
        </defs>
        {portraitLetterEdges.slice(0, -1).map((x, index) => <g key={x} className="courtyard-action-letter"
          style={{ transformOrigin: `${(x + portraitLetterEdges[index + 1]) / 2}px 650px`, animationDelay: `${index * 140}ms, ${1600 + index * 160}ms`, animationDuration: `650ms, ${1400 - index * 160}ms` }}>
          <g clipPath={`url(#courtyard-letter-portrait-${index})`}>
            <image href={`${import.meta.env.BASE_URL}donkey-courtyard.png`} width="1198" height="1313" clipPath="url(#courtyard-logo-portrait)" />
            {index === 1 && <image className="courtyard-logo-eyes" href={`${import.meta.env.BASE_URL}donkey-courtyard-blink.png`} width="1198" height="1313" clipPath="url(#courtyard-eyes-portrait)" />}
          </g>
        </g>)}
      </svg>
      <svg className="courtyard-logo-scene courtyard-blink-landscape" viewBox="0 0 1659 948" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs><clipPath id="courtyard-logo-landscape">
          <path d="M490 340 L533 321 L533 304 L619 282 L643 266 Q625 233 633 183 Q641 174 665 213 L712 190 Q728 145 745 155 Q778 196 765 239 L776 275 Q1010 269 1173 308 L1169 337 L1267 369 L1221 439 L1220 506 L1195 529 Q867 508 544 529 L496 504 L502 395 Z" />
        </clipPath><clipPath id="courtyard-eyes-landscape">
          <ellipse cx="708" cy="271" rx="17" ry="18" />
          <ellipse cx="746" cy="262" rx="11" ry="14" />
        </clipPath>
          {landscapeLetterEdges.slice(0, -1).map((x, index) => <clipPath key={x} id={`courtyard-letter-landscape-${index}`}>
            <rect x={x} y="0" width={landscapeLetterEdges[index + 1] - x} height="948" />
          </clipPath>)}
        </defs>
        {landscapeLetterEdges.slice(0, -1).map((x, index) => <g key={x} className="courtyard-action-letter"
          style={{ transformOrigin: `${(x + landscapeLetterEdges[index + 1]) / 2}px 460px`, animationDelay: `${index * 140}ms, ${1600 + index * 160}ms`, animationDuration: `650ms, ${1400 - index * 160}ms` }}>
          <g clipPath={`url(#courtyard-letter-landscape-${index})`}>
            <image href={`${import.meta.env.BASE_URL}donkey-courtyard-landscape.png`} width="1659" height="948" clipPath="url(#courtyard-logo-landscape)" />
            {index === 1 && <image className="courtyard-logo-eyes" href={`${import.meta.env.BASE_URL}donkey-courtyard-landscape-blink.png`} width="1659" height="948" clipPath="url(#courtyard-eyes-landscape)" />}
          </g>
        </g>)}
      </svg>
      <div className="donkey-start-frame" aria-hidden="true" />
      <section className="donkey-start-content" aria-labelledby="donkey-title">
        <h1 id="donkey-title">Donkey</h1>
        <p className="donkey-powered-by">Powered by <strong>Pabish Prasath</strong></p>
        <div className="donkey-title-ornament" aria-hidden="true">
          <span />
          <Spade fill="currentColor" />
          <Heart className="donkey-red-suit" fill="currentColor" />
          <Club fill="currentColor" />
          <Diamond className="donkey-red-suit" fill="currentColor" />
          <span />
        </div>

        <div className="donkey-start-actions">
          <button
            type="button"
            className="donkey-play-button"
            onClick={onPlay}
            disabled={!connected}
          >
            <Play size={23} fill="currentColor" aria-hidden="true" />
            <span>{connected ? "Play Now" : "Connecting..."}</span>
          </button>

          <div className={`donkey-secondary-actions${savedSession ? " has-resume" : ""}`}>
            <button type="button" onClick={onLocal}><Wifi size={18} aria-hidden="true" /><span>Offline / Wi-Fi</span></button>
              <button
                type="button"
                onClick={onResume}
                disabled={!connected || !savedSession}
                title={savedSession ? `Resume room ${savedSession.gameId}` : "No saved game"}
                aria-label={savedSession ? `Resume room ${savedSession.gameId}` : "Resume: no saved game"}
              >
                <RotateCcw size={18} aria-hidden="true" />
                <span>Resume</span>
              </button>
            <button type="button" onClick={() => setPanel("settings")}>
              <Settings size={18} aria-hidden="true" />
              <span>Settings</span>
            </button>
            <button type="button" onClick={() => setPanel("rules")}>
              <BookOpen size={18} aria-hidden="true" />
              <span>Rules</span>
            </button>
          </div>

        </div>

        {error && (
          <div className="donkey-start-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={onClearError}
              aria-label="Dismiss message"
              title="Dismiss message"
            >
              <X size={18} />
            </button>
          </div>
        )}
      </section>

      <footer className="donkey-start-footer">
        <div className="village-status-content">
        <div className="donkey-game-details">
          <span>
            <Users size={16} aria-hidden="true" />
            2–10 players
          </span>
          <i aria-hidden="true" />
          <span>
            <Layers size={16} aria-hidden="true" />
            52 cards
          </span>
        </div>
        <span className="donkey-connection" role="status">
          <i className={connected ? "is-connected" : ""} aria-hidden="true" />
          {connected ? "Connected to server" : "Connecting to server"}
        </span>
        </div>
      </footer>

      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="donkey-menu-dialog">
          <DialogHeader>
            <DialogTitle>
              {panel === "settings" ? "Settings" : "How to Play"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {panel === "settings"
                ? "Donkey audio settings"
                : "Rules for the Donkey card game"}
            </DialogDescription>
          </DialogHeader>
          {panel === "settings" ? (
            <div className="donkey-setting-row">
              <label htmlFor="donkey-music">
                <Volume2 size={20} aria-hidden="true" />
                Music
              </label>
              <Switch
                id="donkey-music"
                checked={musicOn}
                onCheckedChange={onToggleMusic}
                className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-stone-600"
              />
            </div>
          ) : (
            <ol className="donkey-rules">
              <li>
                <strong>Empty your hand.</strong>
                <p>
                  The first player with no playable cards wins. Keep playing
                  until the last player is the loser.
                </p>
              </li>
              <li>
                <strong>Follow the suit.</strong>
                <p>
                  Play the led suit if you have it. Otherwise, play any unlocked
                  card.
                </p>
              </li>
              <li>
                <strong>Watch the table.</strong>
                <p>
                  The first different-suit card ends the round immediately.
                  The player with the highest card of the led suit takes all
                  cards already played and leads next. If everyone follows suit,
                  the table cards are discarded.
                </p>
              </li>
              <li>
                <strong>Penalties stay locked.</strong>
                <p>
                  Penalty cards cannot be played or dealt again. They do not
                  count toward finishing your hand.
                </p>
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
