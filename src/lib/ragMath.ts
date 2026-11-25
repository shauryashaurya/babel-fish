// Retrieval mathematics used by the RAG techniques lab. No imports, so it can be tested directly in Node.

const STOP = new Set('a an and are as at be by can do does for from has have how if in into is it its of on or so than that the their them then there these they this to was what when where which while who why will with you your not no more most less only one each per also just'.split(' '));
/** Lower-cased word tokens without stop words. */
export const terms = (text: string) => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length > 1 && !STOP.has(w));
/** Sentences, split on terminal punctuation. */
export const sentences = (text: string) => text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map(s => s.trim()).filter(s => terms(s).length > 0) ?? [];

/** Seeded generator (mulberry32) so every run of the lab gives the same result. */
export function rng(seed: number) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}

export type Vec = Float64Array;
export const dot = (a: Vec, b: Vec) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export function normalize(v: Vec) { const n = Math.sqrt(dot(v, v)); if (n) for (let i = 0; i < v.length; i++) v[i] /= n; return v; }
export function mean(vs: Vec[]) { const out = new Float64Array(vs[0]?.length ?? 0); for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i]; return normalize(out); }

/** Gram-Schmidt, applied twice for numerical orthogonality; columns that collapse (rank deficiency) are dropped. */
function orthonormalize(cols: Vec[]) {
  const kept: Vec[] = [];
  for (const v of cols) {
    const before = Math.sqrt(dot(v, v));
    for (let pass = 0; pass < 2; pass++) for (const u of kept) { const p = dot(u, v); for (let i = 0; i < v.length; i++) v[i] -= p * u[i]; }
    const after = Math.sqrt(dot(v, v));
    if (before && after > 1e-9 * before) kept.push(normalize(v));
  }
  return kept;
}

/** Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations. Returns eigenvalues and eigenvectors (as columns). */
export function jacobiEigen(M: number[][]) {
  const n = M.length, A = M.map(r => r.slice()), V = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const kp = A[k][p], kq = A[k][q]; A[k][p] = c * kp - s * kq; A[k][q] = s * kp + c * kq; }
      for (let k = 0; k < n; k++) { const pk = A[p][k], qk = A[q][k]; A[p][k] = c * pk - s * qk; A[q][k] = s * pk + c * qk; }
      for (let k = 0; k < n; k++) { const kp = V[k][p], kq = V[k][q]; V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq; }
    }
  }
  return {values: A.map((r, i) => r[i]), vectors: V};
}

type Sparse = Map<number, number>;

/**
 * Latent semantic analysis (Deerwester et al., 1990): a truncated SVD of the tf-idf term-by-passage matrix,
 * computed with a randomized range finder (Halko, Martinsson and Tropp, 2011). Gives every passage, query and word a dense vector.
 */
