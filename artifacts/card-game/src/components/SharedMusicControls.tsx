import { useRef, useState } from "react";
import { Music2, FolderOpen, Play, Pause, Square, ExternalLink } from "lucide-react";
import type { useVoiceChat } from "@/hooks/useVoiceChat";

export function SharedMusicControls({ session }: { session: ReturnType<typeof useVoiceChat> }) {
  const { isHost, song, chooseSong, toggleSong, stopSong, musicVolume, setMusicVolume } = session;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return <section className="shared-music" aria-label="Shared room music">
    <div className="shared-music-heading"><strong><Music2 size={18} /> Room music</strong><span>Host controls</span></div>
    <div className="shared-song" role="status">
      <strong>{song.title || (isHost ? "No song selected" : "Waiting for the host's song")}</strong>
      {song.title && <span>{song.playing ? "Playing" : "Paused"}</span>}
    </div>
    {isHost && <div className="shared-music-actions">
      <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.opus,.aac" hidden aria-label="Choose local song"
        onChange={async event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          setBusy(true);
          try { await chooseSong(file); } finally { setBusy(false); }
        }} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()}><FolderOpen size={18} />{busy ? "Opening..." : "Choose song"}</button>
      <button type="button" disabled={busy || !song.title} onClick={() => void toggleSong()}
        aria-label={song.playing ? "Pause shared song" : "Play shared song"} title={song.playing ? "Pause shared song" : "Play shared song"}>
        {song.playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button type="button" disabled={busy || !song.title} onClick={stopSong} aria-label="Stop shared song" title="Stop shared song"><Square size={18} /></button>
    </div>}
    <label className="room-volume">My music volume
      <input type="range" min="0" max="100" step="1" value={Math.round(musicVolume * 100)}
        onChange={event => setMusicVolume(Number(event.currentTarget.value) / 100)} />
      <output>{Math.round(musicVolume * 100)}%</output>
    </label>
    <a className="spotify-external" href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer" title="Spotify opens separately and is not shared with the room">
      <ExternalLink size={16} /> Spotify (personal)
    </a>
  </section>;
}
