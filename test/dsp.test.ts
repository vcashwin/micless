import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadDsp } from "../src/dsp.ts";

const dsp = await loadDsp(readFileSync(new URL("../public/dsp.wasm", import.meta.url)));

const sine = (hz: number, fs: number, n: number, phase = 0) =>
  Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / fs + phase));
const rms = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
};
const db = (a: number, b: number) => 20 * Math.log10(a / b);

test("power spectrum peaks on the sine's bin", () => {
  const fs = 1000, n = 256, bin = 37;
  const p = dsp.powerSpectrum(sine((bin * fs) / n, fs, n));
  assert.equal(p.length, n / 2 + 1);
  assert.equal(p.indexOf(Math.max(...p)), bin);
});

test("lowpass at 100 Hz passes 20 Hz and cuts 1 kHz by > 40 dB", () => {
  const fs = 8000, n = 8000, tail = n / 2;
  const low = sine(20, fs, n), high = sine(1000, fs, n);
  assert.ok(Math.abs(db(rms(dsp.lowpass(low, fs, 100, 8), tail), rms(low, tail))) < 0.5);
  assert.ok(db(rms(dsp.lowpass(high, fs, 100, 8), tail), rms(high, tail)) < -40);
  assert.equal(low[1], Math.fround(Math.sin((2 * Math.PI * 20) / fs)), "input untouched");
});

test("highpass at 100 Hz passes 1 kHz and cuts 20 Hz by > 40 dB", () => {
  const fs = 8000, n = 8000, tail = n / 2;
  const low = sine(20, fs, n), high = sine(1000, fs, n);
  assert.ok(Math.abs(db(rms(dsp.highpass(high, fs, 100, 8), tail), rms(high, tail))) < 0.5);
  assert.ok(db(rms(dsp.highpass(low, fs, 100, 8), tail), rms(low, tail)) < -40);
});

test("resample keeps an in-band sine and drops an out-of-band one without aliasing", () => {
  const fs = 8000, n = 16000;
  const x = sine(50, fs, n);
  const back = dsp.resample(dsp.resample(x, fs, 200), 200, fs);
  assert.equal(back.length, n);
  const edge = 800;
  let xy = 0, xx = 0, yy = 0;
  for (let i = edge; i < n - edge; i++) (xy += x[i] * back[i]), (xx += x[i] * x[i]), (yy += back[i] * back[i]);
  assert.ok(xy / Math.sqrt(xx * yy) > 0.95, `correlation ${xy / Math.sqrt(xx * yy)}`);

  // 300 Hz aliases onto 100 Hz, the new Nyquist; at phase 0 plain decimation would hit only zero crossings.
  const hi = sine(300, fs, n, 1);
  const down = dsp.resample(hi, fs, 200);
  assert.equal(down.length, 400);
  assert.ok(rms(down, 20, 380) < 0.05 * rms(hi), `rms ratio ${rms(down, 20, 380) / rms(hi)}`);
});

test("resample 16000 -> 1.5 -> 16000 on 90k samples finishes well under a second", () => {
  const x = sine(0.5, 16000, 90000);
  const t0 = performance.now();
  const y = dsp.resample(dsp.resample(x, 16000, 1.5), 1.5, 16000);
  const ms = performance.now() - t0;
  console.log(`resample 16000->1.5->16000 (90k): ${ms.toFixed(1)} ms, ${y.length} samples`);
  assert.ok(ms < 500);
});