export class Space {
  vocab = new Map<string, number>();
  words: string[] = [];
  idf: Float64Array = new Float64Array(0);
  /** Left singular vectors, one k-dimensional row per word. */
  U: Vec[] = [];
  S: Float64Array = new Float64Array(0);
  k = 0;
  constructor(texts: string[], k = 64, seed = 7) {
    const docs = texts.map(terms), df = new Map<string, number>();
    docs.forEach(d => new Set(d).forEach(w => df.set(w, (df.get(w) ?? 0) + 1)));
    for (const [w, n] of [...df].sort((a, b) => a[0].localeCompare(b[0]))) if (n >= 2) { this.vocab.set(w, this.words.length); this.words.push(w); }
    const N = docs.length, V = this.words.length;
    this.idf = Float64Array.from(this.words, w => Math.log((N + 1) / (df.get(w)! + 1)) + 1);
    const A = docs.map(d => this.weights(d));
    const p = Math.min(k + 10, N, V), r = rng(seed);
    const mulA = (X: Vec[]) => X.map(x => { const y = new Float64Array(V); A.forEach((col, j) => { const xj = x[j]; if (xj) col.forEach((w, i) => { y[i] += w * xj; }); }); return y; });
    const mulAt = (Y: Vec[]) => Y.map(y => Float64Array.from(A, col => { let s = 0; col.forEach((w, i) => { s += w * y[i]; }); return s; }));
    let Y = orthonormalize(mulA(Array.from({length: p}, () => Float64Array.from({length: N}, () => r() * 2 - 1))));
    for (let it = 0; it < 3; it++) Y = orthonormalize(mulA(orthonormalize(mulAt(Y))));
    const B = mulAt(Y); // rows of Y^T A: one vector of length N per basis column
    const M = B.map(a => B.map(b => dot(a, b)));
    const {values, vectors} = jacobiEigen(M);
    const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).slice(0, k).filter(([v]) => v > 1e-10);
    this.k = order.length;
    this.S = Float64Array.from(order, ([v]) => Math.sqrt(v));
    this.U = Array.from({length: V}, (_, i) => Float64Array.from(order, ([, e]) => { let s = 0; for (let c = 0; c < Y.length; c++) s += vectors[c][e] * Y[c][i]; return s; }));
  }
  /** Log-scaled tf-idf weights over the vocabulary, unit length. */
  weights(ts: string[]): Sparse {
    const tf = new Map<number, number>();
    for (const w of ts) { const i = this.vocab.get(w); if (i !== undefined) tf.set(i, (tf.get(i) ?? 0) + 1); }
    const out: Sparse = new Map(); let n = 0;
    tf.forEach((f, i) => { const v = (1 + Math.log(f)) * this.idf[i]; out.set(i, v); n += v * v; });
    n = Math.sqrt(n) || 1; out.forEach((v, i) => out.set(i, v / n));
    return out;
  }
  /** Folds a text into the latent space (U transposed times its tf-idf vector), unit length. Unknown words contribute nothing. */
  embed(text: string): Vec {
    const v = new Float64Array(this.k);
    this.weights(terms(text)).forEach((w, i) => { const u = this.U[i]; for (let e = 0; e < this.k; e++) v[e] += w * u[e]; });
    return normalize(v);
  }
  /** One word's vector (its row of U scaled by the singular values), unit length; null for words outside the vocabulary. */
  wordVec(word: string): Vec | null {
    const i = this.vocab.get(word); if (i === undefined) return null;
    return normalize(Float64Array.from(this.U[i], (x, e) => x * this.S[e]));
  }
  /** Vocabulary words nearest to a vector. */
  nearestWords(v: Vec, n = 8, exclude: Set<string> = new Set()) {
    const out: {word: string; sim: number}[] = [];
    this.words.forEach(w => { if (exclude.has(w)) return; const u = this.wordVec(w)!; out.push({word: w, sim: dot(u, v)}); });
    return out.sort((a, b) => b.sim - a.sim).slice(0, n);
  }
}

/** Okapi BM25 over pre-tokenized passages, k1 = 1.2 and b = 0.75 (Robertson and Zaragoza, 2009). */
export class Bm25 {
  tf: Map<string, number>[]; len: number[]; df = new Map<string, number>(); avg: number; N: number;
  constructor(texts: string[]) {
    const docs = texts.map(terms);
    this.N = docs.length;
    this.len = docs.map(d => d.length);
    this.avg = this.len.reduce((s, x) => s + x, 0) / Math.max(1, this.N);
    this.tf = docs.map(d => { const m = new Map<string, number>(); d.forEach(w => m.set(w, (m.get(w) ?? 0) + 1)); return m; });
    this.tf.forEach(m => m.forEach((_, w) => this.df.set(w, (this.df.get(w) ?? 0) + 1)));
  }
  idf(w: string) { const n = this.df.get(w) ?? 0; return Math.log(1 + (this.N - n + .5) / (n + .5)); }
  scores(query: string, k1 = 1.2, b = .75) {
    const q = [...new Set(terms(query))];
    return this.tf.map((m, i) => {
      let s = 0;
      for (const w of q) { const f = m.get(w) ?? 0; if (f) s += this.idf(w) * f * (k1 + 1) / (f + k1 * (1 - b + b * this.len[i] / this.avg)); }
      return s;
    });
  }
}

/** Indices sorted by score, best first, dropping scores at or below the floor. */
export const ranking = (scores: ArrayLike<number>, floor = 0) => Array.from(scores, (s, i) => [s, i] as const).filter(([s]) => s > floor).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);

