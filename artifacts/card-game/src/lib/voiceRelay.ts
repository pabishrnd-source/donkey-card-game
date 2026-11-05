// Short, independently decodable clips let voice use the existing room WebSocket.
// Nothing is persisted; stopping the mic discards pending recordings immediately.
export const VOICE_CLIP_MS = 200;
export class VoiceRelayCapture {
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  constructor(private stream: MediaStream, private send: (mimeType: string, data: string) => void, private onError: () => void) {
    this.record();
  }
  private record() {
    if (this.stopped) return;
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { this.onError(); return; }
    try {
      const recorder = new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: 24000 });
      this.recorder = recorder;
      recorder.ondataavailable = event => {
        if (this.stopped || !event.data.size || event.data.size > 80000) return;
        const reader = new FileReader();
        reader.onload = () => { if (!this.stopped) this.send(mimeType, String(reader.result).split(",")[1]); };
        reader.readAsDataURL(event.data);
      };
      recorder.onerror = () => { this.stop(); this.onError(); };
      recorder.onstop = () => { if (!this.stopped) this.record(); };
      recorder.start();
      this.timer = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, VOICE_CLIP_MS);
    } catch { this.onError(); }
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.recorder = null;
  }
}

export class VoiceRelayPlayback {
  private peers = new Map<string, { audio: HTMLAudioElement; queue: string[]; current: string | null }>();
  private volume = 1;
  private muted = false;
  constructor(private onBlocked: () => void) {}
  receive(id: string, mimeType: string, data: string) {
    if (this.muted || data.length > 120000 || !["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].includes(mimeType)) return;
    let peer = this.peers.get(id);
    if (!peer) {
      const audio = new Audio();
      audio.setAttribute("playsinline", "true");
      peer = { audio, queue: [], current: null };
      this.peers.set(id, peer);
      audio.onended = () => this.advance(id);
      audio.onerror = () => { this.onBlocked(); this.advance(id); };
    }
    try {
      const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      // Prefer recent speech over accumulating delayed clips on a slow device.
      while (peer.queue.length >= 1) URL.revokeObjectURL(peer.queue.shift()!);
      peer.queue.push(url);
      if (!peer.current) this.advance(id);
    } catch { this.onBlocked(); }
  }
  private advance(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (peer.current) URL.revokeObjectURL(peer.current);
    peer.current = peer.queue.shift() ?? null;
    if (!peer.current) return;
    peer.audio.src = peer.current;
    peer.audio.volume = this.volume;
    peer.audio.muted = this.muted;
    void peer.audio.play().catch(this.onBlocked);
  }
  configure(volume: number, muted: boolean) {
    this.volume = volume; this.muted = muted;
    this.peers.forEach(peer => { peer.audio.volume = volume; peer.audio.muted = muted; });
    if (muted) for (const id of [...this.peers.keys()]) this.remove(id);
  }
  retry() { this.peers.forEach(peer => { if (peer.current) void peer.audio.play().catch(this.onBlocked); }); }
  remove(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.audio.onended = null; peer.audio.onerror = null;
    peer.audio.pause(); peer.audio.removeAttribute("src"); peer.audio.load();
    if (peer.current) URL.revokeObjectURL(peer.current);
    peer.queue.forEach(url => URL.revokeObjectURL(url)); this.peers.delete(id);
  }
  dispose() { for (const id of [...this.peers.keys()]) this.remove(id); }
}
