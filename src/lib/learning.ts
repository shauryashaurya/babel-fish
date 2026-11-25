import type {LicenseRule, Model, ConfigSource} from './types';

export interface PlainItem {analogy: string; what: string; why: string; example: string; faq: {q: string; a: string}[];}
export interface Concept {id: string; term: string; plain: string; why: string; example: string;}
export interface KvWord {text: string; query: number[]; key: number[]; value: string;}
export interface SourceLink {title: string; url: string;}
export interface Explainers {
  concepts: Concept[];
  kvDemo: {intro: string; note: string; features: string[]; words: KvWord[]};
  expertFacts: {title: string; lead: string; steps: {title: string; text: string}[]; findingTitle: string; finding: string; source: SourceLink; implication: string; labIntro: string; labNote: string};
  families: Record<string, PlainItem>;
  mechanisms: Record<string, PlainItem>;
}
export interface TuningMethod {id: string; name: string; what: string; best: string; data: string; strength: string; limit: string; source: SourceLink;}
export interface TuningStage {id: string; title: string; summary: string; detail: string[]; watch: string; source?: SourceLink;}
export interface FineTuningContent {
  intro: {what: string; analogy: string; goodFor: string[]; badFor: string[]};
  ladder: {title: string; note: string; steps: {name: string; text: string}[]};
  methods: TuningMethod[];
  benefits: string[];
  limitations: string[];
  risks: {title: string; text: string; source?: SourceLink}[];
  checklist: string[];
  stages: TuningStage[];
  example: {system: string; user: string; assistant: string; templateNote: string};
  lora: {intro: string; note: string; source: SourceLink};
  dpo: {intro: string; note: string; source: SourceLink};
  schedule: {intro: string; note: string; source: SourceLink};
  slmGuide: {what: string; analogy: string; strengths: string[]; weaknesses: string[]; useWhen: string[]; avoidWhen: string[]; pattern: string; source: SourceLink; rankingNote: string; fitNote: string;
    patterns: {title: string; text: string}[]; quantNote: string; deployNote: string};
}
export interface LayerLayout {full: number; window: number; windowSize: number | null; other: number; otherKind: string | null; unknown: boolean;}
export interface SlmArchitecture {
  class: string | null; attention: 'MHA' | 'GQA' | 'MQA' | 'MLA' | null; headDim: number | null; vocab: number | null; intermediate: number | null; tied: boolean | null;
  ropeTheta: number | null; activation: string | null; experts: number | null; expertsActive: number | null; qkNorm: boolean; layout: LayerLayout | null;
}
export type Purpose = 'base' | 'instruct' | 'reasoning' | 'code' | 'tools';
export interface Slm {
  rank: number; id: string; name: string; repo: string; url: string; publisher: string; params: number; weightGiB: number; weightEstimated: boolean; tier: 'nano' | 'small' | 'medium';
  context: number | null; layers: number | null; hiddenSize: number | null; heads: number | null; kvHeads: number | null; kvKiBPerToken: number | null; modelType: string | null; precision: string | null;
  cache: {perLayerKiB: number; fullLayers: number; windowLayers: number; window: number | null} | null;
  architecture: SlmArchitecture | null; family: string | null; mechanisms: string[]; purpose: Purpose; languages: string[]; baseModel: string | null; papers: string[]; datasets: string[];
  library: string | null; configUrl: string | null; configSource?: ConfigSource;
  downloads30d: number; likes: number; score: number; released: string | null; updated: string | null; revision: string; gated: string | null; galleryModelId: string | null;
  license: {key: string; url: string; rule: LicenseRule}; flags: string[];
}
export interface Device {id: string; name: string; kind: 'edge' | 'laptop' | 'desktop' | 'datacenter'; memoryGB: number; bandwidthGBs: number; unified: boolean; source: string;}
export interface DeviceContent {retrievedOn: string; basis: string; devices: Device[];}

