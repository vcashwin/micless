import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadDsp } from "../src/dsp.ts";
import { AUDIO_RATE, sensorAudio } from "../src/recording.ts";
import { Trace } from "../src/sensor.ts";

const dsp = await loadDsp(readFileSync(new URL("../public/dsp.wasm", import.meta.url)));

/** 20 s of a 10 Hz shake on the z axis, read 60 times a second */
function shaken() {
  const trace = new Trace();
  for (let i = 0; i < 20 * 60; i++) trace.push((i * 1000) / 60, 0, 0, 9.81 + 0.3 * Math.sin(2 * Math.PI * 10 * (i / 60)));
  return trace;
}

const peakHz = (x: Float32Array) => {
  const n = 4096, frame = x.subarray(Math.floor(x.length / 2) - n / 2, Math.floor(x.length / 2) + n / 2);
  const p = dsp.powerSpectrum(frame);
  return (p.indexOf(Math.max(...p)) * AUDIO_RATE) / n;
};

test("speeding the recording up 40 times turns a 10 Hz shake into a 400 Hz tone, 40 times shorter", () => {
  const audio = sensorAudio(dsp, shaken(), 0, 40);
  assert.ok(Math.abs(audio.length / AUDIO_RATE - 20 / 40) < 0.01, `${audio.length / AUDIO_RATE} s`);
  assert.ok(Math.abs(peakHz(audio) - 400) < 8, `${peakHz(audio)} Hz`);
});

test("at 1× the shake stays at 10 Hz and keeps its length", () => {
  const audio = sensorAudio(dsp, shaken(), 0, 1);
  assert.ok(Math.abs(audio.length / AUDIO_RATE - 20) < 0.05);
  assert.ok(Math.abs(peakHz(audio) - 10) < 8, `${peakHz(audio)} Hz`);
});

test("less than a second of readings gives no audio", () => {
  const trace = shaken();
  assert.equal(sensorAudio(dsp, trace, trace.count - 30, 1).length, 0);
});
