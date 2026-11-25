/** Round-to-nearest symmetric quantization, the basic scheme that most weight formats build on. */

function random(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
/** Generated weights: a bell shape around zero, plus optional rare large values like those found in real layers. */
export function sampleWeights(count: number, outliers: boolean, seed = 7): number[] {
  const r = random(seed), out: number[] = [];
  for (let i = 0; i < count; i++) {
    const g = Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    out.push(g * .02);
  }
  if (outliers) for (let i = 37; i < count; i += 509) out[i] = (i % 2 ? 1 : -1) * (.25 + r() * .1);
  return out;
}
/** Each group shares one scale: the largest magnitude maps to the largest integer level. */
export function quantize(weights: number[], bits: number, group: number) {
  const levels = 2 ** (bits - 1) - 1, size = group || weights.length, out = new Array<number>(weights.length);
  for (let start = 0; start < weights.length; start += size) {
    const block = weights.slice(start, start + size), max = Math.max(...block.map(Math.abs)) || 1, scale = max / levels;
    block.forEach((w, i) => { out[start + i] = Math.max(-levels, Math.min(levels, Math.round(w / scale))) * scale; });
  }
  return out;
}
export function errorStats(weights: number[], q: number[]) {
  let sq = 0, max = 0, energy = 0, zeros = 0;
  weights.forEach((w, i) => { const e = w - q[i]; sq += e * e; energy += w * w; max = Math.max(max, Math.abs(e)); if (q[i] === 0 && w !== 0) zeros++; });
  return {relative: Math.sqrt(sq / energy), max, zeroed: zeros / weights.length};
}
/** Stored bits per weight, counting one 16-bit scale per group. */
export const bitsPerWeight = (bits: number, group: number, count: number) => bits + 16 / (group || count);
