/**
 * Cost planning (FinOps). API models are priced from the providers' published list prices; open-weight models are
 * priced as self-hosted GPU capacity, sized with a roofline estimate from NVIDIA's published memory bandwidth and
 * compute. Every assumption is an input the user can change. All data lives in data/finops/.
 */
import {writable} from 'svelte/store';
import {infrastructure, servedWeightsGiB, type CloudInstance} from './infrastructure';
import type {Model} from './types';

// ---------- Data ----------
export interface PriceSet {
  from: string | null;
  input: number; cacheWrite?: number; cachedInput: number; output: number;
  batchInput: number; batchCachedInput?: number; batchOutput: number;
  long?: Omit<PriceSet, 'from' | 'long'> & {above: number};
}
export interface ApiModel {
  id: string; name: string; provider: string; apiId: string; status: 'ga' | 'preview';
  context: number; maxInput?: number; maxOutput: number; vision: boolean | null; residency: boolean | null;
  source: string; prices: PriceSet[];
}
export interface Provider {
  id: string; name: string; country: string; pricingUrl: string; modelsUrl: string;
  terms: {title: string; url: string}; policy: {title: string; url: string} | null;
  cacheNote: string; batchNote: string; residency: {multiplier: number; text: string} | null;
}
export interface ApiContent {retrievedOn: string; basis: string; providers: Provider[]; models: ApiModel[]}
export interface GpuSpec {id: string; match: string[]; minMemGiB?: number; maxMemGiB?: number; bandwidthGBs: number | null; bf16Tflops: number | null; note: string; source: string}
export interface CloudPrices {region: string | null; source: {title: string; url: string}; prices: Record<string, number>; otherRegion?: Record<string, string>; missing: Record<string, string>; note?: string}
export interface PriceContent {retrievedOn: string; basis: string; clouds: Record<string, CloudPrices>; gpus: {basis: string; specs: GpuSpec[]}}

export let apiContent: ApiContent = {retrievedOn: '', basis: '', providers: [], models: []};
export let priceContent: PriceContent = {retrievedOn: '', basis: '', clouds: {}, gpus: {basis: '', specs: []}};
export interface WorkloadPreset {id: string; name: string; text: string; workload: Omit<Workload, 'residency'>}
export let workloads: {note: string; presets: WorkloadPreset[]} = {note: '', presets: []};
export const setFinops = (a: ApiContent, p: PriceContent, w: typeof workloads) => { apiContent = a; priceContent = p; workloads = w; };
export const providerOf = (id: string) => apiContent.providers.find(p => p.id === id) ?? null;
export const apiModelOf = (id: string) => apiContent.models.find(m => m.id === id) ?? null;

/** The price set in force on a date (ISO yyyy-mm-dd): the latest one whose start is on or before it. */
export function priceAt(m: ApiModel, date: string): PriceSet {
  return [...m.prices].filter(p => !p.from || p.from <= date).sort((a, b) => (a.from ?? '').localeCompare(b.from ?? '')).at(-1) ?? m.prices[0];
}
export const upcomingChange = (m: ApiModel, date: string) => m.prices.filter(p => p.from && p.from > date).sort((a, b) => a.from!.localeCompare(b.from!))[0] ?? null;

// ---------- Workload ----------
export interface Workload {
  requestsPerMonth: number; inputTokens: number; outputTokens: number;
  /** Share of each request's input that is a repeated prefix (system prompt, tools, documents). */
  cacheablePct: number;
  /** Share of that prefix served from cache rather than written to it. */
  cacheHitPct: number;
  /** Share of requests that can wait for the batch API. */
  batchPct: number;
  residency: boolean;
  /** Busiest hour over the average hour of operation. */
  peakFactor: number;
  growthPct: number;
}
export interface SelfHost {
  cloud: string; precision: 'published' | 'bit16' | 'bit8' | 'bit4'; cacheBits: 16 | 8;
  hoursPerMonth: number; utilisationPct: number; commitmentPct: number; headroomPct: number;
  bandwidthEffPct: number; mfuPct: number; maxBatch: number;
  /** Price per instance hour entered by the user, for clouds with no stored price. */
  customRates: Record<string, number>;
}
export interface PlannerState {models: string[]; workload: Workload; selfHost: SelfHost; preset: string; instanceOverrides: Record<string, string>}

