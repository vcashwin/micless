import type { Dsp } from "./dsp.ts";
import type { Trace } from "./sensor.ts";

export const AUDIO_RATE = 16000;
/** Longest audio sent to Whisper; the transcription endpoint takes about 2 minutes of 16 kHz WAV */
export const MAX_AUDIO_SECONDS = 120;

/**
 * Turns the sensor readings since `fromCount` into audio Whisper can take.
 * `speedup` undoes a slowdown: readings taken while a sentence was played K times slower are played back K times faster.
 * At 1× the result is the vibration as it happened: mostly below hearing, which is the point.
 */
export function sensorAudio(dsp: Dsp, trace: Trace, fromCount: number, speedup: number): Float32Array {
  const rate = trace.rate() || 60;
  const keep = Math.floor(MAX_AUDIO_SECONDS * speedup * rate);
  const n = Math.min(trace.count - fromCount, trace.capacity, keep);
  if (n < rate) return new Float32Array(0);
  // The axis that shook most, without gravity and handling (below 1 Hz)
  const axes = (["x", "y", "z"] as const).map(a => {
    const raw = trace.last(a, n);
    return dsp.highpass(raw.map(v => v - raw[0]), rate, 1, 2);
  });
  const energy = axes.map(a => a.reduce((s, v) => s + v * v, 0));
  const signal = axes[energy.indexOf(Math.max(...energy))];
  const peak = signal.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9);
  return dsp.resample(signal.map(v => (v / peak) * 0.9), rate * speedup, AUDIO_RATE);
}
