import { useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { type ClientMessage, type VoiceEvent } from "@/lib/gameTypes";
import "./Profile.css";
import { SharedMusicControls } from "./SharedMusicControls";

interface VoiceChatPanelProps {
  gameId: string | null;
  myPlayerId: string | null;
  voiceEvents: VoiceEvent[];
  sendMessage: (message: ClientMessage) => void;
}

export function VoiceChatPanel(props: VoiceChatPanelProps) {
  const session = useVoiceChat({ ...props, autoListen: true });
  return <VoiceChatControls session={session} />;
}

export function VoiceMicButton({ session }: { session: ReturnType<typeof useVoiceChat> }) {
  const [busy, setBusy] = useState(false);
  const active = session.joined && !session.muted;
  return <button type="button" className="voice-quick" disabled={busy}
    aria-label={active ? "Mute microphone" : "Unmute microphone"} title={active ? "Mute microphone" : "Unmute microphone"}
    aria-pressed={active} onClick={async () => {
      setBusy(true);
      try { session.enableSpeakers(); await session.toggleMute(); } finally { setBusy(false); }
    }}>{active ? <Mic size={18} /> : <MicOff size={18} />}</button>;
}

export function VoiceChatControls({ session }: { session: ReturnType<typeof useVoiceChat> }) {
  const { joined, muted, error, toggleMute, enableSpeakers } = session;
  const [busy, setBusy] = useState(false);
  async function talk() {
    if (busy) return;
    setBusy(true);
    try { enableSpeakers(); await toggleMute(); }
    finally { setBusy(false); }
  }
  return <div className="voice-panel" aria-label="Room voice chat">
    <div className="voice-section">
    <div className="voice-controls">
      <button type="button" onClick={talk} disabled={busy}
        aria-pressed={joined && !muted} aria-busy={busy} title={joined && !muted ? "Mute microphone" : "Unmute microphone"}>
        {joined && !muted ? <Mic size={19} /> : <MicOff size={19} />}
        {joined && !muted ? "Mute" : "Unmute"}
      </button>
    </div>
    {error && <p className="voice-error" role="alert">{error}</p>}
    </div>
    <SharedMusicControls session={session} />
  </div>;
}
