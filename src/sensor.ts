/** The phone's accelerometer, as the browser hands it to a page: `devicemotion` events, about 60 a second. */

export type SensorState =
  | { kind: "idle" }
  | { kind: "asking" }
  /** Allowed (or never asked); waiting to see whether readings arrive */
  | { kind: "starting" }
  | { kind: "denied" }
  /** No motion events reach this page: a desktop browser, or an in-app browser that keeps the sensor to itself */
  | { kind: "unavailable" }
  | { kind: "live" };

/** 9 minutes at 60 readings a second: long enough to record a sentence played 80 times slower (under 8 minutes) */
const CAPACITY = 32768;

/** Ring buffer of the last CAPACITY readings, one array per axis, newest last. */
export class Trace {
  readonly x = new Float32Array(CAPACITY);
  readonly y = new Float32Array(CAPACITY);
  readonly z = new Float32Array(CAPACITY);
  readonly t = new Float64Array(CAPACITY);
  /** Total samples ever pushed; the newest is at index (count - 1) % CAPACITY */
  count = 0;
  readonly capacity = CAPACITY;

  push(t: number, x: number, y: number, z: number) {
    const i = this.count % CAPACITY;
    this.t[i] = t; this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.count++;
  }

  /** The last n samples of one axis, oldest first (zeros before the first sample) */
  last(axis: "x" | "y" | "z", n: number, out = new Float32Array(n)): Float32Array {
    const src = this[axis];
    for (let k = 0; k < n; k++) {
      const abs = this.count - n + k;
      out[k] = abs < 0 ? 0 : src[abs % CAPACITY];
    }
    return out;
  }

  /** Samples per second, from the median gap between the last ~2 s of timestamps (event.interval lies on some phones) */
  rate(): number {
    const n = Math.min(this.count - 1, 120);
    if (n < 10) return 0;
    const gaps: number[] = [];
    for (let k = this.count - n; k < this.count; k++) gaps.push(this.t[k % CAPACITY] - this.t[(k - 1) % CAPACITY]);
    gaps.sort((a, b) => a - b);
    const median = gaps[gaps.length >> 1];
    return median > 0 ? 1000 / median : 0;
  }
}

type PermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Listens until `signal` aborts. Must start inside a tap: iOS asks for motion access then.
 * Reports `live` once readings arrive, or `unavailable` when none do within 1.5 s.
 */
export async function startSensor(trace: Trace, onState: (s: SensorState) => void, signal: AbortSignal): Promise<void> {
  if (typeof DeviceMotionEvent === "undefined") return onState({ kind: "unavailable" });
  const api = DeviceMotionEvent as unknown as PermissionApi;
  if (api.requestPermission) {
    onState({ kind: "asking" });
    const answer = await api.requestPermission().catch(() => "denied" as const);
    if (signal.aborted) return;
    if (answer !== "granted") return onState({ kind: "denied" });
  }
  onState({ kind: "starting" });
  const onMotion = (e: DeviceMotionEvent) => {
    // `acceleration` has gravity removed by the OS; fall back to the raw reading, whose constant gravity the analysis filters out
    const a = e.acceleration?.x != null ? e.acceleration : e.accelerationIncludingGravity;
    if (a?.x == null || a.y == null || a.z == null) return;
    trace.push(e.timeStamp, a.x, a.y, a.z);
  };
  window.addEventListener("devicemotion", onMotion, { signal });
  // Desktop Chrome and Safari define DeviceMotionEvent but never fire it with data
  const before = trace.count;
  await new Promise(r => setTimeout(r, 1500));
  if (signal.aborted) return;
  if (trace.count - before < 5) {
    window.removeEventListener("devicemotion", onMotion);
    return onState({ kind: "unavailable" });
  }
  onState({ kind: "live" });
}
