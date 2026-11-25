import {t} from './content';

/** Runs small, real computations on synthetic vectors and lays the result out as a drawable network. */
export interface NodeInfo {title: string; shape: string; detail: string;}
export interface SceneNode {
  id: string; x: number; y: number; w: number; h: number; round: boolean; value: number;
  tone: 'value' | 'focus' | 'muted' | 'future';
  info: NodeInfo; label?: string; action?: {param: string; value: number};
}
export interface SceneEdge {from: string; to: string; weight: number;}
export interface Scene {nodes: SceneNode[]; edges: SceneEdge[]; lanes: {label: string; y: number}[]; readouts: {label: string; value: string}[]; note?: string;}
export type Params = Record<string, number>;

export const SCENE_WIDTH = 960;
export const SCENE_HEIGHT = 430;
const LEFT = 120, SPAN = SCENE_WIDTH - LEFT - 20, DIM = 8, MAX_HEADS = 24, MAX_EXPERTS = 96;

const rand = (a: number, b: number) => { const x = Math.sin(a * 12.9898 + b * 78.233 + 1.7) * 43758.5453; return x - Math.floor(x); };
const vec = (seed: number) => Array.from({length: DIM}, (_, j) => rand(seed, j) * 2 - 1);
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const unit = (a: number[]) => { const n = Math.hypot(...a) || 1; return a.map(x => x / n); };
const rowX = (count: number, i: number) => LEFT + SPAN * (i + .5) / count;
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
const pct = (v: number) => `${(v * 100).toFixed(v < .1 ? 1 : 0)}%`;
export const formatBytes = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${Math.round(n)} B`;
const count = (n: number) => n.toLocaleString('en-US');

function rotate(a: number[], angle: number) {
  const out = [...a];
  for (let j = 0; j + 1 < a.length; j += 2) {
    const theta = angle / (1 + j), c = Math.cos(theta), s = Math.sin(theta);
    out[j] = a[j] * c - a[j + 1] * s;
    out[j + 1] = a[j] * s + a[j + 1] * c;
  }
  return out;
}

/** Scaled dot-product attention of the current token over earlier tokens, with the block's mask applied. */
export function attentionWeights(variant: string, p: Params, position: number, head: number, group: number): number[] {
  const angle = (p.rotation ?? 30) * Math.PI / 180, useRope = variant === 'position' && !!p.rope;
  let query = vec(position * 3 + head * 17 + 1);
  let keys = Array.from({length: position}, (_, i) => vec(i * 3 + group * 31 + 2));
  if (useRope) { query = rotate(query, position * angle); keys = keys.map((k, i) => rotate(k, i * angle)); }
  if (variant === 'qknorm') {
    const scale = (p.keyScale ?? 100) / 100;
    if (p.normalize) { query = unit(query); keys = keys.map(k => unit(k).map(x => x * Math.sqrt(DIM) / 2)); query = query.map(x => x * Math.sqrt(DIM) / 2); }
    else keys = keys.map(k => k.map(x => x * scale * 3));
  }
  const scores = keys.map(k => dot(query, k) / Math.sqrt(DIM) * 3);
  let allowed = keys.map(() => true);
  if (variant === 'window' && !p.globalLayer) allowed = keys.map((_, i) => i >= position - (p.window ?? 6));
  if (variant === 'sparse') {
    const top = new Set(scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]).slice(0, p.topK ?? 5).map(x => x[1]));
    allowed = keys.map((_, i) => top.has(i));
  }
  const max = Math.max(...scores.filter((_, i) => allowed[i]), -Infinity);
  const exps = scores.map((s, i) => allowed[i] ? Math.exp(s - max) : 0);
  const total = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(x => x / total);
}

function tokenNodes(n: number, position: number, y: number, describe: (i: number) => {tone: SceneNode['tone']; value: number; detail: string}): SceneNode[] {
  const r = Math.min(13, 380 / n);
  return Array.from({length: n}, (_, i) => {
    const d = describe(i);
    return {id: `t${i}`, x: rowX(n, i), y, w: r * 2, h: r * 2, round: true, value: d.value, tone: i === position ? 'focus' : d.tone,
      label: n <= 20 ? String(i + 1) : undefined, action: i >= 1 ? {param: 'position', value: i} : undefined,
      info: {title: t('net.node.token', {index: i + 1}), shape: 'd', detail: i === position ? t('net.node.tokenCurrent') : d.detail}};
  });
}

function attentionScene(variant: string, p: Params): Scene {
  const n = p.tokens, position = clamp(p.position, 1, n - 1), h = Math.max(1, p.queryHeads ?? 8), headDim = p.headDim ?? 128;
  const isLatent = variant === 'mla', g = variant === 'mha' ? h : isLatent ? 1 : clamp(p.kvHeads ?? 2, 1, h);
  const head = clamp(p.head ?? 0, 0, h - 1), groupOf = (q: number) => Math.floor(q * g / h), group = groupOf(head);
  const weights = attentionWeights(variant, p, position, head, group), peak = Math.max(...weights);
  const hasGate = variant === 'gated', gate = (p.gate ?? 100) / 100;
  const yToken = 42, yKv = 142, yQuery = 242, yGate = 316, yOut = 386;

  const nodes = tokenNodes(n, position, yToken, i => {
    if (i > position) return {tone: 'future', value: 0, detail: t('net.node.tokenFuture')};
    if (i === position) return {tone: 'focus', value: 1, detail: ''};
    if (weights[i] <= 0) return {tone: 'muted', value: 0, detail: t('net.node.tokenMasked')};
    return {tone: 'value', value: weights[i] / (peak || 1), detail: t('net.node.tokenVisible', {weight: pct(weights[i])})};
  });
  const edges: SceneEdge[] = [];
  const shownG = Math.min(g, MAX_HEADS), shownH = Math.min(h, MAX_HEADS), gCell = (x: number) => Math.floor(x * shownG / g), hCell = (x: number) => Math.floor(x * shownH / h);
  for (let k = 0; k < shownG; k++) {
    const actual = Math.floor(k * g / shownG), active = gCell(group) === k;
    const size = isLatent ? {w: Math.min(520, 120 + (p.latentRank ?? 512) / 3), h: 30} : {w: Math.min(30, SPAN / shownG - 4), h: 30};
    nodes.push({id: `kv${k}`, x: rowX(shownG, k), y: yKv, ...size, round: false, value: active ? .85 : .25, tone: 'value', label: isLatent ? `r = ${p.latentRank}` : shownG <= 16 ? String(actual + 1) : undefined,
      info: isLatent
        ? {title: t('net.node.latent'), shape: `r = ${p.latentRank}`, detail: t('net.node.latentDetail', {rank: p.latentRank})}
        : {title: t('net.node.kv', {index: actual + 1}), shape: `2 × T × ${headDim}`, detail: t('net.node.kvDetail', {count: Math.ceil(h / g)})}});
  }
  weights.forEach((w, i) => { if (w > .004) edges.push({from: `t${i}`, to: `kv${gCell(group)}`, weight: Math.min(1, w / (peak || 1))}); });
  for (let q = 0; q < shownH; q++) {
    const actual = Math.floor(q * h / shownH), selected = hCell(head) === q, kvGroup = groupOf(actual);
    nodes.push({id: `q${q}`, x: rowX(shownH, q), y: yQuery, w: Math.min(30, SPAN / shownH - 4), h: 26, round: false, value: selected ? 1 : .3, tone: selected ? 'focus' : 'value', label: shownH <= 16 ? String(actual + 1) : undefined,
      action: {param: 'head', value: actual}, info: {title: t('net.node.query', {index: actual + 1}), shape: `${headDim}`, detail: t('net.node.queryDetail', {group: kvGroup + 1})}});
    edges.push({from: `kv${gCell(kvGroup)}`, to: `q${q}`, weight: selected ? .9 : kvGroup === group ? .3 : .06});
    edges.push({from: `q${q}`, to: hasGate ? 'gate' : 'out', weight: selected ? .9 : .1});
  }
  if (hasGate) {
    nodes.push({id: 'gate', x: LEFT + SPAN / 2, y: yGate, w: 200, h: 26, round: false, value: gate, tone: 'value', label: `g = ${gate.toFixed(2)}`, info: {title: t('net.node.gate'), shape: 'd', detail: t('net.node.gateDetail', {value: gate.toFixed(2)})}});
    edges.push({from: 'gate', to: 'out', weight: gate});
  }
  nodes.push({id: 'out', x: LEFT + SPAN / 2, y: yOut, w: 260, h: 30, round: false, value: hasGate ? gate : .8, tone: 'value', info: {title: t('net.node.output'), shape: 'd', detail: t('net.node.outputDetail')}});

  const cachePerToken = isLatent ? (p.latentRank ?? 512) * 2 : 2 * g * headDim * 2;
  const cached = variant === 'window' && !p.globalLayer ? Math.min(position, p.window ?? 6) : position;
  const best = weights.indexOf(peak);
  const readouts = [
    {label: t('net.read.visible'), value: `${weights.filter(w => w > 0).length} / ${position}`},
    {label: t('net.read.topToken'), value: t('net.read.topTokenValue', {index: best + 1, weight: pct(peak)})},
    {label: t('net.read.cachePerToken'), value: formatBytes(cachePerToken)},
    {label: t('net.read.cacheTotal'), value: formatBytes(cachePerToken * cached)},
    {label: t('net.read.cacheSaving'), value: pct(cachePerToken / (2 * h * headDim * 2))},
  ];
  if (hasGate) readouts.push({label: t('net.read.gateOutput'), value: pct(gate)});
  const lanes = [{label: t('net.lane.tokens'), y: yToken}, {label: t(isLatent ? 'net.lane.latent' : 'net.lane.kv'), y: yKv}, {label: t('net.lane.query'), y: yQuery}, ...(hasGate ? [{label: t('net.lane.gate'), y: yGate}] : []), {label: t('net.lane.output'), y: yOut}];
  const note = h > MAX_HEADS || g > MAX_HEADS ? t('net.compressed', {shown: shownH, total: h}) : undefined;
  return {nodes, edges, lanes, readouts, note};
}

function stateScene(variant: string, p: Params): Scene {
  const n = p.tokens, position = clamp(p.position, 1, n - 1), d = p.stateDim ?? 8, rows = Math.min(d, 12), lambda = (p.memory ?? 80) / 100;
  const yToken = 42, top = 96, cellH = Math.min(22, 230 / rows), yOut = 386;
  const cellW = Math.min(26, SPAN / n - 2);
  const history: number[][] = [];
  let state = Array.from({length: rows}, () => 0);
  for (let i = 0; i <= position; i++) {
    state = state.map((s, j) => {
      const x = rand(i + 5, j) * 2 - 1;
      if (variant === 'statespace') { const a = Math.pow(lambda, 1 + j / rows); return a * s + (1 - a) * x; }
      if (variant === 'recurrent') { const f = lambda * (1 / (1 + Math.exp(-3 * x - 1))); return f * s + (1 - f) * x; }
      return lambda * s + (1 - lambda) * x;
    });
    history.push(state);
  }
  const nodes = tokenNodes(n, position, yToken, i => i > position ? {tone: 'future', value: 0, detail: t('net.node.tokenFuture')} : {tone: 'value', value: .35, detail: t('net.node.tokenPlain')});
  const edges: SceneEdge[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
    const future = i > position, v = future ? 0 : (history[i][j] + 1) / 2;
    nodes.push({id: `s${i}_${j}`, x: rowX(n, i), y: top + cellH * (j + .5), w: cellW, h: cellH - 2, round: false, value: v, tone: future ? 'future' : 'value',
      action: i >= 1 ? {param: 'position', value: i} : undefined,
      info: {title: t('net.node.state', {dim: j + 1, index: i + 1}), shape: '1', detail: future ? t('net.node.stateFuture') : t('net.node.stateDetail', {value: history[i][j].toFixed(2)})}});
  }
  edges.push({from: `t${position}`, to: `s${position}_0`, weight: 1});
  nodes.push({id: 'readout', x: rowX(n, position), y: yOut, w: 170, h: 30, round: false, value: .8, tone: 'value', info: {title: t('net.node.stateOutput'), shape: 'd', detail: t('net.node.stateOutputDetail')}});
  edges.push({from: `s${position}_${rows - 1}`, to: 'readout', weight: 1});
  const stateBytes = (variant === 'statespace' ? d : d * d) * 2, attention = position * 2 * d * 2;
  const retained = variant === 'statespace' ? Math.pow(lambda, position * 1.5) : Math.pow(lambda, position);
  return {nodes, edges, lanes: [{label: t('net.lane.tokens'), y: yToken}, {label: t('net.lane.state'), y: top + cellH * rows / 2}, {label: t('net.lane.output'), y: yOut}], readouts: [
    {label: t('net.read.stateSize'), value: formatBytes(stateBytes)},
    {label: t('net.read.attentionEquivalent'), value: formatBytes(attention)},
    {label: t('net.read.retained'), value: pct(retained)},
  ], note: d > rows ? t('net.compressed', {shown: rows, total: d}) : undefined};
}

function convScene(p: Params): Scene {
  const n = p.tokens, position = clamp(p.position, 1, n - 1), k = p.kernel ?? 4, layers = p.layers ?? 6, d = p.hiddenSize ?? 1024;
  const yToken = 60, yOut = 300, first = Math.max(0, position - k + 1);
  const raw = Array.from({length: k}, (_, j) => rand(j + 3, 9) + .2), sum = raw.reduce((a, b) => a + b, 0), kernel = raw.map(x => x / sum);
  const nodes = tokenNodes(n, position, yToken, i => {
    if (i > position) return {tone: 'future', value: 0, detail: t('net.node.tokenFuture')};
    if (i >= first) return {tone: 'value', value: .35 + kernel[position - i] * 1.6, detail: t('net.node.filterWeight', {weight: kernel[position - i].toFixed(2)})};
    return {tone: 'muted', value: 0, detail: t('net.node.tokenMasked')};
  });
  const edges: SceneEdge[] = [];
  const r = Math.min(13, 380 / n);
  for (let i = 0; i < n; i++) {
    const available = Math.min(i + 1, k);
    nodes.push({id: `f${i}`, x: rowX(n, i), y: yOut, w: r * 2, h: r * 2, round: false, value: i > position ? 0 : .25 + rand(i, 2) * .6, tone: i === position ? 'focus' : i > position ? 'future' : 'value', action: i >= 1 ? {param: 'position', value: i} : undefined,
      info: {title: t('net.node.filter', {index: i + 1}), shape: 'd', detail: t('net.node.filterDetail', {count: available - 1})}});
  }
  for (let i = first; i <= position; i++) edges.push({from: `t${i}`, to: `f${position}`, weight: Math.min(1, .3 + kernel[position - i] * 2)});
  return {nodes, edges, lanes: [{label: t('net.lane.tokens'), y: yToken}, {label: t('net.lane.filter'), y: yOut}], readouts: [
    {label: t('net.read.receptive'), value: t('net.read.receptiveValue', {count: 1 + layers * (k - 1)})},
    {label: t('net.read.streaming'), value: formatBytes((k - 1) * d * 2)},
  ]};
}

function expertScene(p: Params): Scene {
  const n = p.tokens, position = clamp(p.position, 1, n - 1), E = p.experts ?? 64, k = clamp(p.active ?? 4, 1, E), shared = p.shared ?? 0;
  const yToken = 36, yRouter = 104, top = 160, yOut = 396, shown = Math.min(E, MAX_EXPERTS), columns = Math.min(32, Math.ceil(Math.sqrt(shown * 5))), rows = Math.ceil(shown / columns);
  const cellH = Math.min(30, 150 / rows), token = vec(position * 7 + 3);
  const scores = Array.from({length: E}, (_, e) => dot(token, vec(e * 11 + 5)));
  const ranked = scores.map((s, e) => [s, e] as const).sort((a, b) => b[0] - a[0]).slice(0, k);
  const low = ranked[ranked.length - 1][0], high = ranked[0][0];
  const cellOf = (e: number) => Math.floor(e * shown / E), activeCells = new Map<number, number>();
  for (const [score, e] of ranked) activeCells.set(cellOf(e), Math.max(activeCells.get(cellOf(e)) ?? -Infinity, score));
  const nodes = tokenNodes(n, position, yToken, i => i > position ? {tone: 'future', value: 0, detail: t('net.node.tokenFuture')} : {tone: 'value', value: .35, detail: t('net.node.tokenPlain')});
  nodes.push({id: 'router', x: LEFT + SPAN / 2, y: yRouter, w: 220, h: 28, round: false, value: .7, tone: 'value', label: `top-${k}`, info: {title: t('net.node.router'), shape: `${count(E)}`, detail: t('net.node.routerDetail', {count: count(E), k})}});
  const edges: SceneEdge[] = [{from: `t${position}`, to: 'router', weight: 1}];
  const gridWidth = SPAN - (shared ? 110 : 0), cellW = Math.min(26, gridWidth / columns - 2);
  for (let c = 0; c < shown; c++) {
    const col = c % columns, row = Math.floor(c / columns), score = activeCells.get(c), active = score !== undefined;
    const actual = Math.floor(c * E / shown);
    nodes.push({id: `e${c}`, x: LEFT + gridWidth * (col + .5) / columns, y: top + cellH * (row + .5), w: cellW, h: cellH - 3, round: false, value: active ? .55 + .45 * ((score! - low) / ((high - low) || 1)) : .08, tone: active ? 'value' : 'muted',
      info: {title: t('net.node.expert', {index: actual + 1}), shape: 'd → d_e → d', detail: active ? t('net.node.expertActive', {score: score!.toFixed(2)}) : t('net.node.expertIdle')}});
    if (active) { edges.push({from: 'router', to: `e${c}`, weight: .8}); edges.push({from: `e${c}`, to: 'combine', weight: .8}); }
  }
  for (let s = 0; s < Math.min(shared, 4); s++) {
    nodes.push({id: `shared${s}`, x: SCENE_WIDTH - 62, y: top + 16 + s * 36, w: 80, h: 28, round: false, value: .9, tone: 'value', label: 'S', info: {title: t('net.node.shared', {index: s + 1}), shape: 'd → d_s → d', detail: t('net.node.sharedDetail')}});
    edges.push({from: 'router', to: `shared${s}`, weight: .5});
    edges.push({from: `shared${s}`, to: 'combine', weight: .5});
  }
  nodes.push({id: 'combine', x: LEFT + SPAN / 2, y: yOut, w: 260, h: 28, round: false, value: .8, tone: 'value', info: {title: t('net.node.combine'), shape: 'd', detail: t('net.node.combineDetail')}});
  return {nodes, edges, lanes: [{label: t('net.lane.tokens'), y: yToken}, {label: t('net.lane.router'), y: yRouter}, {label: t('net.lane.experts'), y: top + cellH * rows / 2}, {label: t('net.lane.output'), y: yOut}], readouts: [
    {label: t('net.read.selected'), value: `${k} / ${count(E)}`},
    {label: t('net.read.activeShare'), value: pct(k / E)},
    {label: t('net.read.memoryShare'), value: pct(1 - k / E)},
  ], note: E > MAX_EXPERTS ? t('net.compressed', {shown, total: count(E)}) : undefined};
}

function denseScene(p: Params): Scene {
  const position = clamp(p.position, 1, p.tokens - 1), expansion = p.expansion ?? 3, d = p.hiddenSize ?? 1024, inputs = 6, hiddenCount = Math.min(24, inputs * expansion);
  const yIn = 60, yHidden = 210, yOut = 360, x = vec(position * 5 + 2).slice(0, inputs).map(v => (v + 1) / 2);
  const hidden = Array.from({length: hiddenCount}, (_, h) => Math.max(0, x.reduce((sum, v, i) => sum + v * (rand(h + 9, i) * 2 - 1), 0)));
  const peak = Math.max(...hidden, .001);
  const nodes: SceneNode[] = [], edges: SceneEdge[] = [];
  x.forEach((v, i) => nodes.push({id: `in${i}`, x: rowX(inputs, i), y: yIn, w: 26, h: 26, round: true, value: v, tone: 'value', info: {title: t('net.node.input', {index: i + 1}), shape: '1', detail: t('net.node.inputDetail')}}));
  hidden.forEach((v, h) => {
    nodes.push({id: `h${h}`, x: rowX(hiddenCount, h), y: yHidden, w: Math.min(24, SPAN / hiddenCount - 4), h: 24, round: true, value: v / peak, tone: v > 0 ? 'value' : 'muted', info: {title: t('net.node.hidden', {index: h + 1}), shape: '1', detail: t('net.node.hiddenDetail', {value: v.toFixed(2)})}});
    for (let i = 0; i < inputs; i++) edges.push({from: `in${i}`, to: `h${h}`, weight: Math.abs(rand(h + 9, i) * 2 - 1) * x[i] * .55});
    for (let o = 0; o < inputs; o++) if (v > 0) edges.push({from: `h${h}`, to: `o${o}`, weight: (v / peak) * .4 * rand(h + 2, o)});
  });
  for (let o = 0; o < inputs; o++) nodes.push({id: `o${o}`, x: rowX(inputs, o), y: yOut, w: 26, h: 26, round: true, value: rand(position, o) * .6 + .3, tone: 'value', info: {title: t('net.node.out', {index: o + 1}), shape: '1', detail: t('net.node.outDetail')}});
  const hiddenSize = d * expansion;
  return {nodes, edges, lanes: [{label: t('net.lane.input'), y: yIn}, {label: t('net.lane.hidden'), y: yHidden}, {label: t('net.lane.output'), y: yOut}], readouts: [
    {label: t('net.read.hiddenUnits'), value: t('net.read.dimValue', {d: count(d), h: count(hiddenSize)})},
    {label: t('net.read.ffnParams'), value: count(2 * d * hiddenSize)},
  ]};
}

function mtpScene(p: Params): Scene {
  const n = p.tokens, horizon = p.horizon ?? 3, position = clamp(p.position, 1, n - horizon - 1), accept = (p.accept ?? 70) / 100;
  const yToken = 60, yBackbone = 190, yPred = 320;
  const nodes = tokenNodes(n, position, yToken, i => i > position ? {tone: 'future', value: 0, detail: t('net.node.tokenFuture')} : {tone: 'value', value: .4, detail: t('net.node.tokenPlain')});
  nodes.push({id: 'backbone', x: rowX(n, position), y: yBackbone, w: 200, h: 34, round: false, value: .8, tone: 'value', info: {title: t('net.node.backbone'), shape: 'd', detail: t('net.node.backboneDetail')}});
  const edges: SceneEdge[] = [{from: `t${position}`, to: 'backbone', weight: 1}];
  const r = Math.min(13, 380 / n);
  for (let m = 0; m <= horizon; m++) {
    const probability = Math.pow(accept, m), i = position + 1 + m;
    nodes.push({id: `p${m}`, x: rowX(n, i), y: yPred, w: r * 2.2, h: r * 2.2, round: false, value: probability, tone: 'value', label: `+${m + 1}`, info: {title: t('net.node.predicted', {step: m + 1}), shape: '|V|', detail: t('net.node.predictedDetail', {value: pct(probability)})}});
    edges.push({from: 'backbone', to: `p${m}`, weight: probability});
  }
  const expected = accept >= 1 ? horizon + 1 : (1 - Math.pow(accept, horizon + 1)) / (1 - accept);
  return {nodes, edges, lanes: [{label: t('net.lane.tokens'), y: yToken}, {label: t('net.lane.backbone'), y: yBackbone}, {label: t('net.lane.predictions'), y: yPred}], readouts: [
    {label: t('net.read.yield'), value: expected.toFixed(2)},
    {label: t('net.read.limit'), value: (1 / (1 - accept)).toFixed(2)},
  ]};
}

export function simulate(scene: string, variant: string, params: Params): Scene {
  if (scene === 'state') return stateScene(variant, params);
  if (scene === 'conv') return convScene(params);
  if (scene === 'experts') return expertScene(params);
  if (scene === 'dense') return denseScene(params);
  if (scene === 'mtp') return mtpScene(params);
  return attentionScene(variant, params);
}
