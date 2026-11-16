import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadDsp } from "../src/dsp.ts";
import { describe as say, Listener, type Heard } from "../src/listen.ts";
import { Trace } from "../src/sensor.ts";

const dsp = await loadDsp(readFileSync(new URL("../public/dsp.wasm", import.meta.url)));
const RATE = 60;

/** Feeds `seconds` of a signal (z axis, m/s², on top of small noise) at 60 Hz, updating every 100 ms like the app */
function run(seconds: number, signal: (t: number) => number) {
  const trace = new Trace(), heard: Heard[] = [];
  const listener = new Listener(dsp, h => heard.push(h));
  let seed = 7, last = "";
  for (let i = 0; i < seconds * RATE; i++) {
    const t = i / RATE;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = (seed / 2 ** 32 - 0.5) * 0.004;
    trace.push(t * 1000, noise, noise * 0.5, 9.81 + noise + signal(t));
    if (i % 6 === 5) last = say(listener.update(trace, t * 1000).hearing);
  }
  return { heard: heard.map(h => h.text), last };
}

const after = (from: number, f: (t: number) => number) => (t: number) => (t >= from ? f(t) : 0);
const spike = (at: number) => (t: number) => (Math.abs(t - at) < 0.5 / RATE ? 1.5 : 0);

test("a still phone is quiet", () => {
  assert.equal(run(4, () => 0).last, "Quiet");
});

test("two knocks close together are a double tap, one is a tap", () => {
  assert.deepEqual(run(5, t => spike(3)(t) + spike(3.25)(t)).heard, ["Double tap"]);
  assert.deepEqual(run(5, spike(3)).heard, ["Tap"]);
});

test("a steady 20 Hz buzz is a vibration at 20 Hz", () => {
  const { last } = run(6, after(3, t => 0.3 * Math.sin(2 * Math.PI * 20 * t)));
  assert.match(last, /^Vibration · (19|20|21) Hz$/);
});

test("a buzz pulsing twice a second is a beat near 120 BPM", () => {
  const { last } = run(10, after(2, t => (t % 0.5 < 0.15 ? 0.4 * Math.sin(2 * Math.PI * 22 * t) : 0)));
  const bpm = Number(last.match(/Beat · (\d+) BPM/)?.[1]);
  assert.ok(bpm >= 116 && bpm <= 124, last);
});

test("tilting the phone slowly is moving, not sound", () => {
  assert.equal(run(6, after(2, t => 2 * Math.sin(2 * Math.PI * 1 * t))).last, "Moving");
});

test("music that starts after a double tap and then stops is heard as a tap, a sound and a beat, never as taps or moving", () => {
  const knocks = (t: number) => spike(2)(t) + spike(2.25)(t);
  const music = (t: number) => (t > 4 && t < 12 && t % 0.5 < 0.15 ? 0.4 * Math.sin(2 * Math.PI * 22 * t) : 0);
  const { heard } = run(14, t => knocks(t) + music(t));
  assert.deepEqual(heard, ["Double tap", "Vibration · 22 Hz", "Beat · 120 BPM"]);
});
