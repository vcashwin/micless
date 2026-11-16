import { useEffect, useRef, type CSSProperties } from "react";
import s from "./App.module.css";

/** A theme token's color, resolved, for drawing on a canvas */
export const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();

/** Sizes a canvas's backing store to its CSS box at the screen's pixel ratio and returns a context in CSS pixels */
export function fit(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

const BAR_COUNT = 24;
/** Bar envelope: tallest in the middle, 58% at the edges (Wispr Flow's 10-bar bulge, spread over more bars) */
const envelope = Array.from({ length: BAR_COUNT }, (_, i) => {
  const u = (BAR_COUNT - 1) / 2;
  return 1 - ((u - i) / u) ** 2 * 0.42;
});
/** Ripple order of the idle wave: the outer bars lead and it travels in */
const delay = Array.from({ length: BAR_COUNT }, (_, i) => (i < BAR_COUNT / 2 ? i : i - BAR_COUNT) * 0.05);

/** Live level as a row of bars. `level` (0..1) is written to a CSS variable by the caller's animation loop, not through React. */
export function Bars({ barsRef, live }: { barsRef: React.Ref<HTMLDivElement>; live: boolean }) {
  return (
    <div ref={barsRef} className={s.bars} data-live={live || undefined} style={{ "--level": 0 } as CSSProperties} aria-hidden>
      {envelope.map((env, i) => (
        <span key={i} className={s.bar} style={{ "--env": env, animationDelay: `${delay[i]}s` } as CSSProperties} />
      ))}
    </div>
  );
}

/** Min/max waveform of a clip with a playhead */
export function Wave({ samples, color, progress }: { samples: Float32Array; color: string; progress: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const { ctx, width, height } = fit(canvas);
      ctx.clearRect(0, 0, width, height);
      let peak = 1e-6;
      for (const v of samples) peak = Math.max(peak, Math.abs(v));
      const per = samples.length / width;
      ctx.fillStyle = token(color);
      for (let px = 0; px < width; px++) {
        let lo = 0, hi = 0;
        const from = Math.floor(px * per), to = Math.min(samples.length, Math.floor((px + 1) * per));
        for (let i = from; i < to; i++) { lo = Math.min(lo, samples[i]); hi = Math.max(hi, samples[i]); }
        const y0 = height / 2 - (hi / peak) * (height / 2 - 1), y1 = height / 2 - (lo / peak) * (height / 2 - 1);
        ctx.globalAlpha = px / width <= progress ? 1 : 0.4;
        ctx.fillRect(px, y0, 1, Math.max(1, y1 - y0));
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [samples, color, progress]);
  return <canvas ref={ref} className={s.wave} />;
}
