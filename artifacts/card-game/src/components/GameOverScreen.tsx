import type { ReactNode } from "react";
import { Users, LogOut, RotateCcw, ArrowRight } from "lucide-react";
import type { GameState } from "@/lib/gameTypes";
import { PlayingCard } from "./PlayingCard";
import { SuitMark } from "./SuitMark";
import { PlayerAvatar } from "./ProfileButton";
import "./GameOverScreen.css";

const SUITS = { spades: "Spades", clubs: "Clubs", hearts: "Hearts", diamonds: "Diamonds" };
interface GameOverScreenProps {
  gameState: GameState;
  myPlayerId: string | null;
  onNextGame: () => void;
  onRestartTournament: () => void;
  onLeave?: () => void;
  audioControls?: ReactNode;
}
export function GameOverScreen({ gameState, myPlayerId, onNextGame, onRestartTournament, onLeave, audioControls }: GameOverScreenProps) {
  const loser = gameState.players.find(p => p.id === gameState.gameOverLoserId);
  const isHost = myPlayerId === gameState.hostId;
  const orderedPlayers = [...gameState.players].sort((a,b) => (a.finishOrder ?? Infinity) - (b.finishOrder ?? Infinity));
  return <main className="game-results royal-results">
    <header className="results-toolbar"><span>DONKEY</span>{onLeave && <button type="button" className="results-leave" onClick={onLeave}><LogOut size={19} />End Game</button>}</header>
    <section className="results-heading">
      <img className="results-art" src={`${import.meta.env.BASE_URL}donkey-tropical-results-mascot.png`} alt="Donkey king with a gold crown and playing cards" />
      <h1>Round {gameState.dealNumber} Complete</h1>
      <p>Next dealer: {gameState.players.find(p => p.id === gameState.dealerId)?.name ?? "Select in lobby"}</p>
    </section>
    <div className="results-content">
      <section className="results-outcomes" aria-label="Game results">
        <article className="result-person result-loser">
          <h2>Final loser</h2>
          <div className="result-loser-person">{loser && <span className="result-avatar"><PlayerAvatar name={loser.name} avatarUrl={loser.avatarUrl} /></span>}<strong className="result-name">{loser?.name ?? "None"}</strong></div>
          {loser && <p className="result-loser-label">{loser.name} is Donkey</p>}
          {gameState.penaltyCard && <div className="result-penalty"><span>Penalty received</span><PlayingCard card={gameState.penaltyCard} size="sm" disabled /></div>}
        </article>
      </section>
      <section className="results-standings" aria-labelledby="results-players">
        <h2 id="results-players"><Users size={21} />Finished players</h2>
        <ol>{orderedPlayers.map(player => <li key={player.id} className={player.id === loser?.id ? "standing-loser" : ""}>
          <span className="standing-avatar"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} /></span>
          <span className="standing-name">{player.name} {player.id === myPlayerId && <small>(you)</small>}</span>
          <span className="standing-place">{player.id === loser?.id ? "LOSER" : player.finishOrder ? `FINISHED #${player.finishOrder}` : "Remaining"}</span>
          <span className="standing-count">{player.id === myPlayerId && `${player.hand.length} playable / `}{player.penaltyCards.length} penalty</span>
        </li>)}</ol>
      </section>
      {gameState.nextPenaltyCard && <section className="results-next" aria-label="Next penalty card"><SuitMark suit={gameState.nextPenaltyCard.suit} className="size-7" /><p>Next penalty card: <strong>{gameState.nextPenaltyCard.rank} of {SUITS[gameState.nextPenaltyCard.suit]}</strong></p><div className="next-card"><PlayingCard card={gameState.nextPenaltyCard} size="md" /></div></section>}
      <div className="results-actions">{isHost ? <><button type="button" onClick={onNextGame}><ArrowRight size={19} />Next Game</button><button type="button" className="results-secondary" onClick={onRestartTournament}><RotateCcw size={18} />Restart Tournament</button></> : <p role="status">Waiting for host...</p>}</div>
      {audioControls && <section className="results-audio" aria-label="Room audio">{audioControls}</section>}
    </div>
  </main>;
}
