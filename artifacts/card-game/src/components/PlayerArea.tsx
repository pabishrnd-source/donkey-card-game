import { type Player, type Card, type GameState } from "@/lib/gameTypes";
import { PlayingCard } from "./PlayingCard";
import { SuitMark } from "./SuitMark";
import { cn } from "@/lib/utils";
import { CardPages } from "./CardPages";
import { useState } from "react";
import { PlayerAvatar } from "./ProfileButton";

interface PlayerAreaProps {
  player: Player;
  isMe: boolean;
  isCurrentTurn: boolean;
  gameState: GameState;
  onPlayCard?: (card: Card) => void;
}

const PENALTY_SUITS: Array<Card["suit"]> = ["spades", "clubs", "hearts", "diamonds"];
const PENALTY_RANKS: Array<Card["rank"]> = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

const SUIT_ORDER: Array<Card["suit"]> = ["spades", "hearts", "diamonds", "clubs"];
const SUIT_LABELS: Record<Card["suit"], string> = {
  spades: "Spades",
  hearts: "Hearts",
  diamonds: "Diamonds",
  clubs: "Clubs",
};

function compareCards(a: Card, b: Card): number {
  const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
  if (suitDiff !== 0) return suitDiff;
  return PENALTY_RANKS.indexOf(a.rank) - PENALTY_RANKS.indexOf(b.rank);
}

function arrangeHandForTurn(hand: Card[], player: Player, gameState: GameState): Card[] {
  const sorted = [...hand].sort(compareCards);
  const leadSuit = gameState.leadSuit;
  const shouldPrioritizeLeadSuit =
    gameState.phase === "playing" &&
    gameState.currentTurn === player.id &&
    gameState.roundCards.length > 0 &&
    leadSuit &&
    sorted.some((card) => card.suit === leadSuit);

  if (!shouldPrioritizeLeadSuit) return sorted;

  return [
    ...sorted.filter((card) => card.suit === leadSuit),
    ...sorted.filter((card) => card.suit !== leadSuit),
  ];
}

function getRequiredStartingCard(gameState: GameState): Card | null {
  for (const suit of PENALTY_SUITS) {
    for (const rank of PENALTY_RANKS) {
      const candidate = { suit, rank };
      if (
        gameState.players.some((p) =>
          p.hand.some((card) => card.suit === candidate.suit && card.rank === candidate.rank)
        )
      ) {
        return candidate;
      }
    }
  }
  return null;
}

function isCardPlayable(card: Card, player: Player, gameState: GameState): boolean {
  if (gameState.phase !== "playing") return false;
  if (player.finished || !gameState.activePlayerIds.includes(player.id)) return false;
  if (gameState.currentTurn !== player.id) return false;

  const isFirstCardOfGame = gameState.roundNumber === 1 && gameState.roundCards.length === 0;
  if (isFirstCardOfGame) {
    const required = getRequiredStartingCard(gameState);
    return required ? card.suit === required.suit && card.rank === required.rank : true;
  }

  if (gameState.roundCards.length === 0) return true;

  const leadSuit = gameState.leadSuit;
  if (!leadSuit) return true;
  const hasLeadSuit = player.hand.some((c) => c.suit === leadSuit);
  return hasLeadSuit ? card.suit === leadSuit : true;
}

