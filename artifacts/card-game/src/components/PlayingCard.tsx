import { LockKeyhole } from "lucide-react";
import { type Card } from "@/lib/gameTypes";
import { cn } from "@/lib/utils";
import { SuitMark } from "./SuitMark";
import "./PlayingCard.css";

interface PlayingCardProps {
  card: Card;
  onClick?: () => void;
  playable?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  size?: "sm" | "md" | "lg";
  played?: boolean;
}

type Pip = [number, number];
const sides = (rows: number[]): Pip[] => rows.flatMap(y => [[27, y], [73, y]] as Pip[]);
const layouts: Record<string, Pip[]> = {
  "2": [[50, 15], [50, 85]],
  "3": [[50, 15], [50, 50], [50, 85]],
  "4": sides([15, 85]),
  "5": [...sides([15, 85]), [50, 50]],
  "6": sides([15, 50, 85]),
  "7": [...sides([15, 50, 85]), [50, 32]],
  "8": [...sides([15, 50, 85]), [50, 32], [50, 68]],
  "9": [...sides([12, 37, 63, 88]), [50, 50]],
  "10": [...sides([12, 37, 63, 88]), [50, 25], [50, 75]],
};
// Only the portrait area of the supplied reference is used; ranks and suits
// are rendered independently so every card, including clubs/diamonds, is correct.
const courtX: Record<string, number> = { J: 1748, Q: 1914, K: 2080 };

export function PlayingCard({ card, onClick, playable = false, disabled = false,
  hidden = false, size = "md", played = false }: PlayingCardProps) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  if (hidden) return <div aria-label="Face-down card" className={cn("classic-card classic-back donkey-card-back", `classic-${size}`)}><div /></div>;
  const court = courtX[card.rank];
  return (
    <button type="button" aria-label={`${card.rank} of ${card.suit}${disabled ? ", locked penalty" : ""}`}
      onClick={onClick} disabled={disabled || !onClick}
      className={cn("classic-card card-3d", `classic-${size}`, red ? "classic-red" : "classic-black",
        playable && onClick && "classic-playable", disabled && "classic-locked", played && "classic-played")}>
      <span className="classic-frame" aria-hidden="true" />
      <span className="classic-corner classic-top" aria-hidden="true"><b>{card.rank}</b><SuitMark suit={card.suit} /></span>
      {court ? <svg className="classic-court" viewBox={`${court} ${red ? 383 : 52} 90 246`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <image href="/donkey-card-reference.png" width="2206" height="713" />
      </svg> : card.rank === "A" ? <span className="classic-ace" aria-hidden="true"><SuitMark suit={card.suit} /></span> :
        <span className="classic-pips" aria-hidden="true">{layouts[card.rank]?.map(([x,y], i) => <span key={i} className={y > 50 ? "classic-pip inverted" : "classic-pip"} style={{ left: `${x}%`, top: `${y}%` }}><SuitMark suit={card.suit} /></span>)}</span>}
      <span className="classic-corner classic-bottom" aria-hidden="true"><b>{card.rank}</b><SuitMark suit={card.suit} /></span>
      {disabled && <span className="classic-lock" aria-hidden="true"><LockKeyhole /></span>}
    </button>
  );
}

