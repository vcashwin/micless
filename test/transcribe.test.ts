import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { overLimit, PER_MINUTE, POST } from "../api/transcribe.ts";
import { encodeWav } from "../src/wav.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; delete process.env.GROQ_API_KEY; });

/** Groq stand-in: answers each model with the given status, and records which models were asked */
function groq(answers: Record<string, { status: number; text?: string; retryAfter?: number }>) {
  const asked: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const model = (init.body as FormData).get("model") as string;
    asked.push(model);
    const a = answers[model];
    return a.status === 200
      ? new Response(JSON.stringify({ text: a.text }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: `status ${a.status}` } }), { status: a.status, headers: a.retryAfter ? { "retry-after": String(a.retryAfter) } : {} });
  }) as typeof fetch;
  return asked;
}

let visitor = 0;
const call = (origin = "https://micless-app.vercel.app") => POST(new Request("https://micless-app.vercel.app/api/transcribe", {
  method: "POST", headers: { origin, host: "micless-app.vercel.app", "x-real-ip": `10.0.0.${++visitor}` }, body: encodeWav(new Float32Array(1600), 16000),
}));

test("turbo answers when it can", async () => {
  process.env.GROQ_API_KEY = "k";
  const asked = groq({ "whisper-large-v3-turbo": { status: 200, text: " one small step " } });
  const res = await call();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: "one small step", model: "whisper-large-v3-turbo", skipped: [] });
  assert.deepEqual(asked, ["whisper-large-v3-turbo"]);
});

test("a rate-limited turbo hands the audio to large-v3", async () => {
  process.env.GROQ_API_KEY = "k";
  groq({ "whisper-large-v3-turbo": { status: 429, retryAfter: 12 }, "whisper-large-v3": { status: 200, text: "giant leap" } });
  const body = await (await call()).json();
  assert.equal(body.model, "whisper-large-v3");
  assert.equal(body.text, "giant leap");
  assert.equal(body.skipped[0].status, 429);
});

test("both models rate limited says when to try again", async () => {
  process.env.GROQ_API_KEY = "k";
  groq({ "whisper-large-v3-turbo": { status: 429, retryAfter: 30 }, "whisper-large-v3": { status: 429, retryAfter: 7 } });
  const res = await call();
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /Both Whisper models are at their Groq rate limit\. Try again in 7 s/);
});

test("a refused key is not retried on the other model", async () => {
  process.env.GROQ_API_KEY = "k";
  const asked = groq({ "whisper-large-v3-turbo": { status: 401 }, "whisper-large-v3": { status: 200, text: "x" } });
  const res = await call();
  assert.match((await res.json()).error, /refused the API key/);
  assert.deepEqual(asked, ["whisper-large-v3-turbo"]);
});

test("other sites, a missing key and files that aren't WAV are turned away before Groq is called", async () => {
  const asked = groq({});
  assert.equal((await call()).status, 503);
  process.env.GROQ_API_KEY = "k";
  assert.equal((await call("https://evil.example")).status, 403);
  assert.equal((await call("null")).status, 403);
  const notWav = await POST(new Request("https://micless-app.vercel.app/api/transcribe", {
    method: "POST", headers: { origin: "https://micless-app.vercel.app", host: "micless-app.vercel.app" }, body: new Uint8Array(4096) }));
  assert.equal(notWav.status, 413);
  assert.deepEqual(asked, []);
});

test("a visitor gets PER_MINUTE transcriptions a minute, then waits", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < PER_MINUTE; i++) assert.equal(overLimit("1.2.3.4", t0 + i), false);
  assert.equal(overLimit("1.2.3.4", t0 + 10), true);
  assert.equal(overLimit("5.6.7.8", t0 + 10), false);
  assert.equal(overLimit("1.2.3.4", t0 + 61_000), false);
});

test("an overloaded turbo (498) also hands the audio to large-v3", async () => {
  process.env.GROQ_API_KEY = "k";
  groq({ "whisper-large-v3-turbo": { status: 498 }, "whisper-large-v3": { status: 200, text: "ok" } });
  assert.equal((await (await call()).json()).model, "whisper-large-v3");
});
