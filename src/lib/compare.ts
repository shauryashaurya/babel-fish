import {layerStack, mechanisms, type Segment} from './architecture';
import {t} from './content';
import {FAMILY_NAMES, slms, type Slm} from './learning';
import {commercialLabel} from './selection';
import type {CommercialStatus, Model} from './types';

/** One spec, explained. Text lives in data/content/compare.json. */
export interface SpecSource {title: string; url: string;}
export interface SpecInfo {
  id: string; name: string; group: string; short: string; plain: string; technical: string[]; matters: string; configKeys: string[];
  math: {label: string; tex: string; note: string}[]; demo?: string; sources: SpecSource[]; related?: string[];
}
export interface CompareContent {intro: string; diagramNote: string; memoryNote: string; cacheNote: string; tableNote: string; groups: {id: string; name: string}[]; specs: SpecInfo[];
  /** Cloud instances drawn as reference lines on the memory chart, by instance name in data/infrastructure/cloud_instances.json. */
  memoryReferences?: {cloud: string; instances: string[]};}
export let compareContent: CompareContent = {intro: '', diagramNote: '', memoryNote: '', cacheNote: '', tableNote: '', groups: [], specs: []};
export const setCompareContent = (c: CompareContent) => { compareContent = c; };
export const specById = (id: string) => compareContent.specs.find(s => s.id === id);

export type AttentionType = 'MHA' | 'GQA' | 'MQA' | 'MLA';
export interface Rope {theta: number | null; type: string | null; factor: number | null; original: number | null; partial: number | null; localTheta: number | null;}
export interface CacheSplit {fullKiB: number; windowKiB: number; full: number; window: number; windowSize: number | null;}

/** A gallery model or a small model, reduced to the facts the comparison draws on. Null means the source does not state it. */
export interface Arch {
  id: string; name: string; kind: 'gallery' | 'slm'; href: string; publisher: string; released: string | null;
  family: string | null; attentionType: AttentionType | null; attentionText: string | null; layerMix: string | null; segments: Segment[];
  layers: number | null; hidden: number | null; heads: number | null; kvHeads: number | null; headDim: number | null; headDimStated: boolean;
  globalHeadDim: number | null; globalKvHeads: number | null; sharedKv: boolean;
  vocab: number | null; intermediate: number | null; moeIntermediate: number | null; experts: number | null; expertsActive: number | null; sharedExperts: number | null;
  ffnDense: number | null; ffnMoe: number | null;
  totalParams: number | null; activeParams: number | null; context: number | null; kvKiB: number | null; cache: CacheSplit | null;
  norm: string | null; activation: string | null; tied: boolean | null; rope: Rope | null; qkNorm: boolean | null; qkNormFrom: 'config' | 'gallery' | null;
  logitSoftcap: number | null; attnSoftcap: number | null; mtp: number | null; latentRank: number | null;
  weightGiB: number | null; precision: string | null; licence: string; commercial: CommercialStatus; vision: boolean; audio: boolean;
  configUrl: string | null; sourceUrl: string;
}

const pos = (v: number | null | undefined) => typeof v === 'number' && v > 0 ? v : null;
function typeOf(heads: number | null, kvHeads: number | null, latent: boolean): AttentionType | null {
  if (latent) return 'MLA';
  if (!heads || !kvHeads) return null;
  return kvHeads === heads ? 'MHA' : kvHeads === 1 ? 'MQA' : 'GQA';
}