export const defaultState = (): PlannerState => ({
  models: ['claude-sonnet-5-5', 'gpt-6-2-sol', 'gemini-4-argon'], preset: 'assistant', instanceOverrides: {},
  workload: {requestsPerMonth: 1_000_000, inputTokens: 3000, outputTokens: 500, cacheablePct: 60, cacheHitPct: 80, batchPct: 0, residency: false, peakFactor: 3, growthPct: 5},
  selfHost: {cloud: 'aws', precision: 'published', cacheBits: 16, hoursPerMonth: 730, utilisationPct: 60, commitmentPct: 0, headroomPct: 10, bandwidthEffPct: 60, mfuPct: 40, maxBatch: 64, customRates: {}},
});
const KEY = 'babel-fish.finops.v1';
function initial(): PlannerState {
  const d = defaultState();
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s ? {...d, ...s, workload: {...d.workload, ...s.workload}, selfHost: {...d.selfHost, ...s.selfHost}} : d; } catch { return d; }
}
export const planner = writable<PlannerState>(initial());
planner.subscribe(v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } });
export const MAX_PLANNED = 8;
export function togglePlanned(id: string) {
  planner.update(s => s.models.includes(id) ? {...s, models: s.models.filter(x => x !== id)} : s.models.length >= MAX_PLANNED ? s : {...s, models: [...s.models, id]});
}

// ---------- API cost ----------
export interface CostParts {input: number; cached: number; output: number}
export interface ApiCost {kind: 'api'; monthly: number; parts: CostParts; perRequest: number; perMillion: number; long: boolean; prices: PriceSet; residencyApplied: boolean}

/** Monthly bill for an API model. Long-context prices apply to the whole request when its input passes the threshold. */
export function apiCost(m: ApiModel, w: Workload, date: string, requests = w.requestsPerMonth): ApiCost {
  const base = priceAt(m, date);
  const long = !!base.long && w.inputTokens > base.long.above;
  const p = long ? {...base, ...base.long} : base;
  const cacheable = w.inputTokens * w.cacheablePct / 100, hits = cacheable * w.cacheHitPct / 100, writes = cacheable - hits, fresh = w.inputTokens - cacheable;
  const write = p.cacheWrite ?? p.input, ratio = p.batchInput / p.input;
  const std = {input: fresh * p.input + writes * write, cached: hits * p.cachedInput, output: w.outputTokens * p.output};
  const bat = {input: fresh * p.batchInput + writes * write * ratio, cached: hits * (p.batchCachedInput ?? p.cachedInput * ratio), output: w.outputTokens * p.batchOutput};
  const prov = providerOf(m.provider);
  const residencyApplied = w.residency && !!m.residency && !!prov?.residency;
  const mult = residencyApplied ? prov!.residency!.multiplier : 1;
  const b = w.batchPct / 100, scale = requests / 1e6 * mult;
  const parts: CostParts = {input: ((1 - b) * std.input + b * bat.input) * scale, cached: ((1 - b) * std.cached + b * bat.cached) * scale, output: ((1 - b) * std.output + b * bat.output) * scale};
  const monthly = parts.input + parts.cached + parts.output;
  const tokens = requests * (w.inputTokens + w.outputTokens);
  return {kind: 'api', monthly, parts, perRequest: requests ? monthly / requests : 0, perMillion: tokens ? monthly / tokens * 1e6 : 0, long, prices: p, residencyApplied};
}

// ---------- Self-hosted cost ----------
const GIB = 1024 ** 3;
export function gpuSpec(instance: CloudInstance): GpuSpec | null {
  if (instance.fractional) return null;
  const per = instance.gpuMemoryGiB / instance.gpus;
  return priceContent.gpus.specs.find(s => s.match.includes(instance.gpu) &&(s.minMemGiB === undefined || per >= s.minMemGiB) && (s.maxMemGiB === undefined || per < s.maxMemGiB)) ?? null;
}
export function hourlyRate(cloud: string, instance: string, custom: Record<string, number>): {rate: number | null; custom: boolean} {
  const c = priceContent.clouds[cloud];
  if (custom[`${cloud}:${instance}`] > 0) return {rate: custom[`${cloud}:${instance}`], custom: true};
  return {rate: c?.prices[instance] ?? null, custom: false};
}
export type HostFlag = 'noPrice' | 'noBandwidth' | 'noCompute' | 'multiNode' | 'noArch' | 'contextShort';
export interface HostOption {
  instance: CloudInstance; nodes: number; weightsGiB: number; kvPerSeqGiB: number; batch: number;
  decodeTokS: number | null; capacityRps: number | null; replicas: number | null; rate: number | null; customRate: boolean;
  monthly: number | null; flags: HostFlag[]; spec: GpuSpec | null;
}
export interface HostCost {kind: 'self'; option: HostOption | null; options: HostOption[]; monthly: number | null; perRequest: number | null; perMillion: number | null; peakRps: number; flags: HostFlag[]}

function weightsFor(model: Model, instance: CloudInstance, precision: SelfHost['precision']): number | null {
  if (precision === 'published') return model.weightGiB === null ? null : servedWeightsGiB(model, instance);
  const bytes = {bit16: 2, bit8: 1, bit4: .5}[precision];
  return model.totalParams ? model.totalParams * bytes / GIB : null;
}

/**
 * One serving replica on one instance type. Decode is limited by memory bandwidth: each step reads the active
 * weights once for the whole batch plus every sequence's cache. Prefill is limited by compute: about
 * 2 × active parameters FLOPs per input token. A replica serves requests/s = 1 / (prefill time + output tokens × step time / batch).
 */