export let explainers = {} as Explainers;
export let fineTuning = {} as FineTuningContent;
export let slms: Slm[] = [];
export let devices: DeviceContent = {retrievedOn: '', basis: '', devices: []};
export function setLearning(e: Explainers, f: FineTuningContent, s: Slm[], d?: DeviceContent) { explainers = e; fineTuning = f; slms = s; if (d) devices = d; }

export const PRECISIONS = [{id: 'published', bytes: 0}, {id: 'bit16', bytes: 2}, {id: 'bit8', bytes: 1}, {id: 'bit4', bytes: .5}];
const GIB = 1024 ** 3;
export function slmWeights(s: Slm, precision: string) {
  const bytes = PRECISIONS.find(p => p.id === precision)?.bytes || 0;
  return bytes ? s.params * bytes / GIB : s.weightGiB;
}
/** Attention cache for one session. Sliding-window layers stop growing at their window; state-space and convolution layers are not counted. */
export function slmCacheGiB(s: Slm, contextTokens: number): number | null {
  const context = Math.min(contextTokens, s.context ?? contextTokens);
  if (s.cache) {
    const c = s.cache, windowTokens = c.window ? Math.min(context, c.window) : context;
    return c.perLayerKiB * (c.fullLayers * context + c.windowLayers * windowTokens) / (1024 * 1024);
  }
  return s.kvKiBPerToken === null ? null : s.kvKiBPerToken * context / (1024 * 1024);
}
/** Weights plus the attention cache for the given sessions, with 25% for runtime overhead. */
export function slmMemory(s: Slm, precision: string, contextTokens: number, sessions = 1) {
  return (slmWeights(s, precision) + (slmCacheGiB(s, contextTokens) ?? 0) * sessions) * 1.25;
}
/**
 * Upper bound on single-stream decoding speed. Generating one token reads every weight once plus the whole cache,
 * so speed cannot exceed memory bandwidth divided by those bytes. Real systems reach less than this.
 */
export function decodeBound(s: Slm, precision: string, contextTokens: number, device: {bandwidthGBs: number}) {
  const bytes = (slmWeights(s, precision) + (slmCacheGiB(s, contextTokens) ?? 0)) * GIB;
  return device.bandwidthGBs * 1e9 / bytes;
}
export const deviceGiB = (d: {memoryGB: number}) => d.memoryGB * 1e9 / GIB;

export const FAMILY_NAMES: Record<string, string> = {dense: 'Dense', 'sparse-moe': 'Sparse MoE', 'dense-hybrid': 'Dense hybrid', 'hybrid-moe': 'Hybrid MoE'};

/** Lets a small model be carried through Requirements, Evaluation and Decision like a catalog model. */
export function slmAsModel(s: Slm): Model {
  return {
    id: s.id, name: s.name, publisher: s.publisher, country: null, released: s.released ?? '', galleryUrl: s.url,
    architecture: {class: s.family ? FAMILY_NAMES[s.family] : null, attention: s.architecture?.attention ?? null, layerMix: null, keyDetail: null},
    scale: '', totalParams: s.params, activeParams: null, context: s.context, contextConfig: s.context, contextGallery: null, kvKiBPerToken: s.kvKiBPerToken,
    weightGiB: s.weightGiB, weightSource: s.weightEstimated ? 'estimate' : 'official-files', trainingData: null, postTraining: null, artificialAnalysisIndex: null,
    official: {repo: s.repo, url: s.url, revision: s.revision, lastModified: s.updated ?? '', gated: s.gated, configUrl: s.configUrl, pipeline: 'text-generation', library: s.library,
      languages: s.languages, architectures: s.architecture?.class ? [s.architecture.class] : null, modelType: s.modelType, hiddenSize: s.hiddenSize, layers: s.layers, heads: s.heads, kvHeads: s.kvHeads,
      vocab: s.architecture?.vocab ?? null, dtype: s.precision, storedPrecision: s.precision, quantized: false, checkpointParams: s.params, weightFormat: 'safetensors', weightFiles: 0, vision: false, audio: false},
    otherSources: [], license: s.license, flags: s.flags,
  };
}
export const isSlmId = (id: string) => slms.some(s => s.id === id);
