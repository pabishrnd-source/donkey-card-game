import { useCallback, useEffect, useRef, useState } from "react";
import { type ClientMessage, type VoiceEvent, type VoiceSignal } from "@/lib/gameTypes";
import { LocalSong, validateSong } from "@/lib/localSong";
import { VoiceRelayCapture, VoiceRelayPlayback } from "@/lib/voiceRelay";

interface VoicePeer {
  playerId: string;
  playerName: string;
  stream: MediaStream | null;
  status?: RTCPeerConnectionState;
}
interface UseVoiceChatOptions {
  autoListen?: boolean;
  hostId?: string;
  connected?: boolean;
  gameId: string | null;
  myPlayerId: string | null;
  voiceEvents: VoiceEvent[];
  sendMessage: (message: ClientMessage) => void;
}
interface Connection {
  pc: RTCPeerConnection;
  sender: RTCRtpSender;
  musicSender: RTCRtpSender;
  musicTransceiver: RTCRtpTransceiver;
  musicAudio: HTMLAudioElement;
  audio: HTMLAudioElement;
  candidates: RTCIceCandidateInit[];
}

function iceServers(): RTCIceServer[] {
  const configured = import.meta.env.VITE_RTC_ICE_SERVERS;
  if (!configured) return [];
  const servers: unknown = JSON.parse(configured);
  if (!Array.isArray(servers) || servers.some(server => !server?.urls)) {
    throw new Error("Invalid voice server configuration.");
  }
  return servers;
}

