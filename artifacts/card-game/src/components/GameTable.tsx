import { useEffect, useState } from "react";
import { type GameState, type Suit } from "@/lib/gameTypes";
import { PlayingCard } from "./PlayingCard";
import { SuitMark } from "./SuitMark";
import { cn } from "@/lib/utils";

const SUIT_LABELS: Record<Suit, string> = {
  spades: "Spades",
  clubs: "Clubs",
  hearts: "Hearts",
  diamonds: "Diamonds",
};

interface GameTableProps {
  gameState: GameState;
}

export function GameTable({ gameState }: GameTableProps) {
  const { roundCards, players, leadSuit, roundNumber, phase, lastRoundResolution } = gameState;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    function updateSecondsLeft() {
      if (!gameState.turnDeadlineAt || gameState.phase !== "playing") {
        setSecondsLeft(null);
        return;
      }
      setSecondsLeft(Math.max(0, Math.ceil((gameState.turnDeadlineAt - Date.now()) / 1000)));
    }

    updateSecondsLeft();
    const interval = window.setInterval(updateSecondsLeft, 250);
    return () => window.clearInterval(interval);
  }, [gameState.turnDeadlineAt, gameState.phase]);

  const roundWinnerName =
    gameState.roundWinnerId && players.find((player) => player.id === gameState.roundWinnerId)?.name;

  return (
    <section className="match-table relative overflow-hidden rounded-[2rem] border border-white/25 bg-[radial-gradient(circle_at_top,#5ed3ff_0%,#20a7f2_42%,#1562c0_72%,#0a2e6a_100%)] p-4 shadow-[0_24px_70px_rgba(0,26,79,0.45)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),transparent_30%,rgba(0,0,0,0.12))]" />
      <div className="pointer-events-none absolute inset-x-8 top-6 h-24 rounded-full bg-white/14 blur-2xl" />

      <div className="match-round-info relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full border border-white/25 bg-black/20 px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-white">
          {leadSuit ? <SuitMark suit={leadSuit} className="h-4 w-4 text-yellow-200" /> : null}
          {phase === "lobby" ? "Waiting to start" : `Round ${gameState.dealNumber} · Trick ${roundNumber}`}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="match-dealer-label">Dealer: {players.find(player => player.id === gameState.dealerId)?.name ?? "Not selected"}</span>
          <div className="rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
            Cards on table: <span className="font-black">{roundCards.length}</span>
          </div>
          {secondsLeft !== null && (
            <div className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-slate-950 shadow">
              Auto drop in {secondsLeft}s
            </div>
          )}
          {leadSuit && (
            <div className="rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
              Required suit: <span className="font-black">{SUIT_LABELS[leadSuit]}</span>
            </div>
          )}
          {lastRoundResolution && (
            <div
              className={cn(
                "rounded-full px-3 py-1 text-xs font-black shadow",
                lastRoundResolution === "pickup"
                  ? "bg-orange-300 text-orange-950"
                  : "bg-emerald-300 text-emerald-950"
              )}
            >
              {lastRoundResolution === "pickup"
                ? "Pickup round: highest led-suit card takes the table"
                : "Discard round: everyone followed suit"}
            </div>
          )}
          {roundWinnerName && phase === "round_end" && (
            <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-950 shadow">
              Trick winner: {roundWinnerName}
            </div>
          )}
        </div>
      </div>

      <div className="match-felt relative z-10 mt-4 rounded-[1.5rem] border border-white/20 bg-[radial-gradient(circle_at_center,rgba(245,255,139,0.95)_0%,rgba(135,223,57,0.9)_34%,rgba(15,149,66,0.92)_66%,rgba(9,71,31,0.95)_100%)] px-4 py-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute inset-3 rounded-[1.1rem] border border-black/25" />
        <div className="pointer-events-none absolute inset-x-[12%] top-[18%] h-16 rounded-full bg-white/10 blur-2xl" />

        {roundCards.length === 0 ? (
          <div className="relative z-10 flex min-h-40 items-center justify-center text-center text-sm font-semibold text-yellow-100 sm:min-h-52">
            <div className="max-w-sm space-y-2">
              <p className="text-lg font-black uppercase tracking-[0.2em] text-white">Cards on table</p>
              <p>{phase === "round_end" ? "Preparing the next round..." : "The table is ready for the first card."}</p>
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex min-h-40 flex-wrap items-center justify-center gap-3 sm:min-h-52 sm:gap-5">
            {roundCards.map(({ playerId, card }, index) => {
              const player = players.find((p) => p.id === playerId);
              const isRoundWinner = gameState.roundWinnerId === playerId && phase === "round_end";

              return (
                <div
                  key={`${playerId}-${card.suit}-${card.rank}`}
                  className="flex flex-col items-center gap-1.5"
                  style={{ transform: `translateY(${Math.min(index, 2) * 2}px)` }}
                >
                  <div className={isRoundWinner ? "rounded-xl ring-4 ring-yellow-300 ring-offset-2 ring-offset-transparent" : ""}>
                    <PlayingCard card={card} size="lg" played />
                  </div>
                  <span className="table-card-name rounded-full border border-white/20 bg-black/35 px-3 py-1 text-xs font-bold text-white">
                    {player?.name ?? "Unknown"}
                    {isRoundWinner ? " wins" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="match-stats relative z-10 mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/20 bg-black/20 px-3 py-2 text-xs text-white">
          <span className="block uppercase tracking-[0.2em] text-white/70">Current turn</span>
          <span className="mt-1 block font-black">
            {players.find((player) => player.id === gameState.currentTurn)?.name ?? "Waiting..."}
          </span>
        </div>
        <div className="rounded-2xl border border-white/20 bg-black/20 px-3 py-2 text-xs text-white">
          <span className="block uppercase tracking-[0.2em] text-white/70">Finished players</span>
          <span className="mt-1 block font-black">{gameState.finishedPlayerIds.length}</span>
        </div>
        <div className="rounded-2xl border border-white/20 bg-black/20 px-3 py-2 text-xs text-white">
          <span className="block uppercase tracking-[0.2em] text-white/70">Current game winner</span>
          <span className="mt-1 block font-black">
            {gameState.currentGameWinnerId
              ? players.find((player) => player.id === gameState.currentGameWinnerId)?.name ?? "Unknown"
              : "None yet"}
          </span>
        </div>
      </div>
    </section>
  );
}
