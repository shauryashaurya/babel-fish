import type {Model} from './types';

export interface Family {id: string; name: string; summary: string; how: string; why: string; watch: string; params: string; mixing: string;}
export interface Mechanism {
  id: string; name: string; summary: string; how: string; helps: string; watch: string; footprint: string; demo: string;
  match: string; matchClass?: string; segmentMatch?: string; source: {title: string; url: string}; group: string;
}
export interface Axis {id: string; name: string; text: string;}
export interface ArchitectureContent {families: Family[]; mechanisms: Mechanism[]; familyAxes: {question: string; params: Axis[]; mixing: Axis[]}; mechanismGroups: Axis[];}
export interface Segment {count: number; label: string; mechanism: Mechanism | null;}
export interface MathItem {label: string; tex: string; note: string;}
export interface ControlDef {id: string; min: number; max: number; step: number; value: number; toggle?: boolean;}
export interface BlockDef {scene: string; controls: ControlDef[];}
export interface TechnicalDetail {math: MathItem[]; strengths: string[]; weaknesses: string[]; limitations: string[]; caveats: string[];}
export interface ArchitectureDetails {
  feedForward: BlockDef;
  families: Record<string, TechnicalDetail & {defaultBlock: string}>;
  mechanisms: Record<string, TechnicalDetail & BlockDef>;
}

export let families: Family[] = [];
export let mechanisms: Mechanism[] = [];
export let familyAxes: ArchitectureContent['familyAxes'] = {question: '', params: [], mixing: []};
export let mechanismGroups: Axis[] = [];
export let details: ArchitectureDetails = {feedForward: {scene: 'dense', controls: []}, families: {}, mechanisms: {}};
let patterns = new Map<string, {match: RegExp; matchClass: RegExp | null; segment: RegExp}>();

export function setArchitecture(content: ArchitectureContent, technical?: ArchitectureDetails) {
  families = content.families;
  mechanisms = content.mechanisms;
  familyAxes = content.familyAxes;
  mechanismGroups = content.mechanismGroups;
  if (technical) details = technical;
  patterns = new Map(mechanisms.map(m => [m.id, {
    match: new RegExp(m.match, 'i'),
    matchClass: m.matchClass ? new RegExp(m.matchClass) : null,
    segment: new RegExp(m.segmentMatch || m.match, 'i'),
  }]));
}

export const FEED_FORWARD = 'ffn';
export const blockDef = (id: string): BlockDef => id === FEED_FORWARD ? details.feedForward : details.mechanisms[id];
export const familyOf = (model: Model) => families.find(f => f.name === model.architecture.class) || null;

export function hasMechanism(model: Model, id: string): boolean {
  const p = patterns.get(id);
  if (!p) return false;
  const text = `${model.architecture.attention || ''} ${model.architecture.layerMix || ''}`;
  return p.match.test(text) || !!p.matchClass?.test(model.architecture.class || '');
}

export const mechanismsOf = (model: Model) => mechanisms.filter(m => hasMechanism(model, m.id));

/** Splits the gallery's published layer mix, such as "45 sliding-window + 15 global", into drawable segments. */
export function layerStack(model: Model): Segment[] {
  const firstClause = (model.architecture.layerMix || '').split(';')[0];
  return firstClause.split('+').flatMap(part => {
    const found = part.trim().match(/^(\d+)\s+(.+)$/);
    if (!found) return [];
    const label = found[2].trim();
    return [{count: Number(found[1]), label, mechanism: mechanisms.find(m => patterns.get(m.id)?.segment.test(label)) || null}];
  });
}

const SERIES: Record<string, number> = {gqa: 1, mha: 1, linear: 2, statespace: 2, recurrent: 2, window: 3, moe: 4, mtp: 5, convolution: 6, mla: 7, sparse: 7, gated: 7};

/** Colour follows the kind of layer, so the same layer type looks the same in every model. */
export function segmentSeries(segment: Segment): number {
  if (/global|\bfull\b/i.test(segment.label)) return 1;
  return segment.mechanism ? SERIES[segment.mechanism.id] ?? 8 : 8;
}