export function fromModel(m: Model): Arch {
  const o = m.official, d = o?.details ?? null;
  const latent = !!(o?.kvLatentRank || d?.cache?.method === 'latent');
  const qkConfig = d?.qkNorm === true, qkGallery = /QK[- ]?Norm/i.test(m.architecture.attention || '');
  const c = d?.cache && d.cache.agrees && d.layout ? {fullKiB: d.cache.fullKiB, windowKiB: d.cache.windowKiB, full: d.layout.full, window: d.layout.window, windowSize: d.layout.windowSize} : null;
  return {
    id: m.id, name: m.name, kind: 'gallery', href: `#/model/${encodeURIComponent(m.id)}`, publisher: m.publisher, released: m.released || null,
    family: m.architecture.class, attentionType: typeOf(pos(o?.heads), pos(o?.kvHeads), latent), attentionText: m.architecture.attention, layerMix: m.architecture.layerMix, segments: layerStack(m),
    layers: pos(o?.layers), hidden: pos(o?.hiddenSize), heads: pos(o?.heads), kvHeads: pos(o?.kvHeads), headDim: pos(d?.headDim), headDimStated: !!d?.headDimStated,
    globalHeadDim: pos(d?.globalHeadDim), globalKvHeads: pos(d?.globalKvHeads), sharedKv: !!d?.sharedKv,
    vocab: pos(o?.vocab), intermediate: pos(d?.intermediate), moeIntermediate: pos(d?.moeIntermediate), experts: pos(o?.experts), expertsActive: pos(o?.expertsActive), sharedExperts: pos(o?.sharedExperts),
    ffnDense: d?.ffn?.dense ?? null, ffnMoe: d?.ffn?.moe ?? null,
    totalParams: m.totalParams, activeParams: m.activeParams, context: m.context, kvKiB: m.kvKiBPerToken, cache: c,
    norm: d?.norm ?? null, activation: d?.activation || null, tied: d?.tied ?? null, rope: d?.rope ?? null,
    qkNorm: qkConfig || qkGallery ? true : null, qkNormFrom: qkConfig ? 'config' : qkGallery ? 'gallery' : null,
    logitSoftcap: pos(d?.logitSoftcap), attnSoftcap: pos(d?.attnSoftcap), mtp: pos(d?.mtp ?? o?.mtpModules), latentRank: pos(o?.kvLatentRank),
    weightGiB: m.weightGiB, precision: o?.storedPrecision ?? null, licence: m.license.rule.name, commercial: m.license.rule.commercial,
    vision: !!o?.vision, audio: !!o?.audio, configUrl: o?.configUrl ?? null, sourceUrl: m.galleryUrl,
  };
}

function slmSegments(s: Slm): Segment[] {
  const l = s.architecture?.layout;
  if (!l || l.unknown) return [];
  const mech = (id: string) => mechanisms.find(m => m.id === id) ?? null;
  const attention = mech(s.architecture?.attention === 'MHA' ? 'mha' : 'gqa');
  const other = /Mamba/i.test(l.otherKind || '') ? mech('statespace') : /conv/i.test(l.otherKind || '') ? mech('convolution') : mech('linear');
  return [
    l.full ? {count: l.full, label: t('compare.fullAttention'), mechanism: attention} : null,
    l.window ? {count: l.window, label: t('compare.slidingWindow', {window: l.windowSize ?? '?'}), mechanism: mech('window')} : null,
    l.other ? {count: l.other, label: l.otherKind || t('compare.otherLayers'), mechanism: other} : null,
  ].filter((x): x is Segment => !!x);
}

export function fromSlm(s: Slm): Arch {
  const a = s.architecture, l = a?.layout;
  const latent = a?.attention === 'MLA';
  return {
    id: s.id, name: s.name, kind: 'slm', href: `#/slm/${encodeURIComponent(s.id)}`, publisher: s.publisher, released: s.released,
    family: s.family ? FAMILY_NAMES[s.family] : null, attentionType: a?.attention ?? null, attentionText: null,
    layerMix: l && !l.unknown ? slmSegments(s).map(x => `${x.count} ${x.label}`).join(' + ') : null, segments: slmSegments(s),
    layers: s.layers, hidden: s.hiddenSize, heads: s.heads, kvHeads: s.kvHeads, headDim: a?.headDim ?? null, headDimStated: false,
    globalHeadDim: null, globalKvHeads: null, sharedKv: false,
    vocab: a?.vocab ?? null, intermediate: a?.intermediate ?? null, moeIntermediate: null, experts: a?.experts ?? null, expertsActive: a?.expertsActive ?? null, sharedExperts: null,
    ffnDense: null, ffnMoe: null,
    totalParams: s.params, activeParams: null, context: s.context, kvKiB: s.kvKiBPerToken,
    cache: s.cache && !latent ? {fullKiB: s.cache.perLayerKiB, windowKiB: s.cache.perLayerKiB, full: s.cache.fullLayers, window: s.cache.windowLayers, windowSize: s.cache.window} : null,
    norm: null, activation: a?.activation ?? null, tied: a?.tied ?? null,
    rope: a?.ropeTheta ? {theta: a.ropeTheta, type: null, factor: null, original: null, partial: null, localTheta: null} : null,
    qkNorm: a?.qkNorm ? true : null, qkNormFrom: a?.qkNorm ? 'config' : null,
    logitSoftcap: null, attnSoftcap: null, mtp: null, latentRank: null,
    weightGiB: s.weightGiB, precision: s.precision, licence: s.license.rule.name, commercial: s.license.rule.commercial,
    vision: false, audio: false, configUrl: s.configUrl, sourceUrl: s.url,
  };
}

