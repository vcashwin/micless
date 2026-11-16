import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./design/atoms/Button/Button";
import { Icon } from "./design/atoms/Icon/Icon";
import { SegmentedControl } from "./design/atoms/SegmentedControl/SegmentedControl";
import type { Dsp } from "./dsp.ts";
import { REAL_SLOWDOWNS, SENSORS, SLOWDOWNS, type SensorId } from "./experiments.ts";
import heard from "./heard.json";
import { keptBand, simulate, SPEECH } from "./sim.ts";
import { decodeWav, encodeWav } from "./wav.ts";
import { Wave } from "./viz.tsx";
import { HeardWords, Transcription } from "./Transcription.tsx";
import s from "./App.module.css";

const RATE = 16000;
const SENTENCE = "That's one small step for man, one giant leap for mankind.";
/** Seconds of the slowed sentence the preview plays */
const PREVIEW = 8;

export function Words({ dsp }: { dsp: Dsp | null }) {
  const [sensorId, setSensorId] = useState<SensorId>("phone");
  const [slowdown, setSlowdown] = useState<number>(40);
  const [audio, setAudio] = useState<Float32Array | null>(null);
  const sensor = SENSORS.find(x => x.id === sensorId)!;

  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/one-small-step.wav").then(r => { if (!r.ok) throw new Error(r.statusText); return r.arrayBuffer(); })
      .then(b => setAudio(decodeWav(new Uint8Array(b))), () => setFailed(true));
  }, []);

  const rebuilt = useMemo(() => (dsp && audio ? simulate(dsp, audio, RATE, { sensorRate: sensor.rate, slowdown }) : null), [dsp, audio, sensor.rate, slowdown]);
  const slowedPreview = useMemo(() => {
    if (!dsp || !audio) return null;
    const take = audio.subarray(0, Math.min(audio.length, Math.round((PREVIEW * RATE) / slowdown)));
    return dsp.resample(take, RATE / slowdown, RATE);
  }, [dsp, audio, slowdown]);

  const seconds = audio ? audio.length / RATE : 5.85;
  const kept = keptBand({ sensorRate: sensor.rate, slowdown });
  const exactAt = firstExact(sensorId);
  const transcript = (heard as Record<string, string>)[`${sensorId}@${slowdown}`] ?? "";

  return (
    <section className={s.stack}>
      <div className={s.intro}>
        <h2>Can a motion sensor hear words?</h2>
        <p className={s.muted}>
          Speech you can understand lives between {SPEECH.low} and {SPEECH.high.toLocaleString()} Hz. {sensor.name} feels only up to {sensor.rate / 2} Hz.
          The trick from the MacBook experiment: slow the sentence down until it fits, play it to the sensor, then speed the recording back up.
        </p>
      </div>

      <div className={s.card}>
        <div className={s.caption}>Sensor</div>
        <SegmentedControl fullWidth aria-label="Sensor" value={sensorId} onValueChange={v => setSensorId(v as SensorId)}
          options={SENSORS.map(x => ({ value: x.id, text: x.tab }))} />
        <p className={s.small}>{sensor.note}.</p>
        <div className={s.caption}>Slow the sentence down</div>
        <SegmentedControl fullWidth className={s.tight} aria-label="Slowdown" value={String(slowdown)} onValueChange={v => setSlowdown(Number(v))}
          options={SLOWDOWNS.map(k => ({ value: String(k), text: `${k}×` }))} />
        <Bands sensorTop={sensor.rate / 2} slowdown={slowdown} />
        <dl className={s.facts}>
          <div><dt>Playing time</dt><dd>{duration(seconds * slowdown)}</dd></div>
          <div><dt>Voice kept</dt><dd>{kept >= RATE / 2 ? "All of it" : `Up to ${Math.round(kept).toLocaleString()} Hz`}</dd></div>
        </dl>
      </div>

      <div className={s.card}>
        <div className={s.caption}><span>What Whisper heard</span><span className={s.meta}>on the rebuilt audio, ahead of time</span></div>
        <HeardWords text={transcript} truth={SENTENCE} />
        {rebuilt ? (
          <Transcription key={`${sensorId}@${slowdown}`} audio={() => rebuilt} label="Run Whisper on it now" truth={SENTENCE} empty="There is no audio to send." />
        ) : null}
        {audio && rebuilt && slowedPreview ? (
          <div className={s.clips}>
            <Clip title="Original" detail={`Apollo 11 · ${seconds.toFixed(1)} s`} samples={audio} color="orange-base" />
            <Clip title={`Slowed ${slowdown}×, as played`} detail={`first ${PREVIEW} s of ${duration(seconds * slowdown)}`} samples={slowedPreview} color="orange-mid" />
            <Clip title="Rebuilt from the sensor" detail="sped back up" samples={rebuilt} color="blue-base" />
          </div>
        ) : <p className={s.muted}>{failed ? "The sentence didn't load. Reload the page to try again." : "Loading the sentence…"}</p>}
      </div>

      <div className={s.card}>
        <div className={s.caption}>Try it for real</div>
        <ol className={s.points}>
          <li>Open this page on a laptop too, and lay your phone on the laptop, next to its speakers.</li>
          <li>On the phone, tap <strong>Listen › Start listening</strong>.</li>
          <li>On the laptop, play the slowed sentence below, all of it.</li>
          <li>On the phone, tap <strong>Stop listening</strong>, pick {slowdown}× under "Transcribe what it felt" and transcribe.</li>
        </ol>
        {!(REAL_SLOWDOWNS as readonly number[]).includes(slowdown) ? (
          <p className={s.small}>Pick a slowdown from {REAL_SLOWDOWNS[0]}× to {REAL_SLOWDOWNS[REAL_SLOWDOWNS.length - 1]}× above to try it: the phone keeps 9 minutes of readings.</p>
        ) : dsp && audio ? (
          <>
            <PlayFull key={slowdown} dsp={dsp} audio={audio} slowdown={slowdown} seconds={seconds} />
            <p className={s.small}>Expect little: laptop speakers barely play below 80 Hz, and at {slowdown}× the sentence sits at {Math.round(SPEECH.low / slowdown)} to {Math.round(SPEECH.high / slowdown)} Hz. That is the experiment.</p>
          </>
        ) : null}
      </div>

      <div className={s.card}>
        <div className={s.caption}>So can your phone listen?</div>
        <ul className={s.points}>
          <li>Talking at it, no: at 1× Whisper hears nothing. The video found the same with a MacBook, even with a chin on the palm rest.</li>
          <li>
            Slowed {exactAt}× it can, on paper: that is where Whisper first gets every word. But the {seconds.toFixed(1)} s sentence then takes {duration(seconds * exactAt)} to
            play, at {Math.round(SPEECH.low / exactAt)} to {Math.round(SPEECH.high / exactAt)} Hz. {sensor.speaker}
          </li>
          <li>Browsers cap motion sensors near 60 readings a second on purpose, to stop pages listening this way. A device worn on the skull, with a fast sensor and your voice carried by bone, is a different story.</li>
        </ul>
        <p className={s.small}>The rebuilt clip is a simulation: the sentence filtered to what the chosen sensor can feel at that slowdown, plus sensor noise, computed in WebAssembly on this page. It assumes the speaker and sensor are perfect, which flatters both. Whisper large-v3-turbo transcribed each setting ahead of time (the script is in the repo); "Run Whisper on it now" sends the rebuilt clip to Whisper through Groq.</p>
      </div>
    </section>
  );
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");
/** The smallest slowdown at which Whisper heard the sentence word for word */
const firstExact = (sensor: SensorId) => SLOWDOWNS.find(k => {
  const text = (heard as Record<string, string>)[`${sensor}@${k}`] ?? "";
  return text.split(/\s+/).map(norm).join(" ") === SENTENCE.split(/\s+/).map(norm).join(" ");
}) ?? SLOWDOWNS[SLOWDOWNS.length - 1];