export function hostOption(model: Model, instance: CloudInstance, w: Workload, h: SelfHost, peakRps: number): HostOption | null {
  const weights = weightsFor(model, instance, h.precision);
  if (weights === null || model.kvKiBPerToken === null) return null;
  const flags: HostFlag[] = [];
  const seq = w.inputTokens + w.outputTokens;
  if (model.context && seq > model.context) flags.push('contextShort');
  const kvPerSeqGiB = model.kvKiBPerToken * (h.cacheBits / 16) * seq / (1024 * 1024);
  const usable = instance.gpuMemoryGiB * (1 - h.headroomPct / 100);
  const nodes = Math.max(1, Math.ceil((weights + kvPerSeqGiB) / usable));
  if (nodes > 1) flags.push('multiNode');
  const free = usable * nodes - weights;
  const batch = Math.max(1, Math.min(h.maxBatch, Math.floor(free / kvPerSeqGiB)));
  const spec = gpuSpec(instance);
  const {rate, custom} = hourlyRate(h.cloud, instance.name, h.customRates);
  if (rate === null) flags.push('noPrice');
  const bw = spec?.bandwidthGBs ? spec.bandwidthGBs * 1e9 * instance.gpus * nodes * h.bandwidthEffPct / 100 : null;
  if (!bw) flags.push('noBandwidth');
  const total = model.totalParams ?? 0, active = model.activeParams ?? total;
  const activeShare = total ? active / total : 1;
  // Expert weights read per step grow with the batch until every expert is read.
  const weightRead = weights * GIB * Math.min(1, activeShare * batch);
  const cacheRead = batch * model.kvKiBPerToken * (h.cacheBits / 16) * 1024 * (w.inputTokens + w.outputTokens / 2);
  const step = bw ? (weightRead + cacheRead) / bw : null;
  const flops = spec?.bf16Tflops ? spec.bf16Tflops * 1e12 * instance.gpus * nodes * h.mfuPct / 100 : null;
  if (!flops) flags.push('noCompute');
  const prefill = flops && active ? 2 * active * w.inputTokens / flops : 0;
  const capacityRps = step ? 1 / (prefill + w.outputTokens * step / batch) : null;
  const replicas = capacityRps ? Math.max(1, Math.ceil(peakRps / (capacityRps * h.utilisationPct / 100))) : null;
  const monthly = replicas !== null && rate !== null ? replicas * nodes * rate * h.hoursPerMonth * (1 - h.commitmentPct / 100) : null;
  return {instance, nodes, weightsGiB: weights, kvPerSeqGiB, batch, decodeTokS: step ? batch / step : null, capacityRps, replicas, rate, customRate: custom, monthly, flags, spec};
}

export function hostCost(model: Model, w: Workload, h: SelfHost, override = '', requests = w.requestsPerMonth): HostCost {
  const cloud = infrastructure.clouds.find(c => c.id === h.cloud);
  const peakRps = requests / (h.hoursPerMonth * 3600) * w.peakFactor;
  const options = (cloud?.instances ?? []).map(i => hostOption(model, i, w, h, peakRps)).filter((o): o is HostOption => !!o);
  // Prefer one instance per replica (splitting a model across machines needs a fast interconnect this estimate does not model),
  // then instances whose GPU figures are all published (a missing compute figure would leave prefill uncounted), then the cheapest.
  const complete = (o: HostOption) => !o.flags.includes('noCompute') && !o.flags.includes('noBandwidth');
  const priced = options.filter(o => o.monthly !== null).sort((a, b) => Number(a.nodes > 1) - Number(b.nodes > 1) || Number(complete(b)) - Number(complete(a)) || a.monthly! - b.monthly!);
  const option = (override ? options.find(o => o.instance.name === override) : null) ?? priced[0] ?? null;
  const tokens = requests * (w.inputTokens + w.outputTokens);
  const monthly = option?.monthly ?? null;
  const flags: HostFlag[] = model.kvKiBPerToken === null || model.weightGiB === null && !model.totalParams ? ['noArch'] : option ? option.flags : [];
  return {kind: 'self', option, options, monthly, perRequest: monthly !== null && requests ? monthly / requests : null, perMillion: monthly !== null && tokens ? monthly / tokens * 1e6 : null, peakRps, flags};
}

// ---------- Forecast and break-even ----------
/** First day of each of the next n months, starting with the current month (shown at today's prices). */
export function months(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({length: n}, (_, i) => { const d = new Date(Date.UTC(y, m - 1 + i, 1)); return i === 0 ? today : d.toISOString().slice(0, 10); });
}
/** Token counts in decimal units, as providers quote context windows (1,000,000 is 1M). */
export const tokensText = (v: number) => v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : String(v);
export const rateText = (v: number) => v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toPrecision(2);
export const volumes = (lo = 1e3, hi = 1e9, steps = 37) => Array.from({length: steps}, (_, i) => lo * (hi / lo) ** (i / (steps - 1)));
