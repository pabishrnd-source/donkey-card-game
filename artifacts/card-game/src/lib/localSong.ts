// The file is decoded locally. Only a live audio track is sent to room listeners.
export class LocalSong {
  readonly audio = new Audio();
  readonly context = new AudioContext();
  readonly destination = this.context.createMediaStreamDestination();
  readonly monitor = this.context.createGain();
  private readonly source = this.context.createMediaElementSource(this.audio);
  private readonly url: string;
  private disposed = false;

  constructor(file: File, volume: number, onPlaying: (playing: boolean) => void, onError: () => void) {
    this.url = URL.createObjectURL(file);
    this.audio.src = this.url;
    this.audio.preload = "metadata";
    this.audio.setAttribute("playsinline", "true");
    // Local volume does not affect what other players receive.
    this.source.connect(this.destination);
    this.source.connect(this.monitor);
    this.monitor.connect(this.context.destination);
    this.setVolume(volume);
    this.audio.onplaying = () => onPlaying(true);
    this.audio.onpause = () => onPlaying(false);
    this.audio.onended = () => onPlaying(false);
    this.audio.onerror = onError;
  }

  get track() { return this.destination.stream.getAudioTracks()[0]; }
  setVolume(value: number) { this.monitor.gain.value = value; }
  async play() {
    if (this.disposed) return;
    await this.context.resume();
    if (!this.disposed) await this.audio.play();
  }
  pause() { this.audio.pause(); }
  dispose() {
    this.disposed = true;
    this.audio.onplaying = this.audio.onpause = this.audio.onended = this.audio.onerror = null;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.source.disconnect();
    this.monitor.disconnect();
    this.destination.stream.getTracks().forEach(track => track.stop());
    void this.context.close().catch(() => {});
    URL.revokeObjectURL(this.url);
  }
}

export function validateSong(file: File) {
  if (!file.size || file.size > 100 * 1024 * 1024) throw new Error("Choose an audio file between 1 byte and 100 MB.");
  if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|aac|wav|ogg|flac|opus|webm)$/i.test(file.name)) {
    throw new Error("Choose an MP3, M4A, WAV, or other supported audio file.");
  }
}
