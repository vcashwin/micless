import { useEffect, useRef, useState } from "react";
import { Button } from "./design/atoms/Button/Button";
import { Icon, type IconName } from "./design/atoms/Icon/Icon";
import type { Dsp } from "./dsp.ts";
import { describe, Listener, type Heard, type Hearing } from "./listen.ts";
import { startSensor, Trace, type SensorState } from "./sensor.ts";
import { Bars, fit, token } from "./viz.tsx";
import s from "./App.module.css";

const SCOPE_SECONDS = 5;

const TIPS: { icon: IconName; text: string; detail: string }[] = [
  { icon: "Bolt", text: "Tap the back twice", detail: "A knock is a sharp jolt. It shows up clearly." },
  { icon: "Speaker", text: "Lay it on a speaker playing music", detail: "Bass shakes the phone. You'll see the beat." },
  { icon: "Hear", text: "Press it to your jaw and hum", detail: "Bone carries your voice, but at 60 readings a second only a faint buzz gets through." },
];

export function Listen({ dsp, onShowWords }: { dsp: Dsp | null; onShowWords: () => void }) {
  const [state, setState] = useState<SensorState>({ kind: "idle" });
  const [hearing, setHearing] = useState<Hearing>({ kind: "quiet" });
  const [rate, setRate] = useState(0);
  const [log, setLog] = useState<Heard[]>([]);
  const trace = useRef(new Trace());
  const bars = useRef<HTMLDivElement>(null);
  const scope = useRef<HTMLCanvasElement>(null);
  const spectrogram = useRef<HTMLCanvasElement>(null);
  const running = useRef<AbortController | null>(null);

  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    if (state.kind !== "live" || !dsp) return;
    const started = performance.now();
    const listener = new Listener(dsp, h => setLog(l => [{ ...h, at: h.at - started }, ...l].slice(0, 30)));
    const columns: Float32Array[] = [];
    let frame = 0, lastUpdate = 0, peakDb = -40;
    const highpassHz = 1;
    const colors = { line: token("label-base"), grid: token("bg-border"), lut: heatmap() };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - lastUpdate < 100) return draw();
      lastUpdate = now;
      const snap = listener.update(trace.current, now);
      bars.current?.style.setProperty("--level", snap.level.toFixed(3));
      setHearing(h => (describe(h) === describe(snap.hearing) ? h : snap.hearing));
      setRate(r => (Math.abs(r - snap.rate) > 1 ? snap.rate : r));
      columns.push(snap.spectrum);
      if (columns.length > 120) columns.shift();
      // The color scale follows the loudest bin, easing down 0.5 dB a tick after it
      peakDb = Math.max(peakDb - 0.5, ...Array.from(snap.spectrum.subarray(1), p => 10 * Math.log10(p + 1e-9)));
      draw();
    };

    const draw = () => {
      const t = trace.current, rateNow = t.rate() || 60;
      if (scope.current) {
        const { ctx, width, height } = fit(scope.current);
        ctx.clearRect(0, 0, width, height);
        const n = Math.min(t.count, Math.round(rateNow * SCOPE_SECONDS));
        if (n > 2) {
          // Draw the axis that is shaking most right now, without its slow drift (gravity, tilting)
          const axes = (["x", "y", "z"] as const).map(a => t.last(a, n));
          const energy = axes.map(a => a.reduce((s, v, i) => (i ? s + (v - a[i - 1]) ** 2 : s), 0));
          const a = axes[energy.indexOf(Math.max(...energy))];
          const hp = dsp.highpass(a.map(v => v - a[0]), rateNow, highpassHz, 2);
          const peak = Math.max(0.05, ...hp.map(Math.abs));
          ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
          ctx.strokeStyle = colors.line; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
          ctx.beginPath();
          hp.forEach((v, i) => {
            const x = width - ((n - 1 - i) / (rateNow * SCOPE_SECONDS)) * width, y = height / 2 - (v / peak) * (height / 2 - 2);
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          });
          ctx.stroke();
        }
      }
      if (spectrogram.current) {
        const { ctx, width, height } = fit(spectrogram.current);
        ctx.clearRect(0, 0, width, height);
        const colW = width / 120;
        columns.forEach((col, c) => {
          const x = width - (columns.length - c) * colW;
          for (let k = 1; k < col.length; k++) {
            const db = 10 * Math.log10(col[k] + 1e-9);
            const v = Math.max(0, Math.min(1, (db - (peakDb - 45)) / 45));
            ctx.fillStyle = colors.lut[Math.round(v * 255)];
            const y0 = height - (k / (col.length - 1)) * height, h = height / (col.length - 1);
            ctx.fillRect(x, y0, colW + 0.5, h + 0.5);
          }
        });
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [state.kind, dsp]);

  const start = () => {
    if (running.current) return;
    setLog([]);
    running.current = new AbortController();
    void startSensor(trace.current, setState, running.current.signal);
  };
  const stop = () => {
    running.current?.abort();
    running.current = null;
    bars.current?.style.setProperty("--level", "0");
    setHearing({ kind: "quiet" });
    setState({ kind: "idle" });
  };
  const starting = state.kind === "asking" || state.kind === "starting";

  const live = state.kind === "live";
  const nyquist = Math.round((rate || 60) / 2);
  return (
    <section className={s.stack}>
      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.status} data-live={live || undefined}>
            <span className={s.dot} />
            {live ? "Listening" : "Sensor off"}
          </span>
          {live && rate > 0 ? <span className={s.meta}>{Math.round(rate)} readings/s · feels up to {nyquist} Hz</span> : null}
        </div>
        <Bars barsRef={bars} live={live} />
        {live || state.kind === "asking" ? (
          <div className={s.hearing} aria-live="polite">{live ? describe(hearing) : "Waiting for permission…"}</div>
        ) : null}
        {state.kind === "idle" || starting ? (
          <Button variant="primary" size="large" stretched onClick={start} disabled={starting || !dsp}
            icon={<Icon name="MobilePhone" />}>{state.kind === "starting" ? "Starting…" : "Start listening"}</Button>
        ) : null}
        {live ? <Button variant="secondary" size="large" stretched onClick={stop} icon={<Icon name="Stop" />}>Stop listening</Button> : null}
        {state.kind === "denied" ? (
          <Notice icon="Lock" title="Motion access is off">
            Reload the page and tap Allow when your phone asks. On iPhone, that question only comes once per visit.
          </Notice>
        ) : null}
        {state.kind === "unavailable" ? (
          <Notice icon="MobilePhone" title="This browser can't feel motion">
            {matchMedia("(pointer: coarse)").matches
              ? "This browser keeps the motion sensor to itself, as some in-app browsers do. Open the page in Safari or Chrome."
              : "Open this page on your phone, in Safari or Chrome. Laptops have accelerometers too, but browsers on a Mac don't let a page read the MacBook's."}
            <Button variant="secondary" size="medium" onClick={onShowWords} icon={<Icon name="Sound" />}>Meanwhile: can a sensor hear words?</Button>
          </Notice>
        ) : null}
      </div>

      {live ? (
        <>
          <figure className={s.card}>
            <figcaption className={s.caption}>Vibration, last {SCOPE_SECONDS} seconds</figcaption>
            <canvas ref={scope} className={s.scope} />
          </figure>
          <figure className={s.card}>
            <figcaption className={s.caption}><span>Frequencies</span><span className={s.meta}>0 to {nyquist} Hz</span></figcaption>
            <canvas ref={spectrogram} className={s.spectrogram} />
          </figure>
          <div className={s.card}>
            <div className={s.caption}>Heard</div>
            {log.length ? (
              <ol className={s.log}>
                {log.map(h => (
                  <li key={h.id}><span className={s.time}>{(h.at / 1000).toFixed(1)} s</span>{h.text}</li>
                ))}
              </ol>
            ) : <p className={s.muted}>Nothing yet. Try one of these:</p>}
          </div>
        </>
      ) : null}

      <ul className={s.tips}>
        {TIPS.map(t => (
          <li key={t.text}>
            <span className={s.tipIcon}><Icon name={t.icon} color="labelBase" /></span>
            <span><strong>{t.text}</strong><span className={s.muted}>{t.detail}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Notice({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div className={s.notice}>
      <Icon name={icon} color="labelMuted" />
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  );
}

/** 256 colors from the page background through the theme's purple and blue to white */
function heatmap(): string[] {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 1;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  ["bg-sub", "purple-bg", "blue-base", "label-title"].forEach((t, i, all) => g.addColorStop(i / (all.length - 1), token(t)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  const px = ctx.getImageData(0, 0, 256, 1).data;
  return Array.from({ length: 256 }, (_, i) => `rgb(${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]})`);
}