export function useVoiceChat({ gameId, myPlayerId, hostId, voiceEvents, sendMessage, connected = true, autoListen = false }: UseVoiceChatOptions) {
  const [joined, setJoined] = useState(false);
  const [serverVoice, setServerVoice] = useState(typeof MediaRecorder !== "undefined");
  const relayCapture = useRef<VoiceRelayCapture | null>(null);
  const relayPlayback = useRef<VoiceRelayPlayback | null>(null);
  const [muted, setMuted] = useState(true);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [song, setSong] = useState({ title: "", playing: false });
  const [musicVolume, setMusicVolumeState] = useState(0.5);
  const [voiceVolume, setVoiceVolumeState] = useState(1);
  const hostRef = useRef(hostId);
  const localSong = useRef<LocalSong | null>(null);
  const musicVolumeRef = useRef(0.5);
  const voiceVolumeRef = useRef(1);
  const joinedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const connections = useRef(new Map<string, Connection>());
  const seen = useRef(new WeakSet<VoiceEvent>());
  const generation = useRef(0);
  const sessionGeneration = useRef(0);
  const speakerRef = useRef(false);
  const pending = useRef(Promise.resolve());

  const closePeer = useCallback((id: string) => {
    relayPlayback.current?.remove(id);
    const connection = connections.current.get(id);
    if (!connection) return;
    connections.current.delete(id);
    connection.pc.ontrack = null;
    connection.pc.onicecandidate = null;
    connection.pc.onconnectionstatechange = null;
    connection.pc.close();
    connection.audio.pause();
    connection.audio.srcObject = null;
    connection.musicAudio.pause();
    connection.musicAudio.srcObject = null;
  }, []);

  const releaseSong = useCallback(() => {
    localSong.current?.dispose();
    localSong.current = null;
    connections.current.forEach(({ musicSender }) => { void musicSender.replaceTrack(null).catch(() => {}); });
    setSong({ title: "", playing: false });
  }, []);

  const stopMicrophone = useCallback(() => {
    relayCapture.current?.stop();
    relayCapture.current = null;
    generation.current++;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    connections.current.forEach(({ sender }) => { void sender.replaceTrack(null).catch(() => {}); });
    setMuted(true);
  }, []);

  const cleanup = useCallback(() => {
    sessionGeneration.current++;
    joinedRef.current = false;
    relayPlayback.current?.dispose();
    relayPlayback.current = null;
    connections.current.forEach((_, id) => closePeer(id));
    stopMicrophone();
    releaseSong();
  }, [closePeer, stopMicrophone, releaseSong]);

  const leaveVoice = useCallback(() => {
    if (joinedRef.current && gameId) sendMessage({ type: "voice_leave", payload: { gameId } });
    cleanup();
    setJoined(false);
    setPeers([]);
  }, [cleanup, gameId, sendMessage]);

  const signal = useCallback((toPlayerId: string, value: VoiceSignal) => {
    if (joinedRef.current && gameId) sendMessage({ type: "voice_signal", payload: { gameId, toPlayerId, signal: value } });
  }, [gameId, sendMessage]);

  const createPeer = useCallback((id: string) => {
    const existing = connections.current.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    // A permanent audio transceiver lets mute/unmute replace tracks without renegotiation.
    const transceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    // Keep music separate from speech so each listener controls both volumes.
    const musicTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.muted = speakerRef.current;
    audio.volume = voiceVolumeRef.current;
    const musicAudio = new Audio();
    musicAudio.autoplay = true;
    musicAudio.setAttribute("playsinline", "true");
    musicAudio.volume = musicVolumeRef.current;
    const connection: Connection = { pc, sender: transceiver.sender, audio, musicSender: musicTransceiver.sender, musicTransceiver, musicAudio, candidates: [] };
    connections.current.set(id, connection);
    const track = streamRef.current?.getAudioTracks()[0];
    if (track && !serverVoice) void connection.sender.replaceTrack(track).catch(() => setError("Unable to send microphone audio."));
    if (localSong.current) void connection.musicSender.replaceTrack(localSong.current.track).catch(() => setError("Unable to share song audio."));
    pc.onicecandidate = event => {
      if (event.candidate) signal(id, { type: "candidate", candidate: event.candidate.toJSON() });
    };
    pc.ontrack = event => {
      if (!joinedRef.current) return;
      const stream = new MediaStream([event.track]);
      if (event.transceiver === musicTransceiver) {
        // Never play a guest's music track, even if a modified client sends one.
        if (id !== hostRef.current) return;
        musicAudio.srcObject = stream;
        void musicAudio.play().catch(() => setError("Tap anywhere to allow music playback."));
        return;
      }
      audio.srcObject = stream;
      setPeers(current => current.map(peer => peer.playerId === id ? { ...peer, stream } : peer));
      void audio.play().catch(() => setError("Tap anywhere to allow voice playback."));
    };
    pc.onconnectionstatechange = () => {
      setPeers(current => current.map(peer => peer.playerId === id ? { ...peer, status: pc.connectionState } : peer));
      if (pc.connectionState === "failed" && !serverVoice) setError("Voice connection failed. Check your network and rejoin the room.");
    };
    return connection;
  }, [signal, serverVoice]);

  const startMicrophone = useCallback(async () => {
    if (streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone requires permission and HTTPS or the Android app.");
    const token = ++generation.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (token !== generation.current || !joinedRef.current || document.hidden) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    streamRef.current = stream;
    try {
      if (serverVoice) {
        relayCapture.current = new VoiceRelayCapture(stream, (mimeType, data) => {
          if (joinedRef.current && gameId) sendMessage({ type: "voice_chunk", payload: { gameId, mimeType, data } });
        }, () => {
          // A failed recorder must not leave a live microphone and a false Mute state.
          stopMicrophone();
          setError("Voice recording failed. Tap Unmute to retry.");
        });
      } else {
        for (const { sender } of connections.current.values()) await sender.replaceTrack(stream.getAudioTracks()[0]);
      }
      if (token === generation.current) setMuted(false);
    } catch (reason) {
      stopMicrophone();
      throw reason;
    }
  }, [stopMicrophone, serverVoice, gameId, sendMessage]);

  const joinVoice = useCallback(async (startMuted = true) => {
    if (!gameId || !myPlayerId || !connected || joinedRef.current) return;
    try {
      if (!window.RTCPeerConnection) throw new Error("Live voice is not supported on this browser.");
      iceServers();
      setError(null);
      relayPlayback.current = new VoiceRelayPlayback(() => setError("Voice playback blocked. Tap anywhere to retry."));
      relayPlayback.current.configure(voiceVolumeRef.current, speakerRef.current);
      joinedRef.current = true;
      sessionGeneration.current++;
      setJoined(true);
      sendMessage({ type: "voice_join", payload: { gameId } });
      if (!startMuted) await startMicrophone();
    } catch (reason) {
      // Permission denial still allows listening, with the microphone off.
      setError(reason instanceof Error ? reason.message : "Microphone permission was not granted.");
    }
  }, [connected, gameId, myPlayerId, sendMessage, startMicrophone]);

  const publishSong = useCallback((title: string, playing: boolean) => {
    if (!gameId || !joinedRef.current || myPlayerId !== hostRef.current) return;
    setSong({ title, playing });
    sendMessage({ type: "voice_music", payload: { gameId, title, playing } });
  }, [gameId, myPlayerId, sendMessage]);

  const chooseSong = useCallback(async (file: File) => {
    if (!myPlayerId || myPlayerId !== hostRef.current) return;
    try {
      validateSong(file);
      await joinVoice(true);
      if (!joinedRef.current || myPlayerId !== hostRef.current) return;
      releaseSong();
      publishSong("", false);
      const title = file.name.slice(0, 160);
      const player = new LocalSong(file, musicVolumeRef.current,
        playing => { if (localSong.current === player) publishSong(title, playing); },
        () => {
          if (localSong.current !== player) return;
          player.pause();
          publishSong(title, false);
          setError("This file cannot be played. Try an MP3 or WAV file.");
        });
      localSong.current = player;
      publishSong(title, false);
      for (const { musicSender } of connections.current.values()) await musicSender.replaceTrack(player.track);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open this song.");
    }
  }, [joinVoice, myPlayerId, publishSong, releaseSong]);

  const toggleSong = useCallback(async () => {
    if (myPlayerId !== hostRef.current || !localSong.current) return;
    try {
      setError(null);
      if (localSong.current.audio.paused) await localSong.current.play();
      else localSong.current.pause();
    } catch { setError("Song playback failed. Tap Play again or choose another file."); }
  }, [myPlayerId]);

  const stopSong = useCallback(() => {
    if (myPlayerId !== hostRef.current) return;
    releaseSong();
    publishSong("", false);
  }, [myPlayerId, publishSong, releaseSong]);

  const setMusicVolume = useCallback((value: number) => {
    const volume = Math.max(0, Math.min(1, value));
    musicVolumeRef.current = volume;
    setMusicVolumeState(volume);
    localSong.current?.setVolume(volume);
    connections.current.forEach(({ musicAudio }) => { musicAudio.volume = volume; });
  }, []);

  const setVoiceVolume = useCallback((value: number) => {
    const volume = Math.max(0, Math.min(1, value));
    voiceVolumeRef.current = volume;
    setVoiceVolumeState(volume);
    relayPlayback.current?.configure(volume, speakerRef.current);
    connections.current.forEach(({ audio }) => { audio.volume = volume; });
  }, []);

  const toggleMute = useCallback(async () => {
    setError(null);
    if (!joinedRef.current) return joinVoice(false);
    if (streamRef.current) stopMicrophone();
    else {
      try { await startMicrophone(); }
      catch { setError("Microphone permission was not granted. Check your device settings."); }
    }
  }, [joinVoice, startMicrophone, stopMicrophone]);

  const enableSpeakers = useCallback(() => {
    speakerRef.current = false;
    setSpeakerMuted(false);
    setError(null);
    relayPlayback.current?.configure(voiceVolumeRef.current, false);
    relayPlayback.current?.retry();
    connections.current.forEach(({ audio, musicAudio }) => {
      audio.muted = false;
      if (audio.srcObject) void audio.play().catch(() => setError("Voice playback blocked. Check device audio permissions."));
      if (musicAudio.srcObject) void musicAudio.play().catch(() => setError("Music playback blocked. Tap anywhere to retry."));
    });
  }, []);
  const toggleSpeaker = useCallback(() => {
    if (speakerRef.current) return enableSpeakers();
    speakerRef.current = true;
    setSpeakerMuted(true);
    relayPlayback.current?.configure(voiceVolumeRef.current, true);
    connections.current.forEach(({ audio }) => { audio.muted = true; });
  }, [enableSpeakers]);

  useEffect(() => {
    const events = voiceEvents.filter(event => !seen.current.has(event));
    events.forEach(event => seen.current.add(event));
    for (const event of events) {
      if (event.type === "voice_music") {
        if (event.payload.hostId === hostRef.current) setSong({ title: event.payload.title, playing: event.payload.playing });
        continue;
      }
      if (!joinedRef.current) continue;
      if (event.type === "voice_chunk") {
        if (event.payload.fromPlayerId !== myPlayerId) relayPlayback.current?.receive(event.payload.fromPlayerId, event.payload.mimeType, event.payload.data);
        continue;
      }
      const session = sessionGeneration.current;
      // Serialize SDP and ICE processing: candidates may arrive before remote SDP.
      pending.current = pending.current.then(async () => {
        if (!joinedRef.current || session !== sessionGeneration.current) return;
        if (event.type === "voice_peers") {
          setPeers(event.payload.peers.map(peer => ({ ...peer, stream: null })));
          // Only the newcomer offers, preventing simultaneous-offer collisions.
          for (const peer of event.payload.peers) {
            const { pc } = createPeer(peer.playerId);
            const offer = await pc.createOffer();
            if (session !== sessionGeneration.current) return;
            await pc.setLocalDescription(offer);
            if (session !== sessionGeneration.current) return;
            signal(peer.playerId, { type: "offer", description: offer });
          }
        } else if (event.type === "voice_peer_joined") {
          setPeers(current => current.some(peer => peer.playerId === event.payload.playerId) ? current : [...current, { ...event.payload, stream: null }]);
        } else if (event.type === "voice_peer_left") {
          closePeer(event.payload.playerId);
          if (event.payload.playerId === hostRef.current) setSong({ title: "", playing: false });
          setPeers(current => current.filter(peer => peer.playerId !== event.payload.playerId));
        } else if (event.type === "voice_signal" && event.payload.fromPlayerId !== myPlayerId) {
          const { fromPlayerId, signal: incoming } = event.payload;
          const connection = createPeer(fromPlayerId);
          const { pc } = connection;
          if (incoming.type === "candidate") {
            if (pc.remoteDescription) await pc.addIceCandidate(incoming.candidate);
            else connection.candidates.push(incoming.candidate);
          } else {
            await pc.setRemoteDescription(incoming.description);
            if (session !== sessionGeneration.current) return;
            for (const candidate of connection.candidates.splice(0)) await pc.addIceCandidate(candidate);
            if (incoming.type === "offer") {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (session !== sessionGeneration.current) return;
              signal(fromPlayerId, { type: "answer", description: answer });
            }
          }
        }
      }).catch(() => { if (joinedRef.current) setError("Voice connection interrupted. Leave and rejoin voice to retry."); });
    }
  }, [voiceEvents, createPeer, closePeer, myPlayerId, signal]);

  useEffect(() => {
    if (!connected && joined) {
      leaveVoice();
      setError("Voice disconnected. Rejoin when the game reconnects.");
    }
  }, [connected, joined, leaveVoice]);

  useEffect(() => {
    const onHidden = () => { if (document.hidden) stopMicrophone(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [stopMicrophone]);

  useEffect(() => {
    hostRef.current = hostId;
    // A changed host cannot inherit the old host's file or incoming stream.
    if (myPlayerId !== hostId) releaseSong();
    connections.current.forEach(({ musicAudio }, id) => {
      if (id !== hostId) { musicAudio.pause(); musicAudio.srcObject = null; }
    });
  }, [hostId, myPlayerId, releaseSong]);

  useEffect(() => {
    setJoined(false);
    setMuted(true);
    setPeers([]);
    setError(null);
    return () => {
      if (joinedRef.current && gameId) sendMessage({ type: "voice_leave", payload: { gameId } });
      cleanup();
    };
  }, [gameId, cleanup, sendMessage]);

  // Listening is automatic; microphone capture still requires an explicit Unmute.
  useEffect(() => {
    if (autoListen && connected && gameId && myPlayerId) void joinVoice(true);
  }, [autoListen, connected, gameId, myPlayerId, joinVoice]);

  useEffect(() => {
    if (!autoListen || !joined) return;
    const retry = () => {
      relayPlayback.current?.retry();
      connections.current.forEach(({ audio, musicAudio }) => {
        if (audio.srcObject) void audio.play().catch(() => {});
        if (musicAudio.srcObject) void musicAudio.play().catch(() => {});
      });
      setError(current => current?.includes("playback") ? null : current);
    };
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
    return () => { window.removeEventListener("pointerdown", retry); window.removeEventListener("keydown", retry); };
  }, [autoListen, joined]);

  return { joined, muted, speakerMuted, error, peers, joinVoice, leaveVoice, toggleMute, toggleSpeaker, enableSpeakers, serverVoice, setServerVoice,
    isHost: Boolean(myPlayerId && myPlayerId === hostId), song, chooseSong, toggleSong, stopSong,
    musicVolume, setMusicVolume, voiceVolume, setVoiceVolume };
}
