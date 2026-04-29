/**
 * PlayingCard component
 *
 * Renders a single playing card with suit symbol, rank, and color.
 * Red suits (hearts, diamonds) are red; black suits (spades, clubs) are black.
 * Supports a "playable" highlight and a "selected" / "disabled" state.
 */

import { type Card, type Suit } from "@/lib/gameTypes";
import { cn } from "@/lib/utils";

// Unicode suit symbols
const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const RED_SUITS: Suit[] = ["hearts", "diamonds"];

interface PlayingCardProps {
  card: Card;
  onClick?: () => void;
  playable?: boolean;   // Can be played (green highlight)
  disabled?: boolean;   // Cannot be played (dimmed)
  hidden?: boolean;     // Show card back (used for opponents)
  size?: "sm" | "md" | "lg";
  played?: boolean;     // Card is on the table
}

export function PlayingCard({
  card,
  onClick,
  playable = false,
  disabled = false,
  hidden = false,
  size = "md",
  played = false,
}: PlayingCardProps) {
  const isRed = RED_SUITS.includes(card.suit);
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  const sizeClasses = {
    sm: "w-12 h-17 text-xs",
    md: "w-16 h-24 text-sm",
    lg: "w-20 h-28 text-base",
  };

  if (hidden) {
    // Card back — solid pattern
    return (
      <div
        className={cn(
          "relative rounded-lg border-2 border-gray-400 flex items-center justify-center cursor-default select-none",
          "bg-gradient-to-br from-blue-800 to-blue-950",
          sizeClasses[size]
        )}
        style={{ minWidth: size === "sm" ? 48 : size === "md" ? 64 : 80 }}
      >
        <div className="w-3/4 h-3/4 border-2 border-blue-500 rounded opacity-50" />
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        "relative rounded-lg border-2 flex flex-col justify-between p-1.5 select-none transition-all duration-150",
        "bg-white shadow-md",
        sizeClasses[size],
        isRed ? "text-red-600" : "text-gray-900",
        // Playable cards get a green glow + lift on hover
        playable && onClick && "border-green-500 shadow-green-200 shadow-lg cursor-pointer hover:-translate-y-2 hover:shadow-xl",
        // Non-playable own cards
        !playable && onClick && "border-gray-300 cursor-not-allowed opacity-60",
        // Cards on the table (not in hand)
        played && "border-gray-300 cursor-default",
        // Disabled state
        disabled && "opacity-40 cursor-not-allowed",
      )}
      style={{ minWidth: size === "sm" ? 48 : size === "md" ? 64 : 80 }}
    >
      {/* Top-left rank + suit */}
      <div className="flex flex-col items-start leading-none">
        <span className="font-bold">{card.rank}</span>
        <span className="text-base leading-none">{suitSymbol}</span>
      </div>

      {/* Center suit symbol */}
      <div className="flex items-center justify-center text-2xl opacity-20 absolute inset-0 pointer-events-none">
        {suitSymbol}
      </div>

      {/* Bottom-right rank + suit (rotated) */}
      <div className="flex flex-col items-end leading-none rotate-180">
        <span className="font-bold">{card.rank}</span>
        <span className="text-base leading-none">{suitSymbol}</span>
      </div>
    </button>
  );
}
