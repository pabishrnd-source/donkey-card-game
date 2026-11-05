import { cn } from "@/lib/utils";
import type { Suit } from "@/lib/gameTypes";

const SUIT_STYLES: Record<Suit, { label: string; className: string }> = {
  spades: { label: "Spades", className: "text-slate-950" },
  clubs: { label: "Clubs", className: "text-slate-950" },
  hearts: { label: "Hearts", className: "text-rose-600" },
  diamonds: { label: "Diamonds", className: "text-rose-600" },
};

interface SuitMarkProps {
  suit: Suit;
  className?: string;
  title?: string;
}

export function SuitMark({ suit, className, title }: SuitMarkProps) {
  const style = SUIT_STYLES[suit];

  return (
    <span
      aria-label={title ?? style.label}
      title={title ?? style.label}
      className={cn("inline-flex items-center justify-center", style.className, className)}
    >
      {suit === "spades" && (
        <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className="h-full w-full">
          <path d="M32 3C24 15 8 24 8 37a13 13 0 0 0 23 8c-1 7-4 11-9 15h20c-5-4-8-8-9-15a13 13 0 0 0 23-8C56 24 40 15 32 3Z" />
        </svg>
      )}
      {suit === "clubs" && (
        <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className="h-full w-full">
          <path d="M32 4a13 13 0 0 0-10 22 13 13 0 1 0 8 20c-1 7-4 11-9 14h22c-5-3-8-7-9-14a13 13 0 1 0 8-20A13 13 0 0 0 32 4Z" />
        </svg>
      )}
      {suit === "hearts" && (
        <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className="h-full w-full">
          <path d="M46.6 8.2c-5.2 0-9.5 3.4-12.4 8.6-2.9-5.2-7.2-8.6-12.4-8.6-7.2 0-12.8 5.8-12.8 13.3 0 14.5 17.2 24 25.2 34.5 8-10.5 25.2-20 25.2-34.5 0-7.5-5.6-13.3-12.8-13.3Z" />
        </svg>
      )}
      {suit === "diamonds" && (
        <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className="h-full w-full">
          <path d="M32 5 57 32 32 59 7 32 32 5Z" />
        </svg>
      )}
    </span>
  );
}

