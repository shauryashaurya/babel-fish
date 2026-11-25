/** Small real models that train in the browser for the fine-tuning and mixture-of-experts labs. */

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const grid = (n: number, low: number, high: number) => Array.from({length: n}, (_, i) => low + (high - low) * i / (n - 1));
const mse = (f: (x: number) => number, g: (x: number) => number, xs: number[]) => xs.reduce((sum, x) => sum + (f(x) - g(x)) ** 2, 0) / xs.length;

/* Fine-tuning lab */
export type TuneMethod = 'head' | 'lora' | 'full';
export interface TuneSettings {method: TuneMethod; examples: number; noise: number; learningRate: number; rank: number; keepClose: number; rehearsal: number;}
export interface TunePoint {step: number; train: number; holdout: number; retained: number;}
const HIDDEN = 12, FEATURES = 4;
const features = (x: number) => [x, x * x, Math.sin(Math.PI * x), Math.cos(Math.PI * x)];
export const baseTask = (x: number) => .6 * Math.sin(2.5 * x) + .2 * x;
export const targetTask = (x: number) => baseTask(x) + .55 * Math.exp(-(((x - .55) / .17) ** 2));
export const TARGET_RANGE: [number, number] = [.2, .95];
export const BASE_RANGE: [number, number] = [-1, .1];
interface Weights {w1: number[]; b: number[]; w2: number[]; c: number[];}
const predict = (m: Weights, a: number[] | null, bb: number[] | null, rank: number, x: number) => {
  const phi = features(x); let y = m.c[0];
  for (let i = 0; i < HIDDEN; i++) {
    let z = m.b[i];
    for (let j = 0; j < FEATURES; j++) {
      let weight = m.w1[i * FEATURES + j];
      if (a && bb) for (let k = 0; k < rank; k++) weight += a[i * rank + k] * bb[j * rank + k];
      z += weight * phi[j];
    }
    y += m.w2[i] * Math.tanh(z);
  }
  return y;
};

class Adam {
  m: Float64Array; v: Float64Array; t = 0;
  constructor(size: number, public lr: number) { this.m = new Float64Array(size); this.v = new Float64Array(size); }
  step(p: number[], g: Float64Array) {
    this.t++;
    for (let i = 0; i < p.length; i++) {
      this.m[i] = .9 * this.m[i] + .1 * g[i];
      this.v[i] = .999 * this.v[i] + .001 * g[i] * g[i];
      p[i] -= this.lr * (this.m[i] / (1 - .9 ** this.t)) / (Math.sqrt(this.v[i] / (1 - .999 ** this.t)) + 1e-8);
    }
  }
}

let pretrained: Weights | null = null;
/** The "base model": trained once on the original task, then reused by every experiment. */
export function basePretrained(): Weights {
  if (pretrained) return pretrained;
  const random = seededRandom(7), r = (s: number) => (random() * 2 - 1) * s;
  const model: Weights = {w1: Array.from({length: HIDDEN * FEATURES}, () => r(1)), b: Array.from({length: HIDDEN}, () => r(1)), w2: Array.from({length: HIDDEN}, () => r(.3)), c: [0]};
  const data = grid(60, -1, 1), params = [...model.w1, ...model.b, ...model.w2, ...model.c], opt = new Adam(params.length, .02);
  for (let step = 0; step < 1400; step++) {
    const current = unpack(params), g = new Float64Array(params.length);
    for (const x of data) addGradients(current, null, null, 0, x, baseTask(x), g, null, null);
    for (let i = 0; i < g.length; i++) g[i] /= data.length;
    opt.step(params, g);
  }
  pretrained = unpack(params);
  return pretrained;
}
function unpack(p: number[]): Weights {
  const a = HIDDEN * FEATURES;
  return {w1: p.slice(0, a), b: p.slice(a, a + HIDDEN), w2: p.slice(a + HIDDEN, a + 2 * HIDDEN), c: p.slice(a + 2 * HIDDEN, a + 2 * HIDDEN + 1)};
}
function addGradients(m: Weights, a: number[] | null, bb: number[] | null, rank: number, x: number, target: number, g: Float64Array | null, ga: Float64Array | null, gb: Float64Array | null) {
  const phi = features(x), z = new Array(HIDDEN).fill(0), weights = new Array(HIDDEN * FEATURES);
  for (let i = 0; i < HIDDEN; i++) {
    z[i] = m.b[i];
    for (let j = 0; j < FEATURES; j++) {
      let w = m.w1[i * FEATURES + j];
      if (a && bb) for (let k = 0; k < rank; k++) w += a[i * rank + k] * bb[j * rank + k];
      weights[i * FEATURES + j] = w;
      z[i] += w * phi[j];
    }
  }
  const s = z.map(Math.tanh);
  const y = m.c[0] + s.reduce((sum, v, i) => sum + m.w2[i] * v, 0), error = 2 * (y - target);
  const offset = HIDDEN * FEATURES;
  for (let i = 0; i < HIDDEN; i++) {
    const dz = error * m.w2[i] * (1 - s[i] * s[i]);
    if (g) {
      for (let j = 0; j < FEATURES; j++) g[i * FEATURES + j] += dz * phi[j];
      g[offset + i] += dz;
      g[offset + HIDDEN + i] += error * s[i];
    }
    if (ga && gb && bb && a) for (let j = 0; j < FEATURES; j++) for (let k = 0; k < rank; k++) {
      ga[i * rank + k] += dz * phi[j] * bb[j * rank + k];
      gb[j * rank + k] += dz * phi[j] * a[i * rank + k];
    }
  }
  if (g) g[offset + 2 * HIDDEN] += error;
}

