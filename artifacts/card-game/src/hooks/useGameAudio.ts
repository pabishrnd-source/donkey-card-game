import { useCallback, useEffect, useRef, useState } from "react";

type AudioNodePair = {
  context: AudioContext;
  master: GainNode;
  music: GainNode;
};

const AudioContextCtor =
  window.AudioContext ??
  (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

function createAudioGraph(): AudioNodePair | null {
  if (!AudioContextCtor) return null;
  const context = new AudioContextCtor();
  const master = context.createGain();
  const music = context.createGain();
  master.gain.value = 0.35;
  music.gain.value = 0.08;
  music.connect(master);
  master.connect(context.destination);
  return { context, master, music };
}

function playTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export function useGameAudio() {
  const graphRef = useRef<AudioNodePair | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const cardBufferRef = useRef<Promise<AudioBuffer> | null>(null);
  const cardSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dealBufferRef = useRef<Promise<AudioBuffer> | null>(null);
  const dealSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [musicOn, setMusicOn] = useState(false);
  const resultBufferRef = useRef<Promise<AudioBuffer> | null>(null);
  const resultSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const resultGenerationRef = useRef(0);
  const resultSpeechRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stopResult = useCallback(() => {
    resultGenerationRef.current += 1;
    const source = resultSourceRef.current;
    resultSourceRef.current = null;
    if (source) { source.onended = null; source.stop(); source.disconnect(); }
    if (resultSpeechRef.current) window.speechSynthesis?.cancel();
    resultSpeechRef.current = null;
  }, []);

  const ensureAudio = useCallback(async () => {
    graphRef.current ??= createAudioGraph();
    const graph = graphRef.current;
    if (!graph) return null;
    if (graph.context.state === "suspended") {
      await graph.context.resume();
    }
    return graph;
  }, []);

  const loadCardSound = useCallback((context: AudioContext) => {
    cardBufferRef.current ??= fetch(`${import.meta.env.BASE_URL}card-play.mp3`)
      .then(response => {
        if (!response.ok) throw new Error("Card sound unavailable");
        return response.arrayBuffer();
      })
      .then(bytes => context.decodeAudioData(bytes))
      .catch(error => { cardBufferRef.current = null; throw error; });
    return cardBufferRef.current;
  }, []);

  const loadDealSound = useCallback((context: AudioContext) => {
    dealBufferRef.current ??= fetch(`${import.meta.env.BASE_URL}card-mixing.mp3`)
      .then(response => { if (!response.ok) throw new Error("Mixing sound unavailable"); return response.arrayBuffer(); })
      .then(bytes => context.decodeAudioData(bytes))
      .catch(error => { dealBufferRef.current = null; throw error; });
    return dealBufferRef.current;
  }, []);

  const playResult = useCallback(async (loserName: string) => {
    stopResult();
    const generation = resultGenerationRef.current;
    const announce = () => {
      if (generation !== resultGenerationRef.current || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      try {
        const speech = new SpeechSynthesisUtterance(`${loserName} is Donkey.`);
        speech.rate = 0.9;
        speech.lang = "en-IN";
        resultSpeechRef.current = speech;
        speech.onend = speech.onerror = () => {
          if (resultSpeechRef.current === speech) resultSpeechRef.current = null;
        };
        window.speechSynthesis.speak(speech);
      } catch {
        // Some WebViews expose speech synthesis without an available speech engine.
        resultSpeechRef.current = null;
      }
    };
    try {
      const graph = await ensureAudio();
      if (generation !== resultGenerationRef.current) return;
      if (!graph) { announce(); return; }
      resultBufferRef.current ??= fetch(`${import.meta.env.BASE_URL}game-lost.mp3`)
        .then(response => { if (!response.ok) throw new Error("Result sound unavailable"); return response.arrayBuffer(); })
        .then(bytes => graph.context.decodeAudioData(bytes))
        .catch(error => { resultBufferRef.current = null; throw error; });
      const buffer = await resultBufferRef.current;
      if (generation !== resultGenerationRef.current || graph.context.state !== "running") return;
      const source = graph.context.createBufferSource();
      source.buffer = buffer;
      source.connect(graph.master);
      resultSourceRef.current = source;
      // Start speech with the clip; cap the bray at three seconds.
      source.onended = () => {
        source.disconnect();
        if (resultSourceRef.current === source) resultSourceRef.current = null;
      };
      source.start(0, 0, 3);
      announce();
    } catch { announce(); /* An unavailable clip must not block results. */ }
  }, [ensureAudio, stopResult]);

  useEffect(() => {
    // Unlock Web Audio during a real gesture, before Android's first card tap.
    const unlock = () => { void ensureAudio().then(graph => graph && Promise.all([loadCardSound(graph.context), loadDealSound(graph.context)])).catch(() => {}); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      stopResult();
      resultBufferRef.current = null;
      cardSourceRef.current?.stop();
      cardSourceRef.current = null;
      dealSourceRef.current?.stop();
      dealSourceRef.current = null;
      dealBufferRef.current = null;
      void graphRef.current?.context.close();
      graphRef.current = null;
      cardBufferRef.current = null;
    };
  }, [ensureAudio, loadCardSound, loadDealSound, stopResult]);

  const playDeal = useCallback(async () => {
    try {
      const graph = await ensureAudio();
      if (!graph) return;
      const buffer = await loadDealSound(graph.context);
      if (graph.context.state !== "running") return;
      dealSourceRef.current?.stop();
      const source = graph.context.createBufferSource();
      source.buffer = buffer;
      source.connect(graph.master);
      dealSourceRef.current = source;
      source.onended = () => { source.disconnect(); if (dealSourceRef.current === source) dealSourceRef.current = null; };
      source.start();
    } catch { /* Sound must not block dealing. */ }
  }, [ensureAudio, loadDealSound]);

  const playCard = useCallback(async () => {
    try {
      const graph = await ensureAudio();
      if (!graph) return;
      const buffer = await loadCardSound(graph.context);
      if (graph.context.state !== "running") return;
      cardSourceRef.current?.stop();
      const source = graph.context.createBufferSource();
      source.buffer = buffer;
      source.connect(graph.master);
      cardSourceRef.current = source;
      source.onended = () => { source.disconnect(); if (cardSourceRef.current === source) cardSourceRef.current = null; };
      source.start();
    } catch {
      // A blocked or unavailable sound must never prevent playing a card.
    }
  }, [ensureAudio, loadCardSound]);

  const playTurn = useCallback(async () => {
    try {
      const graph = await ensureAudio();
      if (!graph || graph.context.state !== "running") return;
      const now = graph.context.currentTime;
      playTone(graph.context, graph.master, 660, now, 0.16, "sine", 0.35);
      playTone(graph.context, graph.master, 880, now + 0.19, 0.23, "sine", 0.35);
    } catch { /* Browser audio permissions must not affect the turn. */ }
  }, [ensureAudio]);

  const startMusic = useCallback(async () => {
    const graph = await ensureAudio();
    if (!graph || musicTimerRef.current !== null) return;
    setMusicOn(true);

    const notes = [392, 494, 587, 659, 587, 494, 440, 523];
    musicTimerRef.current = window.setInterval(() => {
      const currentGraph = graphRef.current;
      if (!currentGraph) return;
      const now = currentGraph.context.currentTime;
      const note = notes[stepRef.current % notes.length];
      playTone(currentGraph.context, currentGraph.music, note, now, 0.22, "sine", 0.55);
      playTone(currentGraph.context, currentGraph.music, note / 2, now, 0.3, "triangle", 0.18);
      stepRef.current += 1;
    }, 360);
  }, [ensureAudio]);

  const stopMusic = useCallback(() => {
    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
    setMusicOn(false);
  }, []);

  const toggleMusic = useCallback(() => {
    if (musicTimerRef.current === null) {
      void startMusic();
    } else {
      stopMusic();
    }
  }, [startMusic, stopMusic]);

  useEffect(() => stopMusic, [stopMusic]);

  return { musicOn, playCard, playDeal, playTurn, playResult, stopResult, startMusic, toggleMusic };
}
