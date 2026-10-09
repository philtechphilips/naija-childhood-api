/**
 * Synthesised sound effects (Web Audio). No recorded samples, so nothing to
 * download and nothing copyrighted. The context is created lazily on the first
 * call, which always happens inside a user gesture (a tap on Play or a control).
 */
export type SfxName =
  | "clap"
  | "stomp"
  | "tick"
  | "perfect"
  | "good"
  | "miss"
  | "point"
  | "lose"
  | "win"
  | "whistle"
  | "caught"
  | "rescue"
  | "pickup"
  | "chalk"
  | "countdown"
  | "go"
  | "horn";

export interface Sfx {
  play(name: SfxName, volume?: number): void;
  /** The shared AudioContext (created on demand), for music that must stay in sync with effects. */
  context(): AudioContext | null;
  readonly enabled: boolean;
  /**
   * Final mix bus. Music, voices and ambience connect here (not to the
   * destination) so the sound toggle silences everything at once.
   */
  output(): AudioNode | null;
  /** Called whenever sound is switched on or off. Returns an unsubscribe. */
  onChange(cb: (enabled: boolean) => void): () => void;
  unlock(): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/** `makeContext` lets tools render effects offline (e.g. into an OfflineAudioContext for the trailer). */
export function createSfx(enabled: boolean, makeContext?: () => AudioContext): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let bus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let on = enabled;
  const listeners = new Set<(enabled: boolean) => void>();

  /** Creates the context (inside a user gesture) even while muted, so unmuting later just works. */
  const create = (): AudioContext | null => {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = makeContext ? makeContext() : new Ctor();
      bus = ctx.createGain();
      bus.gain.value = on ? 1 : 0;
      bus.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(bus);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };
  const ensure = (): AudioContext | null => (on ? create() : null);

  const tone = (freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) => {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  };

  const burst = (start: number, dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = "bandpass") => {
    if (!ctx || !master || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  };

  const recipes: Record<SfxName, (t: number, v: number) => void> = {
    clap: (t, v) => {
      // A hand clap is a few tightly spaced noise bursts.
      burst(t, 0.03, 1400, 1.2, 0.7 * v);
      burst(t + 0.012, 0.03, 1200, 1.2, 0.6 * v);
      burst(t + 0.024, 0.12, 1100, 0.9, 0.5 * v);
    },
    stomp: (t, v) => {
      tone(120, t, 0.16, "sine", 0.9 * v, 50);
      burst(t, 0.06, 300, 0.7, 0.35 * v, "lowpass");
    },
    tick: (t, v) => tone(1500, t, 0.05, "square", 0.08 * v),
    perfect: (t, v) => {
      tone(880, t, 0.12, "triangle", 0.35 * v);
      tone(1320, t + 0.06, 0.18, "triangle", 0.3 * v);
    },
    good: (t, v) => tone(660, t, 0.14, "triangle", 0.3 * v),
    miss: (t, v) => tone(220, t, 0.22, "sawtooth", 0.18 * v, 140),
    point: (t, v) => {
      tone(523, t, 0.1, "triangle", 0.3 * v);
      tone(784, t + 0.08, 0.16, "triangle", 0.3 * v);
    },
    lose: (t, v) => {
      tone(392, t, 0.14, "triangle", 0.28 * v);
      tone(294, t + 0.12, 0.24, "triangle", 0.28 * v);
    },
    win: (t, v) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.26, "triangle", 0.3 * v));
    },
    whistle: (t, v) => {
      // Referee/police whistle: a trilled high tone.
      if (!ctx || !master) return;
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 2900;
      lfo.frequency.value = 32;
      lfoGain.gain.value = 140;
      lfo.connect(lfoGain).connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.02);
      g.gain.setValueAtTime(0.22 * v, t + 0.32);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(g).connect(master);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 0.42);
      lfo.stop(t + 0.42);
    },
    caught: (t, v) => {
      tone(330, t, 0.12, "square", 0.12 * v, 200);
      burst(t, 0.08, 800, 1, 0.3 * v);
    },
    rescue: (t, v) => {
      [440, 554, 659].forEach((f, i) => tone(f, t + i * 0.06, 0.18, "triangle", 0.28 * v));
    },
    pickup: (t, v) => tone(988, t, 0.12, "sine", 0.3 * v, 1480),
    chalk: (t, v) => burst(t, 0.07, 3200, 2, 0.25 * v, "highpass"),
    countdown: (t, v) => tone(660, t, 0.12, "sine", 0.3 * v),
    go: (t, v) => tone(990, t, 0.3, "sine", 0.35 * v),
    horn: (t, v) => {
      // Two-tone danfo horn, beep-beep.
      for (const b of [0, 0.28]) {
        tone(415, t + b, 0.2, "square", 0.07 * v);
        tone(523, t + b, 0.2, "square", 0.06 * v);
      }
    },
  };

  return {
    play(name, volume = 1) {
      const c = ensure();
      if (!c) return;
      recipes[name](c.currentTime + 0.005, volume);
    },
    unlock() {
      create();
    },
    context() {
      return ensure();
    },
    output() {
      return bus;
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get enabled() {
      return on;
    },
    setEnabled(enabled) {
      if (enabled === on) return;
      on = enabled;
      // Fade the whole mix (effects, music, voices, ambience) rather than click.
      if (ctx && bus) bus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.04);
      if (on) create();
      for (const cb of listeners) cb(on);
    },
    dispose() {
      listeners.clear();
      void ctx?.close();
      ctx = null;
      master = null;
      bus = null;
    },
  };
}
