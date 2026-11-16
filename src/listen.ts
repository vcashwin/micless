import type { Dsp } from "./dsp.ts";
import type { Trace } from "./sensor.ts";

/** What the sensor can honestly tell apart at ~60 readings a second. Words are not on the list: see the Words tab. */
export type Hearing =
  | { kind: "quiet" }
  | { kind: "tap"; count: number }
  | { kind: "beat"; bpm: number }
  | { kind: "vibration"; hz: number }
  | { kind: "moving" };

export type Heard = { id: number; at: number; text: string; kind: Hearing["kind"] };

export type Snapshot = {
  rate: number;
  /** 0..1, how loud the vibration is against the quietest moment seen (the bars) */
  level: number;
  hearing: Hearing;
  /** Power per bin of the last second, all three axes added, for the spectrogram */
  spectrum: Float32Array;
};

/**
 * Calibration. Measured nowhere yet but in a browser-faked trace: tune on real phones.
 * ponytail: fixed thresholds over an adaptive floor; per-device calibration (a "tap twice to calibrate" step) if they misfire.
 */
const TUNING = {
  /** Jerk (m/s² change between two readings) a tap must reach, and its multiple of the quiet floor */
  tapMin: 0.35, tapOverFloor: 8,
  /** A second tap within this many ms makes a double tap */
  multiTapMs: 450, tapRefractoryMs: 90,
  /** Vibration band starts here (Hz); handling and walking live below motionMax */
  vibrationFrom: 6, motionMax: 5,
  /** Sustained vibration: this many times the floor, for this long */
  vibrationOverFloor: 4, loudShare: 0.25, sustainMs: 350,
  motionMin: 0.02,
  /** Beat: autocorrelation of the vibration envelope at least this strong, tempo in this range */
  beatMinCorrelation: 0.45, beatMinSwing: 0.3, bpmRange: [60, 180] as const,
};

const FFT = 64;
/** Seconds of vibration envelope the beat detector looks at: long enough for 3 beats at 60 BPM, short enough to forget the silence before the music */
const BEAT_SECONDS = 4;
const DB_RANGE = 20;

export class Listener {
  private floor = Infinity;
  private smoothed = 0;
  private taps: number[] = [];
  private lastSample = 0;
  private loudSince: number | null = null;
  private shown: Hearing = { kind: "quiet" };
  private shownUntil = 0;
  private nextId = 1;
  /** Jerk energy per reading over the last BEAT_SECONDS, for the beat detector */
  private envelope: number[] = [];

  private dsp: Dsp;
  private onHeard: (h: Heard) => void;

  constructor(dsp: Dsp, onHeard: (h: Heard) => void) { this.dsp = dsp; this.onHeard = onHeard; }