/** Every model that can be compared: the gallery first, then small models not already in it. */
export function allArchs(models: Model[]): Arch[] {
  return [...models.map(fromModel), ...slms.filter(s => !s.galleryModelId).map(fromSlm)];
}

const GIB = 1024 ** 3, MIB_PER_GIB = 1024 * 1024;
export const WEIGHT_BYTES: Record<string, number> = {published: 0, bit16: 2, bit8: 1, bit4: .5};
export const CACHE_BYTES: Record<string, number> = {bit16: 2, bit8: 1};

export function weightGiB(a: Arch, precision: string): number | null {
  const bytes = WEIGHT_BYTES[precision];
  if (!bytes) return a.weightGiB ?? (a.totalParams ? a.totalParams * 2 / GIB : null);
  return a.totalParams ? a.totalParams * bytes / GIB : null;
}
/** Cache for one session at the given length. Sliding-window layers stop growing at their window when the configuration's layer split is known. */
export function cacheGiB(a: Arch, tokens: number, cacheBytes = 2): number | null {
  const scale = cacheBytes / 2, n = a.context ? Math.min(tokens, a.context) : tokens;
  if (a.cache) {
    const w = a.cache.windowSize ? Math.min(n, a.cache.windowSize) : n;
    return (a.cache.fullKiB * a.cache.full * n + a.cache.windowKiB * a.cache.window * w) * scale / MIB_PER_GIB;
  }
  return a.kvKiB === null ? null : a.kvKiB * n * scale / MIB_PER_GIB;
}
/** Bytes kept per token once the context is longer than every window, so only full-attention layers keep growing. */
export function longRangeKiB(a: Arch): number | null {
  if (a.cache) return a.cache.fullKiB * a.cache.full;
  return a.kvKiB;
}

