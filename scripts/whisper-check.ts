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
import { decodeWav, encodeWav } from "../src/wav.ts";

const root = new URL("..", import.meta.url).pathname;
const model = process.env.WHISPER_MODEL ?? join(process.env.HOME!, ".cache/whisper.cpp/ggml-large-v3-turbo.bin");
const dsp = await loadDsp(readFileSync(join(root, "public/dsp.wasm")));

const audio = decodeWav(readFileSync(join(root, "public/one-small-step.wav")));

const dir = mkdtempSync(join(tmpdir(), "micless-"));
const heard: Record<string, string> = {};
for (const sensor of SENSORS) for (const slowdown of SLOWDOWNS) {
  const file = join(dir, `${sensor.id}-${slowdown}.wav`);
  writeFileSync(file, encodeWav(simulate(dsp, audio, 16000, { sensorRate: sensor.rate, slowdown }), 16000));
  const text = execFileSync("whisper-cli", ["-m", model, "-f", file, "-nt", "-np", "-l", "en"], { encoding: "utf8" }).trim().replace(/\s+/g, " ");
  heard[`${sensor.id}@${slowdown}`] = text;
  console.log(`${sensor.id} ${slowdown}x: ${text}`);
}
writeFileSync(join(root, "src/heard.json"), JSON.stringify(heard, null, 2) + "\n");
