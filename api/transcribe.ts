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
/** Vercel caps a function's request body at 4.5 MB; 4 MB of 16 kHz 16-bit audio is about 2 minutes */
const MAX_BYTES = 4 * 1024 * 1024;

const json = (body: TranscribeOk | TranscribeFailed, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  // ponytail: same-origin check and a size cap only; per-visitor rate limits need a store (e.g. Upstash) if the endpoint gets abused
  const origin = request.headers.get("origin"), host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return json({ error: "Transcription only answers this site's own page.", attempts: [] }, 403);
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: "Transcription isn't set up on this deployment: GROQ_API_KEY is missing.", attempts: [] }, 503);
  const audio = await request.arrayBuffer();
  if (audio.byteLength < 44 || audio.byteLength > MAX_BYTES) return json({ error: `The audio must be a WAV between 44 bytes and ${MAX_BYTES / 1024 / 1024} MB.`, attempts: [] }, 413);

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
      res = await fetch(GROQ, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
    } catch (e) {
      attempts.push({ model, status: 0, message: `Couldn't reach Groq: ${(e as Error).message}` });
      continue;
    }
    if (res.ok) {
      const body = (await res.json()) as { text?: string };
      return json({ text: (body.text ?? "").trim(), model, skipped: attempts }, 200);
    }
    const detail = await res.json().then((b: { error?: { message?: string } }) => b.error?.message, () => undefined);
    const retry = Number(res.headers.get("retry-after"));
    attempts.push({ model, status: res.status, message: detail ?? res.statusText, ...(retry > 0 ? { retryAfter: retry } : {}) });
    // A rate limit or an overloaded model is the model's problem: try the next one. Anything else (bad key, bad audio) would fail there too.
    if (res.status !== 429 && res.status < 500) break;
  }
  return json({ error: explain(attempts), attempts }, attempts.some(a => a.status === 429) ? 429 : 502);
}

function explain(attempts: Attempt[]): string {
  const last = attempts[attempts.length - 1];
  if (attempts.length && attempts.every(a => a.status === 429)) {
    const wait = Math.min(...attempts.map(a => a.retryAfter ?? Infinity));
    return `Both Whisper models are at their Groq rate limit${Number.isFinite(wait) ? `. Try again in ${Math.ceil(wait)} s` : ". Try again in a minute"}.`;
  }
  if (last?.status === 401) return "Groq refused the API key (401). The key on this deployment needs replacing.";
  return `Whisper failed: ${last ? `${last.model} answered ${last.status || "nothing"}: ${last.message}` : "no model was tried"}.`;
}
