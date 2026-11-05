import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Hand, Play, Wifi, Users } from "lucide-react";
import type { Card, GameState } from "@/lib/gameTypes";
import { localLobby, localPlayer, startLocal, playLocal, advanceLocal, localView } from "@/lib/localGame";
import { Nearby, nearbyAvailable, type NearbyPacket } from "@/lib/nearby";
import { PlayingCard } from "./PlayingCard";
import { GameOverScreen } from "./GameOverScreen";
import { validatePlay } from "../../../api-server/src/lib/gameEngine";
import { useGameAudio } from "@/hooks/useGameAudio";
import "./LocalGame.css";

export function LocalGame({ onLeave }: { onLeave: () => void }) {
  const [mode, setMode] = useState<"pass" | "host" | "join">("pass");
  const [names, setNames] = useState(["Player 1", "Player 2"]);
  const [firstDealer, setFirstDealer] = useState("");
  const [name, setName] = useState("Player");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [me, setMe] = useState("host");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [revealed, setRevealed] = useState("");
  const stateRef = useRef<GameState | null>(null);
  const modeRef = useRef(mode);
  const alive = useRef(true);
  const { playCard, playResult, stopResult } = useGameAudio();
  function publish(next: GameState) {
    stateRef.current = next;
    setState(next);
    if (modeRef.current === "host") for (const player of next.players) {
      if (player.id !== "host") void Nearby.send({ peer: player.id, data: JSON.stringify({ type: "state", me: player.id, state: localView(next, player.id) }) }).catch(() => {});
    }
  }
  function receive(event: NearbyPacket) {
    const current = stateRef.current;
    if (!alive.current) return;
    if (event.type === "closed") {
      if (modeRef.current === "join") { setConnected(false); setError("Host disconnected. Leave and rejoin the nearby room."); }
      else if (current?.players.some(p => p.id === event.peer)) {
        // No abandoned turn: cancel the current deal, retaining tournament penalties.
        publish(localLobby(current.players.filter(p => p.id !== event.peer).map(p => ({ ...p, hand: [], finished: false, finishOrder: null })), current.gameId, current));
        setError("A player disconnected. The host can start a fresh deal.");
      }
      return;
    }
    try {
      const packet = JSON.parse(event.data);
      if (modeRef.current === "join") {
        if (packet.type === "error") setError(String(packet.message));
        if (packet.type === "state" && packet.state?.players && packet.me) {
          setMe(packet.me); stateRef.current = packet.state; setState(packet.state); setBusy(false);
          setError(""); setConnected(true);
        }
        return;
      }
      if (!current || modeRef.current !== "host") return;
      if (packet.type === "join") {
        if (packet.code !== current.gameId) throw new Error("Incorrect room code.");
        if (current.phase !== "lobby") throw new Error("The game has already started.");
        if (current.players.some(p => p.id === event.peer)) return;
        if (current.players.length >= 10) throw new Error("Room is full.");
        if (typeof packet.name !== "string" || !packet.name.trim()) throw new Error("Enter a player name.");
        publish(localLobby([...current.players, localPlayer(event.peer, packet.name)], current.gameId, current));
      } else if (packet.type === "play" && current.players.some(p => p.id === event.peer)) {
        if (!packet.card || typeof packet.card.rank !== "string" || typeof packet.card.suit !== "string") return;
        publish(playLocal(current, event.peer, packet.card));
      }
    } catch (reason) {
      if (modeRef.current === "host") void Nearby.send({ peer: event.peer, data: JSON.stringify({ type: "error", message: reason instanceof Error ? reason.message : "Invalid request." }) }).catch(() => {});
    }
  }
  const receiver = useRef(receive); receiver.current = receive;
  useEffect(() => {
    alive.current = true;
    const listener = nearbyAvailable ? Nearby.addListener("packet", event => receiver.current(event)) : null;
    const hide = () => { if (document.hidden) setRevealed(""); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", hide);
      void listener?.then(handle => handle.remove());
      if (nearbyAvailable) void Nearby.stop();
    };
  }, []);
  useEffect(() => {
    if (state?.phase !== "round_end" || mode === "join") return;
    const timer = setTimeout(() => { if (stateRef.current === state) publish(advanceLocal(state)); }, 1800);
    return () => clearTimeout(timer);
  }, [state, mode]);
  const loserName = state?.players.find(p => p.id === state.gameOverLoserId)?.name;
  useEffect(() => {
    if (state?.phase !== "game_over" || !loserName) return;
    void playResult(loserName);
    return stopResult;
  }, [state?.phase, loserName, playResult, stopResult]);
  async function setup() {
    setBusy(true); setError(""); modeRef.current = mode;
    try {
      if (mode === "pass") {
        if (names.some(n => !n.trim())) throw new Error("Enter a name for every player.");
        const lobby = localLobby(names.map((n, i) => localPlayer(`p${i}`, n)));
        lobby.dealerId = firstDealer || null;
        publish(startLocal(lobby));
      } else if (mode === "host") {
        if (!name.trim()) throw new Error("Enter your name.");
        const roomCode = String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
        publish(localLobby([localPlayer("host", name)], roomCode));
        const result = await Nearby.host();
        if (!alive.current) { await Nearby.stop(); return; }
        setAddresses(result.addresses);
        if (!result.addresses.length) { await Nearby.stop(); throw new Error("Enable Wi-Fi or a hotspot first, then retry."); }
      } else {
        if (!name.trim() || !/^\d{6}$/.test(code.trim())) throw new Error("Enter your name and the six-digit room code.");
        await Nearby.join({ address: address.trim() });
        if (!alive.current) { await Nearby.stop(); return; }
        await Nearby.send({ peer: "host", data: JSON.stringify({ type: "join", name, code: code.trim() }) });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start local play.");
      if (mode === "host") { stateRef.current = null; setState(null); }
    } finally { setBusy(false); }
  }
  function act(card: Card) {
    if (!state || !connected) return;
    try {
      setError("");
      if (mode === "join") void Nearby.send({ peer: "host", data: JSON.stringify({ type: "play", card }) }).catch(() => setError("Connection interrupted."));
      else publish(playLocal(state, mode === "pass" ? state.currentTurn : me, card));
      setRevealed(""); void playCard();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Cannot play this card."); }
  }
  function nextGame(reset = false) {
    if (!state || state.phase !== "game_over" || stateRef.current !== state || mode === "join") return;
    const players = state.players.map(p => ({ ...p, hand: [], penaltyCards: reset ? [] : p.penaltyCards, finished: false, finishOrder: null }));
    try { publish(localLobby(players, state.gameId, reset ? undefined : state)); setError(""); }
    catch (reason) { setError(String(reason)); }
  }
  if (state?.phase === "game_over") return <><GameOverScreen gameState={state} myPlayerId={mode === "pass" ? state.hostId : me} onNextGame={() => nextGame()} onRestartTournament={() => nextGame(true)} onLeave={onLeave} />{error && <p role="alert">{error}</p>}</>;
  const viewer = state?.players.find(p => p.id === (mode === "pass" ? state.currentTurn : me));
  const turnKey = state ? `${state.roundNumber}:${state.roundCards.length}:${state.currentTurn}` : "";
  const hidden = mode === "pass" && revealed !== turnKey;
  return <main className="local-game">
    <header><button onClick={onLeave} aria-label="Leave local game" title="Leave local game"><ArrowLeft /></button><h1>Donkey <small>{mode === "pass" ? "Pass & play" : "Nearby Wi-Fi"}</small></h1></header>
    {error && <p role="alert" className="local-error">{error}</p>}
    {!state ? <section className="local-setup">
      <nav aria-label="Local game mode">{([['pass','Pass & play'],['host','Host Wi-Fi'],['join','Join Wi-Fi']] as const).map(([id,label]) => <button key={id} disabled={busy || (id !== 'pass' && !nearbyAvailable)} aria-pressed={mode === id} onClick={() => { setMode(id); setError(""); }}>{id === 'pass' ? <Hand size={18}/> : <Wifi size={18}/>} {label}</button>)}</nav>
      {mode === "pass" ? <><label>Players<select value={names.length} onChange={e => setNames(Array.from({length:Number(e.target.value)},(_,i)=>names[i] ?? `Player ${i+1}`))}>{Array.from({length:9},(_,i)=><option key={i} value={i+2}>{i+2}</option>)}</select></label><div className="local-names">{names.map((n,i)=><label key={i}>Player {i+1}<input maxLength={20} value={n} onChange={e=>setNames(names.map((v,j)=>j===i?e.target.value:v))}/></label>)}</div></> : <><label>Your name<input value={name} maxLength={20} onChange={e=>setName(e.target.value)}/></label>{mode === "join" && <><label>Host address<input autoCapitalize="none" inputMode="decimal" placeholder="192.168.1.5" value={address} onChange={e=>setAddress(e.target.value)}/></label><label>Room code<input inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label></>}<p>Trusted Wi-Fi or hotspot only. Nearby traffic is not encrypted. No account required.</p></>}
      {mode === "pass" && <label>First dealer<select value={names.some((_, i) => `p${i}` === firstDealer) ? firstDealer : ""} onChange={e => setFirstDealer(e.target.value)}><option value="" disabled>Select dealer</option>{names.map((n, i) => <option key={i} value={`p${i}`}>{n}</option>)}</select></label>}
      <button disabled={busy || (mode === "pass" && !names.some((_, i) => `p${i}` === firstDealer))} onClick={()=>void setup()}><Play size={18}/>{busy ? "Connecting..." : mode === "pass" ? "Start offline game" : mode === "host" ? "Host room" : "Join room"}</button>
    </section> : state.phase === "lobby" ? <section className="local-setup"><h2>Room {state.gameId} · Round {state.dealNumber + 1}</h2>{mode === "host" && <p>Host address: {addresses.join(" / ")}</p>}<p><Users size={18}/> {state.players.length}/10 players</p><ul>{state.players.map(p=><li key={p.id}>{p.name}{p.id===state.hostId?" (Host)":""}</li>)}</ul>
      <label>Dealer<select value={state.dealerId ?? ""} disabled={mode === "join"} onChange={e => publish({ ...state, dealerId: e.target.value })}><option value="" disabled>Select dealer</option>{state.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {mode !== "join" ? <button disabled={state.players.length<2 || !state.dealerId} onClick={()=>{try { if (stateRef.current === state) publish(startLocal(state)); setError(""); } catch(e) {setError(String(e));}}}>Start game</button> : <p>Waiting for host</p>}</section> : <>
      <div className="local-status"><span>Round {state.dealNumber} · Trick {state.roundNumber}</span><span>Dealer: {state.players.find(p => p.id === state.dealerId)?.name}</span><strong>{state.players.find(p=>p.id===state.currentTurn)?.name}'s turn</strong><span>Required suit: {state.leadSuit ?? "Any"}</span></div>
      <div className="local-opponents">{state.players.map(p=><span key={p.id}>{p.name}: {p.finished ? `Finished #${p.finishOrder}` : p.id === viewer?.id && !hidden ? `${p.hand.length} cards` : "Playing"}</span>)}</div>
      <section className="local-table" aria-label="Cards on table">{state.roundCards.length ? state.roundCards.map(entry=><div key={entry.playerId}><PlayingCard card={entry.card} size="sm"/><small>{state.players.find(p=>p.id===entry.playerId)?.name}</small></div>) : <span>Cards on table</span>}</section>
      {state.phase === "round_end" ? <p role="status">{state.message}</p> : hidden ? <section className="local-handover"><Hand size={26}/><h2>Pass to {viewer?.name}</h2><button onClick={()=>setRevealed(turnKey)}><Eye size={18}/>Show my cards</button></section> : viewer && <section className="local-hand"><h2>{viewer.name} <small>{viewer.hand.length} playable</small></h2><div>{viewer.hand.map(card=><PlayingCard key={`${card.suit}${card.rank}`} card={card} size="md" playable={connected && validatePlay(state,viewer.id,card).valid} onClick={connected && validatePlay(state,viewer.id,card).valid?()=>act(card):undefined}/>)}</div>{viewer.penaltyCards.length>0 && <><h3>Penalty cards</h3><div>{viewer.penaltyCards.map(card=><PlayingCard key={`${card.suit}${card.rank}`} card={card} size="sm" disabled/>)}</div></>}</section>}
    </>}
  </main>;
}