function duration(sec: number) {
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const m = Math.floor(sec / 60), r = Math.round(sec % 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}

const LOG_MIN = Math.log10(1), LOG_MAX = Math.log10(8000);
const pos = (hz: number) => `${((Math.log10(Math.max(1, hz)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100}%`;

/** Where speech, slowed speech and the sensor sit on a log frequency axis */
function Bands({ sensorTop, slowdown }: { sensorTop: number; slowdown: number }) {
  const lo = SPEECH.low / slowdown, hi = SPEECH.high / slowdown;
  const fits = hi <= sensorTop;
  const row = (label: string, from: number, to: number, kind: string) => (
    <div className={s.bandRow}>
      <span className={s.bandLabel}>{label}</span>
      <span className={s.bandTrack}><span className={s.band} data-kind={kind} style={{ left: pos(from), width: `calc(${pos(to)} - ${pos(from)})` }} /></span>
    </div>
  );
  return (
    <div className={s.bands} data-fits={fits || undefined}>
      {row("Speech", SPEECH.low, SPEECH.high, "speech")}
      {row(slowdown === 1 ? "As spoken" : `Slowed ${slowdown}×`, lo, hi, fits ? "fits" : "slowed")}
      {row("Sensor feels", 1, sensorTop, "sensor")}
      <div className={s.axis}>{[1, 10, 100, 1000].map(hz => <span key={hz} style={{ left: pos(hz) }}>{hz >= 1000 ? `${hz / 1000}k` : hz} Hz</span>)}</div>
    </div>
  );
}

export function Clip({ title, detail, samples, color }: { title: string; detail: string; samples: Float32Array; color: string }) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const el = useRef<HTMLAudioElement | null>(null);
  // An <audio> element plays with the iPhone's ring switch on silent; Web Audio would not
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([encodeWav(samples, RATE)], { type: "audio/wav" }));
    setUrl(u);
    return () => { el.current?.pause(); URL.revokeObjectURL(u); };
  }, [samples]);

  const toggle = () => {
    if (playing) { el.current?.pause(); return; }
    document.querySelectorAll("audio").forEach(a => a.pause());
    const a = el.current!;
    a.currentTime = 0;
    a.play().catch(() => setPlaying(false));
  };
  return (
    <div className={s.clip}>
      <Button variant="secondary" size="medium" onlyIcon aria-label={playing ? `Stop ${title}` : `Play ${title}`} onClick={toggle} disabled={!url}
        icon={<Icon name={playing ? "MediaPause" : "MediaPlay"} />} />
      <div className={s.clipBody}>
        <div className={s.clipTitle}><span>{title}</span><span className={s.meta}>{detail}</span></div>
        <Wave samples={samples} color={color} progress={playing ? progress : 1} />
      </div>
      <audio ref={el} src={url} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={e => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))} />
    </div>
  );
}