export function PlayerArea({
  player,
  isMe,
  isCurrentTurn,
  gameState,
  onPlayCard,
}: PlayerAreaProps) {
  const [showPenalties, setShowPenalties] = useState(false);
  const sortedHand = arrangeHandForTurn(player.hand, player, gameState);
  const sortedPenaltyCards = [...player.penaltyCards].sort(compareCards);
  const leadSuitCardsAreFirst =
    isMe &&
    isCurrentTurn &&
    gameState.leadSuit &&
    gameState.roundCards.length > 0 &&
    player.hand.some((card) => card.suit === gameState.leadSuit);

  return (
    <div
      className={cn(
        "match-player rounded-[1.25rem] border p-3 shadow-[0_14px_30px_rgba(3,19,52,0.22)] transition-all duration-300 sm:p-4",
        isCurrentTurn
          ? "border-yellow-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,250,255,0.92))] ring-4 ring-yellow-300/50"
          : player.finished
          ? "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(209,250,229,0.95))]"
          : "border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(240,249,255,0.88))]",
        isMe ? "match-self border-yellow-300 bg-white/95" : "match-opponent",
        showPenalties && "show-penalties"
      )}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-white shadow-md",
              isCurrentTurn ? "bg-yellow-400 text-slate-950" : player.finished ? "bg-emerald-500" : "bg-sky-600"
            )}
          >
            <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-black text-slate-950 sm:text-base">{player.name}</span>
              {isMe && <span className="text-xs font-semibold text-sky-600">(you)</span>}
              {gameState.dealerId === player.id && <span className="dealer-badge" title="Current dealer">D</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
              {isMe && <span className="player-card-count rounded-full bg-slate-100 px-2 py-0.5">
                <span className="font-black text-slate-800">{player.hand.length}</span> playable
              </span>}
              {player.penaltyCards.length > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">
                  <span className="font-black">{player.penaltyCards.length}</span> penalty
                </span>
              )}
              {player.finished && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                  Finished {player.finishOrder ? `#${player.finishOrder}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
          <span
            className={cn("size-2.5 rounded-full", isCurrentTurn ? "bg-yellow-400 animate-pulse" : "bg-slate-300")}
          />
          {isCurrentTurn ? "Current turn" : player.finished ? "Finished" : "Waiting"}
        </div>
      </div>

      {isMe && gameState.phase !== "lobby" && !player.finished && (
        <>
          {leadSuitCardsAreFirst && gameState.leadSuit && (
            <div className="mb-3 rounded-full bg-sky-700 px-3 py-1 text-center text-xs font-black text-white shadow">
              Follow suit first: {SUIT_LABELS[gameState.leadSuit]}
            </div>
          )}
          <div className="match-hand mt-1 flex gap-1.5 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0">
            {sortedHand.length === 0 ? (
              <span className="text-sm italic text-slate-400">No playable cards</span>
            ) : (
              <CardPages key={`${gameState.currentTurn}-${gameState.leadSuit}`}>{sortedHand.map((card, idx) => {
                const playable = isCardPlayable(card, player, gameState);
                return (
                  <PlayingCard
                    key={`${card.suit}-${card.rank}-${idx}`}
                    card={card}
                    playable={playable}
                    onClick={playable && onPlayCard ? () => onPlayCard(card) : undefined}
                    size="md"
                  />
                );
              })}</CardPages>
            )}
          </div>
        </>
      )}

      {!isMe && gameState.phase !== "lobby" && !player.finished && (
        <div aria-label="Hidden opponent hand" className="match-card-fan mt-2 flex max-h-16 gap-1 overflow-hidden sm:max-h-20 sm:flex-wrap">
          {Array.from({ length: 7 }).map((_, i) => (
            <PlayingCard key={i} card={{ suit: "spades", rank: "2" }} hidden size="sm" />
          ))}
        </div>
      )}

      {isMe && player.penaltyCards.length > 0 && <button className="compact-only penalty-toggle" type="button" onClick={() => setShowPenalties(!showPenalties)}>{showPenalties ? "Playable cards" : `Penalty cards (${player.penaltyCards.length})`}</button>}
      {player.penaltyCards.length > 0 && (
        <div className="penalty-hand mt-3 border-t border-slate-200 pt-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-rose-600">
            <SuitMark suit="spades" className="h-4 w-4" />
            Locked penalty cards
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <CardPages>{sortedPenaltyCards.map((card, idx) => (
              <PlayingCard
                key={`penalty-${player.id}-${card.suit}-${card.rank}-${idx}`}
                card={card}
                disabled
                size="sm"
              />
            ))}</CardPages>
          </div>
        </div>
      )}
    </div>
  );
}

