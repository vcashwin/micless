/** 16-bit mono PCM WAV: the format both the browser's <audio> and whisper-cli read without help */
export function encodeWav(x: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const b = new DataView(new ArrayBuffer(44 + x.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => b.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); b.setUint32(4, 36 + x.length * 2, true); text(8, "WAVEfmt "); b.setUint32(16, 16, true);
  b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true);
  b.setUint16(32, 2, true); b.setUint16(34, 16, true); text(36, "data"); b.setUint32(40, x.length * 2, true);
  x.forEach((v, i) => b.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(v * 32767))), true));
  return new Uint8Array(b.buffer);
}

/** Samples of a 16-bit mono WAV, as -1..1 floats */
export function decodeWav(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  while (at + 8 <= view.byteLength && String.fromCharCode(...bytes.subarray(at, at + 4)) !== "data") at += 8 + view.getUint32(at + 4, true);
  const n = Math.floor(view.getUint32(at + 4, true) / 2);
  return Float32Array.from({ length: n }, (_, i) => view.getInt16(at + 8 + i * 2, true) / 32768);
}
