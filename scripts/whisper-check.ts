// Runs the slow-down experiment in simulation for each sensor and slowdown, and asks Whisper what it hears in the result.
// Writes src/heard.json, which the app shows next to each setting. Needs whisper-cli and a model (WHISPER_MODEL).
// Usage: node scripts/whisper-check.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDsp } from "../src/dsp.ts";
import { SENSORS, SLOWDOWNS } from "../src/experiments.ts";
import { simulate } from "../src/sim.ts";

const root = new URL("..", import.meta.url).pathname;
const model = process.env.WHISPER_MODEL ?? join(process.env.HOME!, ".cache/whisper.cpp/ggml-large-v3-turbo.bin");
const dsp = await loadDsp(readFileSync(join(root, "public/dsp.wasm")));

const wav = readFileSync(join(root, "public/one-small-step.wav"));
const dataAt = wav.indexOf("data") + 8;
const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + dataAt, wav.byteOffset + wav.length));
const audio = Float32Array.from(pcm, v => v / 32768);

const toWav = (x: Float32Array, rate: number) => {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  x.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return b;
};

const dir = mkdtempSync(join(tmpdir(), "micless-"));
const heard: Record<string, string> = {};
for (const sensor of SENSORS) for (const slowdown of SLOWDOWNS) {
  const file = join(dir, `${sensor.id}-${slowdown}.wav`);
  writeFileSync(file, toWav(simulate(dsp, audio, 16000, { sensorRate: sensor.rate, slowdown }), 16000));
  const text = execFileSync("whisper-cli", ["-m", model, "-f", file, "-nt", "-np", "-l", "en"], { encoding: "utf8" }).trim().replace(/\s+/g, " ");
  heard[`${sensor.id}@${slowdown}`] = text;
  console.log(`${sensor.id} ${slowdown}x: ${text}`);
}
writeFileSync(join(root, "src/heard.json"), JSON.stringify(heard, null, 2) + "\n");