/** Reciprocal rank fusion (Cormack, Clarke and Buettcher, 2009): each list adds 1 / (k + rank). */
export function rrf(lists: number[][], k = 60, depth = 50) {
  const score = new Map<number, number>();
  for (const list of lists) list.slice(0, depth).forEach((id, r) => score.set(id, (score.get(id) ?? 0) + 1 / (k + r + 1)));
  return [...score].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

/** Spherical k-means with k-means++ seeding (Arthur and Vassilvitskii, 2007) on unit vectors. */
export function kmeans(vs: Vec[], k: number, seed = 11, iters = 30) {
  const r = rng(seed), n = vs.length; k = Math.max(1, Math.min(k, n));
  const centres: Vec[] = [Float64Array.from(vs[Math.floor(r() * n)])];
  while (centres.length < k) {
    const d = vs.map(v => Math.max(0, 1 - Math.max(...centres.map(c => dot(c, v)))));
    const total = d.reduce((s, x) => s + x, 0); let pick = r() * total, i = 0;
    while (i < n - 1 && (pick -= d[i]) > 0) i++;
    centres.push(Float64Array.from(vs[i]));
  }
  let assign = new Array<number>(n).fill(-1);
  for (let it = 0; it < iters; it++) {
    const next = vs.map(v => { let best = 0, bs = -Infinity; centres.forEach((c, j) => { const s = dot(c, v); if (s > bs) { bs = s; best = j; } }); return best; });
    const same = next.every((a, i) => a === assign[i]); assign = next;
    centres.forEach((_, j) => { const members = vs.filter((_, i) => assign[i] === j); if (members.length) centres[j] = mean(members); });
    if (same) break;
  }
  return {assign, centres};
}

/** Personalized PageRank by power iteration over a weighted undirected graph (as used by HippoRAG). */
export function personalizedPageRank(adj: Map<number, number>[], seeds: Map<number, number>, damping = .5, iters = 40) {
  const n = adj.length, total = [...seeds.values()].reduce((s, x) => s + x, 0) || 1;
  const reset = new Float64Array(n); seeds.forEach((w, i) => { reset[i] = w / total; });
  const out = adj.map(m => [...m.values()].reduce((s, x) => s + x, 0));
  let p = Float64Array.from(reset);
  for (let it = 0; it < iters; it++) {
    const next = new Float64Array(n);
    let dangling = 0;
    for (let i = 0; i < n; i++) { if (!out[i]) { dangling += p[i]; continue; } adj[i].forEach((w, j) => { next[j] += damping * p[i] * w / out[i]; }); }
    for (let i = 0; i < n; i++) next[i] += (1 - damping + damping * dangling) * reset[i];
    p = next;
  }
  return p;
}

/** Weighted label propagation (Raghavan, Albert and Kumara, 2007), visiting nodes in a fixed order so the result is reproducible. */
export function labelPropagation(adj: Map<number, number>[], rounds = 30) {
  const label = adj.map((_, i) => i);
  for (let round = 0; round < rounds; round++) {
    let changed = false;
    for (let i = 0; i < adj.length; i++) {
      const w = new Map<number, number>();
      adj[i].forEach((x, j) => w.set(label[j], (w.get(label[j]) ?? 0) + x));
      if (!w.size) continue;
      const best = [...w].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      if (best !== label[i] && w.get(best)! > (w.get(label[i]) ?? 0)) { label[i] = best; changed = true; }
    }
    if (!changed) break;
  }
  return label;
}

/** Smallest span of positions that covers every matched query word, as a share of the matched count (1 = adjacent). */
export function proximity(tokens: string[], query: Set<string>) {
  const want = new Set(tokens.filter(t => query.has(t)));
  if (want.size <= 1) return want.size;
  const count = new Map<string, number>(); let have = 0, best = Infinity;
  for (let lo = 0, hi = 0; hi < tokens.length; hi++) {
    const w = tokens[hi]; if (want.has(w)) { count.set(w, (count.get(w) ?? 0) + 1); if (count.get(w) === 1) have++; }
    while (have === want.size) {
      best = Math.min(best, hi - lo + 1);
      const v = tokens[lo++]; if (want.has(v)) { count.set(v, count.get(v)! - 1); if (!count.get(v)) have--; }
    }
  }
  return want.size / best;
}

/** Linear-interpolated percentile, as numpy.percentile does by default. */
export function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), pos = (s.length - 1) * p / 100, lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}
