/**
 * The model diagram shared by Compare, the model card and the architecture page: its rows, and what each box does in a
 * particular model, worked out from that model's published configuration. Templates live in data/content/copy.json (diagram.*).
 */
import {segmentSeries} from './architecture';
import {attentionSummary, cacheGiB, ffnSummary, fmtInt, type Arch} from './compare';
import {t} from './content';

export interface DiagramRow {id: string; spec: string | null; repeat?: 'top' | 'mid' | 'bottom'; title: (a: Arch) => string; detail: (a: Arch) => string | null; kind?: string}
const n = (v: number | null) => fmtInt(v) ?? '?';
const D = (k: string, v: Record<string, string | number> = {}) => t(`diagram.${k}`, v);
const big = (v: number) => v >= 1e9 ? `${+(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v.toLocaleString('en-US');
const pct = (v: number) => `${(100 * v).toFixed(v < 0.01 ? 2 : 1)}%`;

function rope(a: Arch) {
  const r = a.rope;
  if (!r) return null;
  const parts = [r.theta ? t('compare.ropeBase', {theta: n(r.theta)}) : null, r.partial ? t('compare.ropePartial', {pct: Math.round(r.partial * 100)}) : null, r.type ? (r.factor ? t('compare.ropeScaled', {type: r.type, factor: +r.factor.toFixed(2)}) : r.type) : null, r.localTheta ? t('compare.ropeLocal', {theta: n(r.localTheta)}) : null];
  return parts.filter(Boolean).join(' · ');
}
export const isHybrid = (a: Arch) => a.segments.some(s => s.mechanism && ['linear', 'statespace', 'recurrent', 'convolution'].includes(s.mechanism.id));

export const ROWS: DiagramRow[] = [
  {id: 'input', spec: null, title: () => t('compare.d.input'), detail: () => null, kind: 'io'},
  {id: 'tokenizer', spec: 'vocab', title: () => t('compare.d.tokenizer'), detail: a => a.vocab ? t('compare.d.vocab', {n: n(a.vocab)}) : null},
  {id: 'embedding', spec: 'embedding', title: () => t('compare.d.embedding'), detail: a => a.hidden ? t('compare.d.dims', {n: n(a.hidden)}) : null, kind: 'key'},
  {id: 'norm1', spec: 'norm', repeat: 'top', title: a => a.norm ?? t('compare.d.norm'), detail: () => null},
  {id: 'mixer', spec: 'attention', repeat: 'mid', title: a => isHybrid(a) ? t('compare.d.mixing') : attentionSummary(a) ?? t('compare.d.attention'),
   detail: a => [isHybrid(a) ? a.layerMix : null, isHybrid(a) ? attentionSummary(a) : null, a.headDim ? t('compare.d.headSize', {n: a.globalHeadDim ? `${a.headDim} / ${a.globalHeadDim}` : a.headDim}) : null, a.qkNorm ? t('compare.d.qkNorm') : null, a.sharedKv ? t('compare.d.sharedKv') : null].filter(Boolean).join(' · ') || null, kind: 'key'},
  {id: 'position', spec: 'position', repeat: 'mid', title: () => t('compare.d.position'), detail: rope},
  {id: 'window', spec: 'window', repeat: 'mid', title: () => t('compare.d.window'),
   detail: a => a.cache ? (a.cache.window ? t('compare.windowLayers', {n: a.cache.window, total: a.layers ?? '?', w: n(a.cache.windowSize)}) : t('compare.noWindow')) : a.layerMix && /sliding|local/i.test(a.layerMix) ? a.layerMix : null},
  {id: 'res1', spec: 'residual', repeat: 'mid', title: () => t('compare.d.residual'), detail: () => null, kind: 'thin'},
  {id: 'norm2', spec: 'norm', repeat: 'mid', title: a => a.norm ?? t('compare.d.norm'), detail: () => null},
  {id: 'ffn', spec: 'ffn', repeat: 'mid', title: a => a.experts ? t('compare.d.moe') : t('compare.d.ffn'),
   detail: a => [ffnSummary(a), a.ffnDense && a.experts ? t('compare.denseLayers', {n: a.ffnDense}) : null, a.activation].filter(Boolean).join(' · ') || null, kind: 'key'},
  {id: 'res2', spec: 'residual', repeat: 'bottom', title: () => t('compare.d.residual'), detail: () => null, kind: 'thin'},
  {id: 'final', spec: 'norm', title: a => t('compare.d.finalNorm', {norm: a.norm ?? t('compare.d.norm')}), detail: () => null},
  {id: 'output', spec: 'output', title: () => t('compare.d.output'),
   detail: a => [a.tied === null ? null : t(a.tied ? 'compare.tied' : 'compare.untied'), a.logitSoftcap ? t('compare.softcapText', {cap: a.logitSoftcap}) : null].filter(Boolean).join(' · ') || null},
  {id: 'predict', spec: 'mtp', title: () => t('compare.d.predict'), detail: a => [a.vocab ? t('compare.d.possible', {n: n(a.vocab)}) : null, a.mtp ? t('compare.mtpText', {n: a.mtp}) : null].filter(Boolean).join(' · ') || null, kind: 'io'},
];
export const NORM_ROWS = ['norm1', 'norm2', 'final'];
export const cellsOf = (a: Arch) => a.segments.flatMap(s => Array.from({length: s.count}, () => s));
export {segmentSeries};

/** What the layer stack does in this model, for the "repeat" header. */
export function explainRepeat(a: Arch): string[] {
  const out: string[] = [];
  if (a.layers) out.push(D('repeatLayers', {name: a.name, n: a.layers}));
  else out.push(D('repeatUnknown'));
  if (a.segments.length) out.push(D('repeatMix', {mix: a.segments.map(s => `${s.count} × ${s.label}`).join(', ')}));
  else if (a.layerMix) out.push(D('repeatMix', {mix: a.layerMix}));
  return out;
}

/** Sentences describing what one box does in this particular model, from its published configuration. */
export function explainRow(id: string, a: Arch): string[] {
  const out: string[] = [];
  const say = (k: string, v: Record<string, string | number> = {}) => out.push(D(k, v));
  switch (id) {
    case 'input': say('input', {name: a.name}); break;
    case 'tokenizer':
      if (a.vocab) say('tokenizer', {name: a.name, v: n(a.vocab), max: n(a.vocab - 1)}); else say('notStated');
      break;
    case 'embedding':
      if (a.vocab && a.hidden) {
        const p = a.vocab * a.hidden;
        say('embedding', {v: n(a.vocab), d: n(a.hidden), p: big(p)});
        if (a.totalParams) say('embeddingShare', {share: pct(p / a.totalParams), total: big(a.totalParams)});
      } else if (a.hidden) say('embeddingWidth', {d: n(a.hidden)}); else say('notStated');
      break;
    case 'norm1': case 'norm2': case 'final': {
      const norm = a.norm;
      if (!norm) { say('normUnknown'); break; }
      say(norm === 'RMSNorm' ? 'normRms' : 'normLayer');
      if (id === 'final') say('normFinal', {norm}); else if (a.layers) say('normCount', {norm, n: a.layers * 2 + 1, layers: a.layers});
      break;
    }
    case 'mixer': {
      if (isHybrid(a)) say('mixerHybrid', {mix: a.attentionText ?? a.layerMix ?? ''});
      const hd = a.headDim;
      if (a.attentionType === 'MLA') say(a.latentRank ? 'mixerMla' : 'mixerMlaNoRank', {h: a.heads ?? '?', r: a.latentRank ?? '?'});
      else if (a.heads && a.kvHeads && hd) {
        const per = a.kvHeads * hd * 2, full = a.heads * hd * 2;
        if (a.attentionType === 'MHA') say('mixerMha', {h: a.heads, hd, per: n(per)});
        else say(a.attentionType === 'MQA' ? 'mixerMqa' : 'mixerGqa', {h: a.heads, kv: a.kvHeads, g: +(a.heads / a.kvHeads).toFixed(2), hd, per: n(per), full: n(full), x: +(full / per).toFixed(1)});
      } else if (a.attentionText) say('mixerText', {text: a.attentionText});
      else say('notStated');
      if (a.qkNorm) say('mixerQk');
      if (a.sharedKv) say('mixerSharedKv');
      if (a.globalHeadDim && hd && a.globalHeadDim !== hd) say('mixerGlobalHead', {local: hd, global: a.globalHeadDim});
      if (a.kvKiB) say('mixerCache', {name: a.name, kib: +a.kvKiB.toFixed(1)});
      break;
    }
    case 'position': {
      const r = a.rope;
      if (!r || !r.theta && !r.type) { say(/NoPE/i.test(a.attentionText ?? '') ? 'positionNope' : 'notStated'); break; }
      if (r.theta) say('positionBase', {theta: n(r.theta)});
      if (r.partial) say('positionPartial', {pct: Math.round(r.partial * 100)});
      if (r.type && r.factor) say(r.original ? 'positionScaledFrom' : 'positionScaled', {type: r.type, factor: +r.factor.toFixed(2), original: n(r.original), extended: n(r.original ? Math.round(r.original * r.factor) : null)});
      if (r.localTheta) say('positionLocal', {theta: n(r.localTheta)});
      if (a.context) say('positionContext', {context: n(a.context)});
      break;
    }
    case 'window': {
      const c = a.cache;
      if (c && c.window && c.windowSize) {
        say('windowSplit', {w: c.window, total: a.layers ?? c.window + c.full, size: n(c.windowSize), f: c.full});
        const tokens = Math.min(131072, a.context ?? 131072);
        const real = cacheGiB(a, tokens), naive = a.kvKiB !== null ? (c.fullKiB * c.full + c.windowKiB * c.window) * tokens / (1024 * 1024) : null;
        if (real !== null && naive !== null && naive > real) say('windowSaving', {tokens: n(tokens), real: real.toFixed(1), naive: naive.toFixed(1)});
      } else if (c) say('windowNone');
      else if (a.layerMix && /sliding|local/i.test(a.layerMix)) say('windowText', {mix: a.layerMix});
      else say('notStated');
      break;
    }
    case 'res1': case 'res2':
      say('residual', {n: a.layers ?? '?', d: n(a.hidden)});
      break;
    case 'ffn':
      if (a.experts) {
        say('moe', {e: a.experts, k: a.expertsActive ?? '?', w: n(a.moeIntermediate)});
        if (a.sharedExperts) say('moeShared', {s: a.sharedExperts});
        if (a.totalParams && a.activeParams) say('moeActive', {active: big(a.activeParams), total: big(a.totalParams), pct: pct(a.activeParams / a.totalParams)});
        if (a.ffnDense) say('moeDense', {n: a.ffnDense});
      } else if (a.intermediate && a.hidden) {
        say('ffnDense', {d: n(a.hidden), w: n(a.intermediate), x: +(a.intermediate / a.hidden).toFixed(2)});
      } else say('notStated');
      if (a.activation) say('ffnActivation', {act: a.activation});
      break;
    case 'output':
      if (a.tied !== null && a.vocab && a.hidden) say(a.tied ? 'outputTied' : 'outputUntied', {d: n(a.hidden), v: n(a.vocab), p: big(a.vocab * a.hidden)});
      else if (a.tied !== null) say(a.tied ? 'outputTiedShort' : 'outputUntiedShort');
      else say('notStated');
      if (a.logitSoftcap) say('outputSoftcap', {cap: a.logitSoftcap});
      break;
    case 'predict':
      if (a.vocab) say('predict', {v: n(a.vocab)}); else say('predictShort');
      if (a.mtp) say('predictMtp', {n: a.mtp});
      break;
  }
  return out;
}