export const fmtInt = (v: number | null) => v === null ? null : v.toLocaleString('en-US');
export function fmtParams(v: number | null) {
  if (v === null) return null;
  if (v >= 1e12) return `${+(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  return `${+(v / 1e6).toFixed(0)}M`;
}
export function fmtTokens(v: number | null) {
  if (v === null) return null;
  if (v >= 1048576 && v % 1048576 === 0) return `${v / 1048576}M`;
  if (v >= 1024 && v % 1024 === 0) return `${v / 1024}K`;
  return v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : String(v);
}
export const fmtGiB = (v: number | null) => v === null ? null : v >= 100 ? `${v.toFixed(0)} GiB` : v >= 10 ? `${v.toFixed(1)} GiB` : `${v.toFixed(2)} GiB`;
export const fmtKiB = (v: number | null) => v === null ? null : `${+v.toFixed(1)} KiB`;

/** One comparable fact. The text is what each card shows; the number, when there is one, draws the bar. */
export interface Dimension {id: string; label: string; spec: string; group: string; text: (a: Arch) => string | null; num?: (a: Arch) => number | null; note?: (a: Arch) => string | null;}

function ropeText(r: Rope | null) {
  if (!r) return null;
  const parts = [r.theta ? t('compare.ropeBase', {theta: fmtInt(r.theta)!}) : t('compare.ropeNoBase')];
  if (r.partial) parts.push(t('compare.ropePartial', {pct: Math.round(r.partial * 100)}));
  if (r.type) parts.push(r.factor ? t('compare.ropeScaled', {type: r.type, factor: +r.factor.toFixed(2)}) : r.type);
  if (r.localTheta) parts.push(t('compare.ropeLocal', {theta: fmtInt(r.localTheta)!}));
  return parts.join(' · ');
}
export function attentionSummary(a: Arch) {
  if (!a.attentionType) return null;
  if (a.attentionType === 'MLA') return a.latentRank ? t('compare.mlaSummary', {heads: a.heads ?? '?', rank: a.latentRank}) : 'MLA';
  return t('compare.headsSummary', {type: a.attentionType, heads: a.heads ?? '?', kv: a.kvHeads ?? '?'});
}
export function ffnSummary(a: Arch) {
  if (a.experts) {
    const base = t('compare.moeSummary', {experts: a.experts, active: a.expertsActive ?? '?'});
    const width = a.moeIntermediate ? ` · ${t('compare.expertWidth', {width: fmtInt(a.moeIntermediate)!})}` : '';
    const shared = a.sharedExperts ? ` · ${t('compare.sharedExperts', {n: a.sharedExperts})}` : '';
    return base + width + shared;
  }
  return a.intermediate ? t('compare.denseSummary', {width: fmtInt(a.intermediate)!}) : null;
}

export const DIMENSIONS: Dimension[] = [
  {id: 'family', label: 'compare.dim.family', spec: 'family', group: 'shape', text: a => a.family},
  {id: 'scale', label: 'compare.dim.scale', spec: 'scale', group: 'shape', num: a => a.totalParams,
    text: a => a.totalParams === null ? null : a.activeParams ? t('compare.totalActive', {total: fmtParams(a.totalParams)!, active: fmtParams(a.activeParams)!, pct: (100 * a.activeParams / a.totalParams).toFixed(1)}) : t('compare.totalOnly', {total: fmtParams(a.totalParams)!})},
  {id: 'layers', label: 'compare.dim.layers', spec: 'layers', group: 'shape', num: a => a.layers, text: a => fmtInt(a.layers)},
  {id: 'recipe', label: 'compare.dim.recipe', spec: 'window', group: 'shape', text: a => a.layerMix},
  {id: 'hidden', label: 'compare.dim.hidden', spec: 'embedding', group: 'shape', num: a => a.hidden, text: a => fmtInt(a.hidden)},
  {id: 'vocab', label: 'compare.dim.vocab', spec: 'vocab', group: 'shape', num: a => a.vocab, text: a => fmtInt(a.vocab)},
  {id: 'attention', label: 'compare.dim.attention', spec: 'attention', group: 'attention', text: attentionSummary},
  {id: 'attentionText', label: 'compare.dim.attentionText', spec: 'attention', group: 'attention', text: a => a.attentionText},
  {id: 'headDim', label: 'compare.dim.headDim', spec: 'headdim', group: 'attention', num: a => a.headDim,
    text: a => a.headDim === null ? null : a.globalHeadDim ? t('compare.headDimGlobal', {local: a.headDim, global: a.globalHeadDim}) : String(a.headDim)},
  {id: 'qkNorm', label: 'compare.dim.qkNorm', spec: 'qknorm', group: 'attention', text: a => a.qkNorm ? t(a.qkNormFrom === 'gallery' ? 'compare.yesGallery' : 'compare.yes') : null},
  {id: 'position', label: 'compare.dim.position', spec: 'position', group: 'attention', text: a => ropeText(a.rope)},
  {id: 'window', label: 'compare.dim.window', spec: 'window', group: 'attention', num: a => a.cache?.windowSize ?? null,
    text: a => a.cache ? (a.cache.window ? t('compare.windowLayers', {n: a.cache.window, total: a.layers ?? '?', w: fmtInt(a.cache.windowSize) ?? '?'}) : t('compare.noWindow')) : null},
  {id: 'ffn', label: 'compare.dim.ffn', spec: 'ffn', group: 'ffn', text: ffnSummary, num: a => a.experts ? a.moeIntermediate : a.intermediate},
  {id: 'experts', label: 'compare.dim.experts', spec: 'moe', group: 'ffn', num: a => a.experts,
    text: a => a.experts ? t('compare.expertsText', {experts: a.experts, active: a.expertsActive ?? '?'}) + (a.ffnDense ? ` · ${t('compare.denseLayers', {n: a.ffnDense})}` : '') : a.family ? t('compare.noExperts') : null},
  {id: 'activation', label: 'compare.dim.activation', spec: 'ffn', group: 'ffn', text: a => a.activation},
  {id: 'norm', label: 'compare.dim.norm', spec: 'norm', group: 'ffn', text: a => a.norm},
  {id: 'output', label: 'compare.dim.output', spec: 'output', group: 'output', text: a => a.tied === null ? null : t(a.tied ? 'compare.tied' : 'compare.untied')},
  {id: 'softcap', label: 'compare.dim.softcap', spec: 'output', group: 'output', num: a => a.logitSoftcap,
    text: a => a.logitSoftcap ? t('compare.softcapText', {cap: a.logitSoftcap}) + (a.attnSoftcap ? ` · ${t('compare.attnSoftcap', {cap: a.attnSoftcap})}` : '') : a.kind === 'gallery' && a.configUrl ? t('compare.notConfigured') : null},
  {id: 'mtp', label: 'compare.dim.mtp', spec: 'mtp', group: 'output', num: a => a.mtp, text: a => a.mtp ? t('compare.mtpText', {n: a.mtp}) : a.kind === 'gallery' && a.configUrl ? t('compare.notConfigured') : null},
  {id: 'context', label: 'compare.dim.context', spec: 'context', group: 'memory', num: a => a.context, text: a => fmtInt(a.context)},
  {id: 'kv', label: 'compare.dim.kv', spec: 'cache', group: 'memory', num: a => a.kvKiB, text: a => fmtKiB(a.kvKiB),
    note: a => a.cache && a.cache.window && a.cache.windowSize ? t('compare.kvLongRange', {kib: fmtKiB(longRangeKiB(a))!, w: fmtInt(a.cache.windowSize)!}) : null},
  {id: 'weights', label: 'compare.dim.weights', spec: 'scale', group: 'memory', num: a => a.weightGiB, text: a => fmtGiB(a.weightGiB), note: a => a.precision},
  {id: 'licence', label: 'compare.dim.licence', spec: 'licence', group: 'governance', text: a => a.licence, note: a => commercialLabel(a.commercial)},
  {id: 'inputs', label: 'compare.dim.inputs', spec: 'inputs', group: 'governance', text: a => [t('compare.text'), a.vision ? t('compare.images') : '', a.audio ? t('compare.audio') : ''].filter(Boolean).join(', ')},
  {id: 'released', label: 'compare.dim.released', spec: 'licence', group: 'governance', text: a => a.released},
];

/** Same when every stated value matches. Missing values are reported separately rather than counted as a difference. */
export function verdict(d: Dimension, items: Arch[]): 'same' | 'different' | 'partial' {
  const values = items.map(d.text);
  const stated = values.filter((v): v is string => v !== null);
  if (stated.length < 2) return 'partial';
  const same = stated.every(v => v === stated[0]);
  return !same ? 'different' : stated.length < values.length ? 'partial' : 'same';
}

/** Distribution of one fact across the whole catalog, for the explanations page. */
export function distribution(items: Arch[], dim: Dimension, limit = 8) {
  const counts = new Map<string, number>();
  for (const a of items) { const v = dim.text(a); if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1); }
  const rows = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([label, value]) => ({label, value}));
  const rest = rows.slice(limit).reduce((n, r) => n + r.value, 0);
  return rest ? [...rows.slice(0, limit), {label: t('compare.otherValues', {n: rows.length - limit}), value: rest}] : rows;
}

/** Colour slot for each compared model, in list order. Five fixed, distinct tones. */
export const MODEL_TONES = [1, 2, 3, 7, 5];
export const MODEL_LETTERS = ['A', 'B', 'C', 'D', 'E'];
export const findArch = (all: Arch[], id: string) => all.find(a => a.id === id);
