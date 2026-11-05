import { useEffect, useState, type CSSProperties } from "react";
import { PlayingCard } from "./PlayingCard";
import type { Card } from "@/lib/gameTypes";
import "./LaunchIntro.css";

const cards: { card: Card; x: number; y: number; angle: number }[] = [
  { card: { rank: "A", suit: "spades" }, x: 10, y: 20, angle: -18 },
  { card: { rank: "K", suit: "diamonds" }, x: 29, y: 12, angle: 22 },
  { card: { rank: "Q", suit: "clubs" }, x: 70, y: 13, angle: -10 },
  { card: { rank: "J", suit: "diamonds" }, x: 89, y: 23, angle: 24 },
  { card: { rank: "10", suit: "hearts" }, x: 9, y: 66, angle: 20 },
  { card: { rank: "A", suit: "clubs" }, x: 27, y: 85, angle: -20 },
  { card: { rank: "9", suit: "diamonds" }, x: 73, y: 86, angle: 26 },
  { card: { rank: "K", suit: "spades" }, x: 91, y: 66, angle: -22 },
];

const glints = [
  [24, 48], [36, 27], [72, 28], [69, 42],
  [28, 64], [77, 64], [37, 83], [82, 76],
];

export function LaunchIntro({ onDone }: { onDone: () => void }) {
  const asset = (name: string) => `${import.meta.env.BASE_URL}${name}?v=20261030`;
  const artwork = asset("donkey-intro-dance.png");
  const cutout = asset("donkey-intro-sunset-cutout.png");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Give the animation its full duration after loading, with a bounded fallback.
    const timeout = window.setTimeout(onDone, 5000);
    return () => window.clearTimeout(timeout);
  }, [onDone, ready]);

  return <main className="launch-intro" aria-label="Donkey opening screen">
    <div className="intro-scenery" aria-hidden="true">
      <img className="intro-backdrop" src={asset("donkey-intro-moonlit-kingdom.png")} alt="" fetchPriority="high" />
      {glints.map(([x, y], index) => <span key={index} className="intro-gold-glint"
        style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${index * 0.31}s` }} />)}
    </div>
    <div className={`intro-stage${ready ? " intro-ready" : ""}`}>
      <div className="intro-character" aria-label="Dancing Donkey">
        <img className="intro-character-art" src={cutout} alt="Donkey: The Golden Card King" onLoad={() => setReady(true)} onError={onDone} />
        <img className="intro-blink intro-blink-left" src={asset("donkey-intro-blink.png")} alt="" aria-hidden="true" />
        <img className="intro-blink intro-blink-right" src={asset("donkey-intro-blink.png")} alt="" aria-hidden="true" />
      </div>
      <img className="intro-front-plaque" src={cutout} alt="" aria-hidden="true" />
      <svg className="intro-dancing-title" viewBox="0 0 1374 1145" aria-hidden="true">
        <defs>
          <linearGradient id="intro-letter-gold" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#fff9be" /><stop offset="0.36" stopColor="#ffe888" />
            <stop offset="0.52" stopColor="#e5a324" /><stop offset="0.78" stopColor="#ffd65a" />
            <stop offset="1" stopColor="#b5690c" />
          </linearGradient>
        </defs>
        {Array.from("DONKEY").map((letter, index) => <text key={letter}
          className="intro-dancing-letter" x={350 + index * 135} y="1000" textAnchor="middle"
          style={{ animationDelay: `${index * -0.12}s` }}>{letter}</text>)}
      </svg>
      <div className="intro-card-layer" aria-hidden="true">
        {cards.map(({ card, x, y, angle }, index) => <div key={`${card.rank}-${card.suit}`} className="intro-flying-card"
          style={{ "--start-x": `${x}%`, "--start-y": `${y}%`, "--angle": `${angle}deg`, "--stack-angle": `${(index - 3.5) * 5}deg`, animationDelay: `${index * 0.055}s` } as CSSProperties}>
          {card.rank === "K" && card.suit === "spades" ?
            <div className="intro-donkey-card">
              <div className="intro-donkey-portrait" style={{ backgroundImage: `url(${artwork})` }} />
              <strong>DONKEY</strong>
            </div> : <PlayingCard card={card} size="sm" />}
        </div>)}
      </div>
    </div>
  </main>;
}