/** The whole sentence slowed down, for a laptop to play to a phone lying on it. Built on the first tap: 80× is 8 minutes of audio. */
function PlayFull({ dsp, audio, slowdown, seconds }: { dsp: Dsp; audio: Float32Array; slowdown: number; seconds: number }) {
  const [built, setBuilt] = useState<{ url: string; slowdown: number } | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const el = useRef<HTMLAudioElement>(null);
  useEffect(() => () => { if (built) URL.revokeObjectURL(built.url); }, [built]);
  // Leaving (or switching slowdown, which remounts this) must silence it: a detached <audio> keeps playing
  useEffect(() => { const a = el.current; return () => a?.pause(); }, []);
  const play = () => {
    const a = el.current!;
    if (playing) return a.pause();
    if (built?.slowdown !== slowdown) {
      // 8 kHz is plenty: slowed 10× or more, nothing is left above 340 Hz
      const url = URL.createObjectURL(new Blob([encodeWav(dsp.resample(audio, RATE / slowdown, FULL_RATE), FULL_RATE)], { type: "audio/wav" }));
      setBuilt({ url, slowdown });
      a.src = url;
    }
    // Called inside the tap, so phones and Safari let it play
    a.play().catch(() => setPlaying(false));
  };
  return (
    <>
      <Button variant="secondary" size="large" stretched onClick={play} icon={<Icon name={playing ? "MediaPause" : "Speaker"} />}>
        {playing || time > 0 ? `${duration(time)} of ${duration(seconds * slowdown)}` : `Play the slowed sentence · ${duration(seconds * slowdown)}`}
      </Button>
      <audio ref={el} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setTime(0)}
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)} />
    </>
  );
}
const FULL_RATE = 8000;
