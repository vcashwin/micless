import { useState } from "react";
import type { Attempt, TranscribeFailed, TranscribeOk } from "../api/transcribe.ts";
import { Button } from "./design/atoms/Button/Button";
import { Icon } from "./design/atoms/Icon/Icon";
import { AUDIO_RATE } from "./recording.ts";
import { encodeWav } from "./wav.ts";
import s from "./App.module.css";

type Job =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; result: TranscribeOk }
  | { kind: "failed"; message: string };

/** Sends audio to Whisper (through this site's /api/transcribe) and shows what came back, which model answered, or why it failed */
export function Transcription({ audio, label, truth, empty }: {
  /** Builds the 16 kHz audio when the button is pressed; an empty array means there is nothing to send yet */
  audio: () => Float32Array;
  label: string;
  /** The words that were actually said, to mark what Whisper got wrong */
  truth?: string;
  /** Shown instead of sending when `audio` comes back empty */
  empty: string;
}) {
  const [job, setJob] = useState<Job>({ kind: "idle" });
  const run = async () => {
    const samples = audio();
    if (!samples.length) return setJob({ kind: "failed", message: empty });
    setJob({ kind: "sending" });
    try {
      const res = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: encodeWav(samples, AUDIO_RATE) });
      const body = (await res.json().catch(() => null)) as TranscribeOk | TranscribeFailed | null;
      if (body && "text" in body) setJob({ kind: "done", result: body });
      else setJob({ kind: "failed", message: body?.error ?? `The transcription service answered ${res.status}.` });
    } catch {
      setJob({ kind: "failed", message: "Couldn't reach the transcription service. Check your connection and try again." });
    }
  };
  return (
    <div className={s.transcription}>
      <Button variant="primary" size="large" stretched onClick={run} disabled={job.kind === "sending"} icon={<Icon name="Sound" />}>
        {job.kind === "sending" ? "Whisper is listening…" : job.kind === "idle" ? label : "Transcribe again"}
      </Button>
      {job.kind === "done" ? (
        <div className={s.result}>
          <HeardWords text={job.result.text} truth={truth} />
          <p className={s.small}>
            {job.result.model}{job.result.skipped.length ? ` · ${job.result.skipped.map(skipNote).join(", ")}` : ""}
          </p>
        </div>
      ) : null}
      {job.kind === "failed" ? <p className={s.error} role="alert"><Icon name="Alert" size={14} color="redText" />{job.message}</p> : null}
    </div>
  );
}

const skipNote = (a: Attempt) => `${a.model.replace("whisper-large-v3-", "").replace("whisper-large-v3", "large-v3")} ${a.status === 429 ? "was at its limit" : `failed (${a.status || "no answer"})`}`;

const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");
/** Whisper's words, those not in `truth` struck through; "you" alone is how Whisper answers noise */
export function HeardWords({ text, truth }: { text: string; truth?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || /^(you|thank you)\.?$/i.test(text.trim()))
    return <p className={s.transcript} data-empty>Nothing. <span className={s.muted}>{words.length ? `(Whisper said “${text.trim()}”, its answer to noise.)` : ""}</span></p>;
  const want = truth ? new Set(truth.split(/\s+/).map(norm)) : null;
  return <p className={s.transcript}>{words.map((w, i) => <span key={i} data-wrong={want && !want.has(norm(w)) ? true : undefined}>{w} </span>)}</p>;
}
