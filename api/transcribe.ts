/**
 * POST /api/transcribe: a 16 kHz mono WAV in the body, Whisper's transcript out, through Groq.
 * The only server code in Micless. It exists to keep GROQ_API_KEY out of the page.
 */

/** Tried in order: when one is rate limited or overloaded, the next one gets the same audio. Each model has its own Groq limits. */
export const MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"] as const;

export type Attempt = { model: string; status: number; message: string; retryAfter?: number };
export type TranscribeOk = { text: string; model: string; skipped: Attempt[] };
export type TranscribeFailed = { error: string; attempts: Attempt[] };

const GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";
/** Per model, so both tries fit in the function's time limit */
const GROQ_TIMEOUT_MS = 20_000;
/** Vercel caps a function's request body at 4.5 MB; 4 MB of 16 kHz 16-bit audio is about 2 minutes */
const MAX_BYTES = 4 * 1024 * 1024;

const json = (body: TranscribeOk | TranscribeFailed, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const host = request.headers.get("host");
  if (!host || hostOf(request.headers.get("origin")) !== host) return json({ error: "Transcription only answers this site's own page.", attempts: [] }, 403);
  if (overLimit(request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?", Date.now()))
    return json({ error: `That's ${PER_MINUTE} transcriptions in a minute from here. Wait a minute and try again.`, attempts: [] }, 429);
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: "Transcription isn't set up on this deployment: GROQ_API_KEY is missing.", attempts: [] }, 503);
  const audio = await request.arrayBuffer();
  if (audio.byteLength < 44 || audio.byteLength > MAX_BYTES || !isWav(audio)) return json({ error: `The audio must be a WAV of at most ${MAX_BYTES / 1024 / 1024} MB.`, attempts: [] }, 413);

  const attempts: Attempt[] = [];
  for (const model of MODELS) {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/wav" }), "sensor.wav");
    form.append("model", model);
    form.append("language", "en");
    form.append("response_format", "json");
    form.append("temperature", "0");
    let res: Response;
    try {
      res = await fetch(GROQ, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(GROQ_TIMEOUT_MS) });
    } catch (e) {
      attempts.push({ model, status: 0, message: (e as Error).name === "TimeoutError" ? `no answer in ${GROQ_TIMEOUT_MS / 1000} s` : `couldn't reach Groq (${(e as Error).message})` });
      continue;
    }
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { text?: string } | null;
      if (typeof body?.text === "string") return json({ text: body.text.trim(), model, skipped: attempts }, 200);
      attempts.push({ model, status: 502, message: "answered without a transcript" });
      continue;
    }
    const detail = await res.json().then((b: { error?: { message?: string } }) => b.error?.message, () => undefined);
    const retry = Number(res.headers.get("retry-after"));
    attempts.push({ model, status: res.status, message: detail ?? res.statusText, ...(retry > 0 ? { retryAfter: retry } : {}) });
    // A rate limit (429), Groq's "over capacity" (498) or a server error is the model's problem: try the next one.
    // Anything else (bad key, bad audio) would fail there too.
    if (res.status !== 429 && res.status !== 498 && res.status < 500) break;
  }
  return json({ error: explain(attempts), attempts }, attempts.some(a => a.status === 429) ? 429 : 502);
}

/** Requests per visitor per minute, so one visitor can't use up Groq's 20 a minute for everyone */
export const PER_MINUTE = 6;
const recent = new Map<string, number[]>();
/**
 * ponytail: counts live in this function instance's memory, so they reset on a cold start and each instance counts alone.
 * A Vercel Firewall rate-limit rule on /api/transcribe (or a shared store) is the real limit.
 */
export function overLimit(ip: string, now: number): boolean {
  const times = (recent.get(ip) ?? []).filter(t => now - t < 60_000);
  if (recent.size > 10_000) recent.clear();
  recent.set(ip, [...times, now]);
  return times.length >= PER_MINUTE;
}

function hostOf(origin: string | null) {
  try { return origin ? new URL(origin).host : null; } catch { return null; }
}

const isWav = (b: ArrayBuffer) => {
  const t = new TextDecoder().decode(new Uint8Array(b, 0, 12));
  return t.startsWith("RIFF") && t.endsWith("WAVE");
};

function explain(attempts: Attempt[]): string {
  const last = attempts[attempts.length - 1];
  if (attempts.length && attempts.every(a => a.status === 429)) {
    const wait = Math.min(...attempts.map(a => a.retryAfter ?? Infinity));
    return `Both Whisper models are at their Groq rate limit${Number.isFinite(wait) ? `. Try again in ${Math.ceil(wait)} s` : ". Try again in a minute"}.`;
  }
  if (last?.status === 401) return "Groq refused the API key (401). The key on this deployment needs replacing.";
  return `Whisper failed: ${last ? `${last.model} answered ${last.status || "nothing"}: ${last.message}` : "no model was tried"}.`;
}