export class FineTuner {
  model: Weights; base: Weights; history: TunePoint[] = []; stepCount = 0;
  xs: number[]; ys: number[]; settings: TuneSettings;
  private p: number[]; private a: number[] | null = null; private bb: number[] | null = null; private opt: Adam; private optB: Adam | null = null;
  private holdoutXs = grid(50, TARGET_RANGE[0], TARGET_RANGE[1]); private retainedXs = grid(50, BASE_RANGE[0], BASE_RANGE[1]);

  constructor(settings: TuneSettings) {
    this.settings = settings;
    this.base = basePretrained();
    this.model = {w1: [...this.base.w1], b: [...this.base.b], w2: [...this.base.w2], c: [...this.base.c]};
    const random = seededRandom(41);
    this.xs = Array.from({length: settings.examples}, (_, i) => TARGET_RANGE[0] + (TARGET_RANGE[1] - TARGET_RANGE[0]) * (i + random()) / settings.examples);
    this.ys = this.xs.map(x => targetTask(x) + (Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random())) * settings.noise);
    // Rehearsal examples remind the model of the skill it should keep.
    for (let i = 0; i < settings.rehearsal; i++) {
      const x = BASE_RANGE[0] + (BASE_RANGE[1] - BASE_RANGE[0]) * (i + random()) / settings.rehearsal;
      this.xs.push(x); this.ys.push(baseTask(x));
    }
    this.p = [...this.model.w1, ...this.model.b, ...this.model.w2, ...this.model.c];
    if (settings.method === 'lora') {
      const r = settings.rank;
      this.a = Array.from({length: HIDDEN * r}, () => 0);
      this.bb = Array.from({length: FEATURES * r}, () => (random() * 2 - 1) * .4);
      this.opt = new Adam(this.a.length, settings.learningRate);
      this.optB = new Adam(this.bb.length, settings.learningRate);
    } else this.opt = new Adam(this.p.length, settings.learningRate);
    this.record();
  }
  get trainable(): number {
    if (this.settings.method === 'lora') return (HIDDEN + FEATURES) * this.settings.rank;
    if (this.settings.method === 'head') return HIDDEN + 1;
    return HIDDEN * FEATURES + 2 * HIDDEN + 1;
  }
  get total() { return HIDDEN * FEATURES + 2 * HIDDEN + 1; }
  predict = (x: number) => predict(this.model, this.a, this.bb, this.settings.rank, x);
  basePredict = (x: number) => predict(this.base, null, null, 0, x);
  private record() {
    const train = this.xs.reduce((sum, x, i) => sum + (this.predict(x) - this.ys[i]) ** 2, 0) / this.xs.length;
    this.history.push({step: this.stepCount, train, holdout: mse(this.predict, targetTask, this.holdoutXs), retained: mse(this.predict, baseTask, this.retainedXs)});
  }
  run(steps: number) {
    const {method, keepClose, rank} = this.settings, n = this.xs.length;
    for (let s = 0; s < steps; s++) {
      if (method === 'lora') {
        const ga = new Float64Array(this.a!.length), gb = new Float64Array(this.bb!.length);
        this.xs.forEach((x, i) => addGradients(this.model, this.a, this.bb, rank, x, this.ys[i], null, ga, gb));
        for (let i = 0; i < ga.length; i++) ga[i] = ga[i] / n + keepClose * this.a![i];
        for (let i = 0; i < gb.length; i++) gb[i] /= n;
        this.opt.step(this.a!, ga); this.optB!.step(this.bb!, gb);
      } else {
        const g = new Float64Array(this.p.length);
        this.xs.forEach((x, i) => addGradients(this.model, null, null, 0, x, this.ys[i], g, null, null));
        const baseFlat = [...this.base.w1, ...this.base.b, ...this.base.w2, ...this.base.c], offset = HIDDEN * FEATURES + HIDDEN;
        for (let i = 0; i < g.length; i++) {
          g[i] = g[i] / n + keepClose * (this.p[i] - baseFlat[i]);
          if (method === 'head' && i < offset) g[i] = 0;
        }
        if (method === 'head') { const before = this.p.slice(0, offset); this.opt.step(this.p, g); for (let i = 0; i < offset; i++) this.p[i] = before[i]; }
        else this.opt.step(this.p, g);
        this.model = unpack(this.p);
      }
      this.stepCount++;
    }
    this.record();
  }
}

/* Mixture-of-experts lab */
export interface ExpertSettings {experts: number; active: number; balance: boolean;}
export const expertTarget = (x: number) => x < -.45 ? -1.1 * x - .95 : x < .05 ? 1.5 * x + .22 : x < .55 ? -.9 * x + .34 : 1.4 * x - .925;

