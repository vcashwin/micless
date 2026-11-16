import type { Dsp } from "./dsp.ts";

/**
 * What a motion sensor would record of a sentence played to it slowed down, then sped back up: the video's experiment.
 *
 * Slowing by K divides every frequency by K. A sensor sampling at R sees up to R/2 Hz, so back in the sentence's own
 * time it keeps everything below K·R/2 Hz. That is all this models: the sensor's band limit plus its noise. It assumes the
 * speaker can play the slowed sound and the sensor responds flat up to R/2, which flatters every real device.
 */
export type Experiment = { sensorRate: number; slowdown: number };

/** Sensor noise relative to the signal's RMS (−20 dB). The video's rebuilt audio was this noisy or worse. */
const NOISE = 0.1;

export function simulate(dsp: Dsp, audio: Float32Array, audioRate: number, { sensorRate, slowdown }: Experiment): Float32Array {
  const effectiveRate = sensorRate * slowdown;
  if (effectiveRate >= audioRate) return audio.slice();
  const heard = dsp.resample(audio, audioRate, effectiveRate);
  const rms = Math.sqrt(audio.reduce((s, v) => s + v * v, 0) / audio.length);
  let seed = 1;
  // ponytail: uniform noise from a fixed-seed LCG, so a given experiment always sounds the same
  for (let i = 0; i < heard.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    heard[i] += (seed / 2 ** 32 - 0.5) * 2 * Math.sqrt(3) * NOISE * rms;
  }
  return dsp.resample(heard, effectiveRate, audioRate);
}

/** Highest frequency of the original sentence that survives (Hz) */
export const keptBand = ({ sensorRate, slowdown }: Experiment) => (sensorRate / 2) * slowdown;

/** Speech is intelligible from about 300 to 3,400 Hz (the telephone band) */
export const SPEECH = { low: 300, high: 3400 } as const;

/** The slowdown that fits the whole speech band under the sensor's limit */
export const slowdownToFit = (sensorRate: number) => Math.ceil(SPEECH.high / (sensorRate / 2));
