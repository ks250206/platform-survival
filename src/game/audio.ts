import type { GameEvent } from "./types";

/** Small synthesized arcade cues: no downloads and no sound before a gesture. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private lastHit = -1;

  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.09;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    } catch {
      /* Audio is optional when the browser disallows a context. */
    }
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(muted ? 0 : 0.09, this.context.currentTime, 0.02);
  }
  private note(
    frequency: number,
    to: number,
    duration: number,
    type: OscillatorType = "sine",
    delay = 0,
  ) {
    if (!this.context || !this.master || this.muted || this.context.state !== "running") return;
    const at = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.45, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  play(event: GameEvent) {
    if (!this.context) return;
    // Twenty-four fighters can create a burst of contacts; keep the mix readable.
    const t = this.context.currentTime;
    if (event.kind === "hit" || event.kind === "bounce") {
      if (t - this.lastHit < 0.075) return;
      this.lastHit = t;
    }
    switch (event.kind) {
      case "hit":
        this.note(190, 65, 0.12, "triangle");
        break;
      case "strong":
        if (event.fighterId === 0) this.note(140, 480, 0.2, "triangle");
        break;
      case "jump":
        if (event.fighterId === 0) this.note(310, 670, 0.15);
        break;
      case "roll":
        if (event.fighterId === 0) this.note(240, 90, 0.18, "triangle");
        break;
      case "reflect":
        this.note(780, 1480, 0.17, "triangle");
        break;
      case "throw":
        if (event.fighterId === 0) this.note(500, 240, 0.12);
        break;
      case "pickup":
        if (event.fighterId === 0) {
          this.note(660, 660, 0.12);
          this.note(990, 990, 0.15, "sine", 0.09);
        }
        break;
      case "eliminate":
        this.note(350, 70, 0.32, "triangle");
        break;
      case "collapse":
        this.note(110, 35, 0.45, "triangle");
        break;
      case "bounce":
        this.note(280, 700, 0.2);
        break;
      case "start":
        this.note(620, 920, 0.25, "triangle");
        break;
      case "finish":
        [440, 554, 659, 880].forEach((n, i) => this.note(n, n, 0.3, "triangle", i * 0.12));
        break;
    }
  }
  destroy() {
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
  }
}