export class ExpertTrainer {
  a: number[]; b: number[]; u: number[]; v: number[]; stepCount = 0; history: number[] = [];
  private xs = grid(80, -1, 1);
  constructor(public settings: ExpertSettings) {
    const random = seededRandom(11 + settings.experts * 3), r = (s: number) => (random() * 2 - 1) * s, E = settings.experts;
    this.a = Array.from({length: E}, () => r(.3));
    this.b = Array.from({length: E}, () => r(.3));
    this.u = Array.from({length: E}, () => r(1.2));
    this.v = Array.from({length: E}, () => r(.5));
    this.history.push(this.error());
  }
  private chosen(x: number) {
    const logits = this.u.map((u, e) => u * x + this.v[e]);
    const order = logits.map((l, e) => [l, e] as const).sort((p, q) => q[0] - p[0]).slice(0, this.settings.active);
    const max = order[0][0], exps = order.map(o => Math.exp(o[0] - max)), total = exps.reduce((s, x2) => s + x2, 0);
    return order.map((o, i) => ({e: o[1], p: exps[i] / total}));
  }
  predict = (x: number) => this.chosen(x).reduce((sum, c) => sum + c.p * (this.a[c.e] * x + this.b[c.e]), 0);
  routeOf = (x: number) => this.chosen(x)[0].e;
  error = () => mse(this.predict, expertTarget, this.xs);
  usage() {
    const counts = new Array(this.settings.experts).fill(0);
    for (const x of this.xs) for (const c of this.chosen(x)) counts[c.e] += c.p;
    return counts.map(c => c / this.xs.length);
  }
  run(steps: number) {
    const E = this.settings.experts, lr = .06, routerLr = .5;
    for (let s = 0; s < steps; s++) {
      const da = new Array(E).fill(0), db = new Array(E).fill(0), du = new Array(E).fill(0), dv = new Array(E).fill(0), use = this.usage();
      for (const x of this.xs) {
        const picks = this.chosen(x), out = picks.map(c => this.a[c.e] * x + this.b[c.e]), y = picks.reduce((sum, c, i) => sum + c.p * out[i], 0), error = y - expertTarget(x);
        picks.forEach((c, i) => {
          da[c.e] += error * c.p * x; db[c.e] += error * c.p;
          const router = error * c.p * (out[i] - y);
          du[c.e] += router * x; dv[c.e] += router;
        });
        if (this.settings.balance) {
          const logits = this.u.map((u, e) => u * x + this.v[e]), max = Math.max(...logits), q = logits.map(l => Math.exp(l - max)), total = q.reduce((sum, value) => sum + value, 0);
          for (let e = 0; e < E; e++) {
            const push = .45 * (use[e] - this.settings.active / E / this.settings.active) * (q[e] / total);
            du[e] += push * x; dv[e] += push;
          }
        }
      }
      for (let e = 0; e < E; e++) {
        this.a[e] -= lr * da[e] / this.xs.length * 6; this.b[e] -= lr * db[e] / this.xs.length * 6;
        this.u[e] -= routerLr * du[e] / this.xs.length * 6; this.v[e] -= routerLr * dv[e] / this.xs.length * 6;
      }
      this.stepCount++;
    }
    this.history.push(this.error());
  }
}

/* Fine-tuning footprint */
export interface PlanInput {params: number; hiddenSize: number; layers: number; vocab?: number; method: string; rank: number; batch: number; sequence: number; examples: number; epochs: number; checkpointing: boolean;}
export interface PlanResult {trainable: number; share: number; adapterMiB: number; baseGiB: number; optimizerGiB: number; activationGiB: number; memoryGiB: number; steps: number; tokens: number;}
const GIB = 1024 ** 3;
/** Memory = held weights + gradients and Adam state for trainable weights + activations kept for backpropagation. */
export function planTraining(p: PlanInput): PlanResult {
  const loraParams = p.layers * 4 * 2 * p.rank * p.hiddenSize;
  const trainable = p.method === 'full' || p.method === 'dpo' ? p.params : p.method === 'prefix' ? 20 * p.hiddenSize : Math.min(loraParams, p.params);
  const baseGiB = p.params * (p.method === 'qlora' ? .5 : 2) / GIB;
  const optimizerGiB = trainable * 12 / GIB;
  const keptLayers = p.checkpointing ? Math.ceil(Math.sqrt(p.layers)) : p.layers;
  const pairFactor = p.method === 'dpo' ? 2 : 1;
  const activationGiB = p.batch * pairFactor * p.sequence * p.hiddenSize * keptLayers * 4 * 2 / GIB;
  return {trainable, share: trainable / p.params, adapterMiB: trainable * 2 / (1024 * 1024), baseGiB, optimizerGiB, activationGiB, memoryGiB: (baseGiB + optimizerGiB + activationGiB) * 1.2, steps: Math.ceil(p.examples * p.epochs / p.batch), tokens: p.examples * p.epochs * p.sequence};
}
