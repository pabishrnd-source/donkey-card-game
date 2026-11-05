import { useEffect, useState, type CSSProperties } from "react";
import type { Player } from "@/lib/gameTypes";
import { dealSequence, dealDuration, initialDealCounts, DEAL_START, DEAL_STEP } from "@/lib/dealSequence";
import "./DealAnimation.css";
import { RiffleDeck } from "./RiffleDeck";

export function DealAnimation({ players, myPlayerId, dealerId }: { players: Player[]; myPlayerId: string | null; dealerId: string | null }) {
  const [counts] = useState(() => initialDealCounts(players, Math.max(0, players.findIndex(p => p.id === dealerId))));
  const sequence = dealSequence(counts, Math.max(0, players.findIndex(p => p.id === dealerId)));
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - started), DEAL_STEP);
    return () => window.clearInterval(timer);
  }, []);
  const self = Math.max(0, players.findIndex(player => player.id === myPlayerId));
  const position = (seat: number) => {
    const angle = Math.PI / 2 + ((seat - self + players.length) % players.length) * Math.PI * 2 / players.length;
    return { x: Math.cos(angle) * 37, y: Math.sin(angle) * 34 };
  };
  const received = sequence.slice(0, Math.max(0, Math.floor((elapsed - DEAL_START - 220) / DEAL_STEP) + 1));

  return (
    <div className="deal-scene" role="status" aria-label="Shuffling, then dealing cards to each player in turn" style={{ "--deal-duration": `${dealDuration(sequence.length)}ms`, "--card-back": `url(${import.meta.env.BASE_URL}donkey-golden-intro.png)` } as CSSProperties}>
      <RiffleDeck duration={DEAL_START} />
      {players.map((player, seat) => {
        const { x, y } = position(seat);
        const count = received.filter(value => value === seat).length;
        return <div className="deal-seat" key={player.id} style={{ left: `${50 + x}%`, top: `${50 + y}%` }}>
          <div className="deal-received-fan" aria-hidden="true">{Array.from({ length: Math.min(count, 7) }, (_, index) => <i key={index} style={{ "--fan-index": index, "--fan-count": Math.min(count, 7) } as CSSProperties} />)}</div>
          {player.id === myPlayerId && <span className="deal-seat-count">{count}</span>}
          <strong>{player.id === myPlayerId ? "You" : player.name}</strong>
        </div>;
      })}
      {sequence.map((seat, index) => {
        const { x, y } = position(seat);
        return (
          <div
            key={index}
            className="deal-card"
            style={
              {
                "--deal-x": `${x}vw`,
                "--deal-y": `${y}dvh`,
                "--delay": `${DEAL_START + index * DEAL_STEP}ms`,
              } as CSSProperties
            }
          />
        );
      })}
      <div className="deal-caption">
        {elapsed < DEAL_START ? "Shuffling" : "Dealing cards"}
      </div>
    </div>
  );
}