  update(trace: Trace, now: number): Snapshot {
    const rate = trace.rate() || 60;
    const fresh = Math.min(trace.count - this.lastSample, 256);
    this.lastSample = trace.count;

    const n = Math.min(trace.count, FFT + fresh + 1);
    const x = trace.last("x", n), y = trace.last("y", n), z = trace.last("z", n);
    const jerk = (i: number) => Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1], z[i] - z[i - 1]);

    for (let i = n - fresh; i < n; i++) {
      if (i < 1) continue;
      const j = jerk(i);
      this.envelope.push(j * j);
      const t = now - ((n - 1 - i) * 1000) / rate;
      const last = this.taps[this.taps.length - 1] ?? -Infinity;
      if (j > Math.max(TUNING.tapMin, this.floor * TUNING.tapOverFloor) && t - last > TUNING.tapRefractoryMs) this.taps.push(t);
    }
    const keep = Math.round(rate * BEAT_SECONDS);
    if (this.envelope.length > keep) this.envelope.splice(0, this.envelope.length - keep);

    const spectrum = new Float32Array(FFT / 2 + 1);
    if (trace.count >= FFT) for (const axis of [x, y, z]) {
      const frame = axis.slice(n - FFT, n);
      const mean = frame.reduce((s, v) => s + v, 0) / FFT;
      const p = this.dsp.powerSpectrum(frame.map(v => v - mean));
      for (let k = 0; k < p.length; k++) spectrum[k] += p[k];
    }
    const hz = (k: number) => (k * rate) / FFT;
    let motion = 0, vibration = 0, peak = 0, peakK = 0;
    for (let k = 1; k < spectrum.length; k++) {
      if (hz(k) <= TUNING.motionMax) motion += spectrum[k];
      if (hz(k) >= TUNING.vibrationFrom) { vibration += spectrum[k]; if (spectrum[k] > peak) { peak = spectrum[k]; peakK = k; } }
    }

    // Short-window jerk RMS drives the bars and the floor (the quietest the phone has been)
    const recent = this.envelope.slice(-Math.max(3, Math.round(rate * 0.15)));
    const rms = Math.sqrt(recent.reduce((s, v) => s + v, 0) / Math.max(1, recent.length));
    this.floor = Math.min(this.floor * 1.002, Math.max(rms, 1e-4));
    const db = 20 * Math.log10(Math.max(rms, 1e-6) / this.floor);
    this.smoothed = 0.85 * this.smoothed + 0.15 * Math.min(1, Math.max(0, db / DB_RANGE));

    // Loud for a good share of the last second: the gaps between beats don't reset it, and a lone knock doesn't count
    const second = this.envelope.slice(-Math.round(rate));
    const over = (this.floor * TUNING.vibrationOverFloor) ** 2;
    const loud = second.filter(v => v > over).length >= TUNING.loudShare * second.length;
    this.loudSince = loud ? this.loudSince ?? now : null;
    const sustained = this.loudSince != null && now - this.loudSince >= TUNING.sustainMs;

    const hearing = this.decide(now, { sustained, motion, vibration, peakHz: hz(peakK), rate });
    return { rate, level: this.smoothed, hearing, spectrum };
  }

  private decide(now: number, f: { sustained: boolean; motion: number; vibration: number; peakHz: number; rate: number }): Hearing {
    // Jolts inside a sustained sound are the sound, not taps
    if (f.sustained) this.taps = [];
    // Taps settle once no further tap can join them; until then the knock's broad jolt says nothing else
    const lastTap = this.taps[this.taps.length - 1];
    if (lastTap != null && now - lastTap <= TUNING.multiTapMs) return this.shown;
    if (lastTap != null) {
      const count = this.taps.length;
      this.taps = [];
      if (!f.sustained) return this.show({ kind: "tap", count }, now, 900);
    }
    if (now < this.shownUntil) return this.shown;
    if (f.sustained && f.vibration > f.motion) {
      const bpm = beat(this.envelope, f.rate);
      if (bpm) return this.show({ kind: "beat", bpm }, now);
      return this.show({ kind: "vibration", hz: Math.round(f.peakHz) }, now);
    }
    if (f.motion > TUNING.motionMin && f.motion > f.vibration) return this.show({ kind: "moving" }, now);
    return this.show({ kind: "quiet" }, now);
  }

  private show(h: Hearing, now: number, holdMs = 0): Hearing {
    if (h.kind !== this.shown.kind || h.kind === "tap") {
      if (h.kind !== "quiet") this.onHeard({ id: this.nextId++, at: now, text: describe(h), kind: h.kind });
    }
    this.shown = h;
    this.shownUntil = now + holdMs;
    return h;
  }
}

/** Tempo from the autocorrelation of the vibration envelope, or null when nothing repeats */
export function beat(envelope: number[], rate: number): number | null {
  if (envelope.length < rate * 3) return null;
  // Average over 100 ms first: a steady buzz then reads flat instead of repeating every few readings
  const w = Math.max(1, Math.round(rate * 0.1));
  const smooth = envelope.slice(w - 1).map((_, i) => envelope.slice(i, i + w).reduce((s, v) => s + v, 0) / w);
  const mean = smooth.reduce((s, v) => s + v, 0) / smooth.length;
  const e = smooth.map(v => v - mean);
  const energy = e.reduce((s, v) => s + v * v, 0);
  // A beat has to pulse: the envelope must swing by a good part of its mean
  if (Math.sqrt(energy / e.length) < TUNING.beatMinSwing * mean) return null;
  const [lo, hi] = TUNING.bpmRange;
  const corr = (lag: number) => { let c = 0; for (let i = lag; i < e.length; i++) c += e[i] * e[i - lag]; return c / energy; };
  let best = 0, bestLag = 0;
  for (let lag = Math.round((rate * 60) / hi); lag <= Math.round((rate * 60) / lo); lag++) {
    const c = corr(lag);
    if (c > best) { best = c; bestLag = lag; }
  }
  // A real tempo is a peak; a sound that just started or stopped correlates best at the shortest lag and falls away
  const peak = corr(bestLag) > corr(bestLag - 1) && corr(bestLag) > corr(bestLag + 1);
  return peak && best >= TUNING.beatMinCorrelation ? Math.round((rate * 60) / bestLag) : null;
}

export function describe(h: Hearing): string {
  switch (h.kind) {
    case "quiet": return "Quiet";
    case "tap": return h.count === 1 ? "Tap" : h.count === 2 ? "Double tap" : `${h.count} taps`;
    case "beat": return `Beat · ${h.bpm} BPM`;
    case "vibration": return `Vibration · ${h.hz} Hz`;
    case "moving": return "Moving";
  }
}
