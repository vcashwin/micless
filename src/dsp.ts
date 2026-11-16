export type Dsp = {
  /** Linear power spectrum of a Hann-windowed real frame. frame.length must be a power of two >= 8. Returns n/2+1 bins (bin k = k*rate/n Hz). */
  powerSpectrum(frame: Float32Array): Float32Array;
  /** Butterworth filters as cascaded RBJ biquads; order is even, 2..8 (default 4). Return a new array; input untouched. */
  highpass(x: Float32Array, sampleRate: number, cutoffHz: number, order?: number): Float32Array;
  lowpass(x: Float32Array, sampleRate: number, cutoffHz: number, order?: number): Float32Array;
  /** Band-limited resample by an arbitrary (non-integer) ratio: windowed-sinc interpolation whose cutoff is min(fromRate, toRate)/2, so downsampling never aliases. Output length = round(x.length * toRate / fromRate). */
  resample(x: Float32Array, fromRate: number, toRate: number): Float32Array;
};

type Exports = {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  power_spectrum(input: number, n: number, out: number): void;
  butterworth(ptr: number, n: number, fs: number, fc: number, order: number, high: number): void;
  resample(input: number, n: number, from: number, to: number, out: number, outN: number): void;
};

/** Fetch + instantiate (instantiateStreaming with a fallback to arrayBuffer for servers that send the wrong MIME). Default url "/dsp.wasm". Also accept raw bytes (for node tests). */
export async function loadDsp(source: string | BufferSource = "/dsp.wasm"): Promise<Dsp> {
  let instance: WebAssembly.Instance;
  if (typeof source !== "string") {
    instance = (await WebAssembly.instantiate(source)).instance;
  } else {
    const res = await fetch(source);
    try {
      instance = (await WebAssembly.instantiateStreaming(res.clone())).instance;
    } catch {
      instance = (await WebAssembly.instantiate(await res.arrayBuffer())).instance;
    }
  }
  const w = instance.exports as unknown as Exports;

  const view = (ptr: number, len: number) => new Float32Array(w.memory.buffer, ptr, len);

  function call(x: Float32Array, outLen: number, run: (inPtr: number, outPtr: number) => void): Float32Array {
    const inPtr = w.alloc(x.length);
    const outPtr = w.alloc(outLen);
    view(inPtr, x.length).set(x);
    try {
      run(inPtr, outPtr);
      return view(outPtr, outLen).slice();
    } finally {
      w.dealloc(inPtr, x.length);
      w.dealloc(outPtr, outLen);
    }
  }

  function filter(x: Float32Array, fs: number, fc: number, order: number, high: number): Float32Array {
    if (!(order >= 2 && order <= 8 && order % 2 === 0)) throw new RangeError(`order must be even, 2..8: ${order}`);
    if (!(fc > 0 && fc < fs / 2)) throw new RangeError(`cutoff must be in (0, ${fs / 2}): ${fc}`);
    const ptr = w.alloc(x.length);
    view(ptr, x.length).set(x);
    try {
      w.butterworth(ptr, x.length, fs, fc, order, high);
      return view(ptr, x.length).slice();
    } finally {
      w.dealloc(ptr, x.length);
    }
  }

  return {
    powerSpectrum(frame) {
      const n = frame.length;
      if (n < 8 || (n & (n - 1)) !== 0) throw new RangeError(`frame length must be a power of two >= 8: ${n}`);
      return call(frame, n / 2 + 1, (i, o) => w.power_spectrum(i, n, o));
    },
    highpass: (x, fs, fc, order = 4) => filter(x, fs, fc, order, 1),
    lowpass: (x, fs, fc, order = 4) => filter(x, fs, fc, order, 0),
    resample(x, from, to) {
      if (!(from > 0 && to > 0)) throw new RangeError(`rates must be positive: ${from} -> ${to}`);
      const outLen = Math.round((x.length * to) / from);
      return call(x, outLen, (i, o) => w.resample(i, x.length, from, to, o, outLen));
    },
  };
}
