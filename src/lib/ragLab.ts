// The twenty RAG techniques, each run in the browser over this app's own text (or its model catalog).
// Every function returns a trace of real intermediate results. Where a technique needs a language model, the trace says what replaces it.
import {familyOf, mechanismsOf} from './architecture';
import {t} from './content';
import {buildCorpus, chunkCorpus, rag, type Doc, type SqlPreset, type SqlValue} from './rag';
import {Bm25, Space, dot, kmeans, labelPropagation, mean, normalize, percentile, personalizedPageRank, proximity, ranking, rng, rrf, sentences, terms, type Vec} from './ragMath';
import {commercialLabel} from './selection';
import type {Model} from './types';

export interface Passage {id: string; title: string; section: string; href: string; text: string; docId: string; level?: number}
export interface Hit {p: Passage; score: number; note?: string}
export interface Series {id: string; label: string; tone: number; points: [number, number][]}
export type Step =
  | {kind: 'text'; title: string; text: string; tone?: 'warn' | 'ok'}
  | {kind: 'table'; title: string; head: string[]; rows: (string | number)[][]; note?: string}
  | {kind: 'hits'; title: string; hits: Hit[]; scoreLabel: string}
  | {kind: 'bars'; title: string; rows: {label: string; value: number}[]; percent?: boolean}
  | {kind: 'chips'; title: string; items: string[]}
  | {kind: 'tiles'; title: string; items: {label: string; value: string}[]}
  | {kind: 'code'; title: string; text: string}
  | {kind: 'chart'; title: string; series: Series[]; xMax: number; yMax: number; xLabel: string; yLabel: string; xMin?: number}
  | {kind: 'gantt'; title: string; rows: GanttRow[]; total: number; unit: string; note?: string};
/** One bar on a timeline: a task from start to end, in the step's unit. */
export interface GanttRow {label: string; start: number; end: number; tone: number; group?: string}
export interface Answer {sentences: {text: string; cite: number}[]}
export interface Turn {q: string; topics: number[]; words: string[]}
export interface Run {steps: Step[]; hits: Hit[]; answer: Answer | null; prompt: string | null; turn?: Turn}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const cut = (s: string, n = 110) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const coverage = (text: string, q: Set<string>) => { if (!q.size) return 0; const s = new Set(terms(text)); let n = 0; q.forEach(w => { if (s.has(w)) n++; }); return n / q.size; };

// ---------- Index over passages ----------
export class Index {
  passages: Passage[]; bm: Bm25; vecs: Vec[];
  constructor(passages: Passage[], space: Space, textOf: (p: Passage) => string = p => `${p.title} ${p.text}`) {
    this.passages = passages;
    const texts = passages.map(textOf);
    this.bm = new Bm25(texts);
    this.vecs = texts.map(x => space.embed(x));
  }
  bm25(q: string, n = 50): Hit[] { const s = this.bm.scores(q); return ranking(s).slice(0, n).map(i => ({p: this.passages[i], score: s[i]})); }
  dense(v: Vec, n = 50): Hit[] { const s = this.vecs.map(x => dot(x, v)); return ranking(s, 1e-9).slice(0, n).map(i => ({p: this.passages[i], score: s[i]})); }
  hybrid(q: string, v: Vec, n = 50): Hit[] {
    const a = this.bm25(q, 50), b = this.dense(v, 50), byId = new Map([...a, ...b].map(h => [h.p.id, h.p]));
    const ra = new Map(a.map((h, i) => [h.p.id, i + 1])), rb = new Map(b.map((h, i) => [h.p.id, i + 1]));
    const ids = [...byId.keys()], pos = new Map(ids.map((id, i) => [id, i]));
    return rrf([a.map(h => pos.get(h.p.id)!), b.map(h => pos.get(h.p.id)!)]).slice(0, n).map(([i, s]) => ({p: byId.get(ids[i])!, score: s, note: t('ragLab.ranksNote', {bm25: ra.get(ids[i]) ?? '—', dense: rb.get(ids[i]) ?? '—'})}));
  }
  vecOf(p: Passage) { return this.vecs[this.passages.indexOf(p)]; }
}

// ---------- Topic graph: an edge whenever one topic's text names another ----------
interface Topic {doc: Doc; names: string[]}
const flat = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
function namesOf(title: string) {
  const out = new Set<string>(), base = title.replace(/\s*\(([^)]*)\)\s*/g, ' ').trim(), inner = title.match(/\(([^)]*)\)/)?.[1];
  for (const n of [title, base, inner ?? '']) { const f = flat(n).trim(); if (f.length >= 3) { out.add(f); out.add(f + 's'); } }
  return [...out];
}
/** Topics named in a text, dropping any whose matched name only occurs inside a longer matched name. */
function namedTopics(text: string, topics: Topic[]) {
  const f = flat(text), hits = topics.map((tp, i) => ({i, names: tp.names.filter(n => f.includes(` ${n} `))})).filter(x => x.names.length);
  const longer = hits.flatMap(x => x.names);
  return hits.filter(x => x.names.some(n => { const count = f.split(` ${n} `).length - 1; const inside = longer.filter(m => m !== n && m.includes(n)).reduce((c, m) => c + f.split(` ${m} `).length - 1, 0); return count > inside; })).map(x => x.i);
}

interface LabData {docs: Doc[]; passages: Passage[]; space: Space; index: Index; docIndex: Index; topics: Topic[]; adj: Map<number, number>[]; topicOfDoc: Map<string, number>; wordVecs: (Vec | null)[]}
interface TreeNode {p: Passage; v: Vec; level: number; members: number}
type ChunkSet = {passages: Passage[]; index: Index; parents?: Map<string, Passage>; cuts?: Map<string, {s: string; d: number; cut: boolean}[]>};
interface State {data: LabData | null; chunks: Map<string, ChunkSet>; ctx: {plain: Index; ctx: Index; prefix: (p: Passage) => string} | null; words: {ids: number[]}[] | null; communities: number[][] | null; tree: TreeNode[] | null}
const fresh = (): State => ({data: null, chunks: new Map(), ctx: null, words: null, communities: null, tree: null});
const states = {full: fresh(), heldOut: fresh()};
let st = states.full;
/** Runs f against the held-out collection: every test question's sentence removed from the index. */
function withHeldOut<T>(f: () => T): T { const prev = st; st = states.heldOut; try { return f(); } finally { st = prev; } }
const toPassage = (c: {id: string; doc: Doc; text: string}): Passage => ({id: c.id, title: c.doc.title, section: c.doc.section, href: c.doc.href, text: c.text, docId: c.doc.id});
export function lab(): LabData {
  if (st.data) return st.data;
  const docs = st === states.heldOut ? heldOutDocs() : buildCorpus();
  const passages = chunkCorpus(docs, 'words', 60, 10).map(toPassage);
  const space = new Space(passages.map(p => `${p.title} ${p.text}`), 64);
  const index = new Index(passages, space);
  const docIndex = new Index(chunkCorpus(docs, 'document', 0, 0).map(toPassage), space);
  const topics = docs.map(doc => ({doc, names: namesOf(doc.title)}));
  const topicOfDoc = new Map(docs.map((d, i) => [d.id, i]));
  const adj = topics.map(() => new Map<number, number>());
  for (const p of passages) {
    const from = topicOfDoc.get(p.docId)!;
    namedTopics(p.text, topics).forEach(j => { if (j !== from) { adj[from].set(j, (adj[from].get(j) ?? 0) + 1); adj[j].set(from, (adj[j].get(from) ?? 0) + 1); } });
  }
  st.data = {docs, passages, space, index, docIndex, topics, adj, topicOfDoc, wordVecs: space.words.map(w => space.wordVec(w))};
  return st.data;
}

// ---------- Shared steps ----------
function answerFrom(hits: Hit[], query: string, n = 3): Answer | null {
  const L = lab(), q = new Set(terms(query)), qv = L.space.embed(query);
  const cands = hits.slice(0, 5).flatMap((h, i) => sentences(h.p.text).map(s => ({text: s, cite: i + 1, score: .6 * coverage(s, q) + .4 * dot(qv, L.space.embed(s))})));
  const seen = new Set<string>(), picked = cands.sort((a, b) => b.score - a.score).filter(c => c.score > 0 && !seen.has(c.text) && seen.add(c.text)).slice(0, n);
  return picked.length ? {sentences: picked} : null;
}
export function promptOf(query: string, hits: Hit[], body?: string) {
  const context = body ?? hits.map((h, i) => `[${i + 1}] ${h.p.title}: ${h.p.text}`).join('\n\n');
  return `${t('rag.promptHead')}\n\n${context}\n\n${t('rag.promptQuestion')} ${query}`;
}
function finish(steps: Step[], hits: Hit[], query: string, k: number, extra: Partial<Run> = {}): Run {
  const top = hits.slice(0, k);
  return {steps, hits: top, answer: answerFrom(top, query), prompt: top.length ? promptOf(query, top) : null, ...extra};
}
const hitsStep = (hits: Hit[], scoreLabel = t('ragLab.score'), title = t('ragLab.s_retrieved')): Step => ({kind: 'hits', title, hits, scoreLabel});
const rankIn = (list: Hit[], p: Passage) => { const i = list.findIndex(h => h.p.id === p.id); return i < 0 ? '—' : i + 1; };
function knownWordsStep(q: string): Step | null {
  const L = lab(), all = [...new Set(terms(q))], unknown = all.filter(w => !L.space.vocab.has(w));
  return unknown.length ? {kind: 'chips', title: t('ragLab.s_unknownWords', {n: unknown.length, total: all.length}), items: unknown} : null;
}
/** Most distinctive words of a passage (term frequency times BM25 idf), excluding some. */
function keyWords(p: Passage, exclude: Set<string>, n = 3) {
  const L = lab(), tf = new Map<string, number>();
  terms(p.text).forEach(w => { if (!exclude.has(w)) tf.set(w, (tf.get(w) ?? 0) + 1); });
  return [...tf].map(([w, f]) => [w, f * L.index.bm.idf(w)] as const).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}
function topicsNamedIn(text: string) { return namedTopics(text, lab().topics); }

// ---------- 1. Naive / dense ----------
export function naive(q: string, o: {k: number}): Run {
  const L = lab(), qv = L.space.embed(q), hits = L.index.dense(qv, o.k);
  const steps: Step[] = [{kind: 'chips', title: t('ragLab.s_queryVector', {dims: L.space.k}), items: L.space.nearestWords(qv, 8).map(n => `${n.word} · ${n.sim.toFixed(2)}`)}];
  const unknown = knownWordsStep(q); if (unknown) steps.push(unknown);
  steps.push(hits.length ? hitsStep(hits, t('ragLab.cosine')) : {kind: 'text', title: t('ragLab.s_retrieved'), text: t('ragLab.noKnownWords'), tone: 'warn'});
  return finish(steps, hits, q, o.k);
}

// ---------- 2. Hybrid ----------
export function hybrid(q: string, o: {k: number}): Run {
  const L = lab(), qv = L.space.embed(q), a = L.index.bm25(q), b = L.index.dense(qv), fused = L.index.hybrid(q, qv, o.k);
  return finish([
    {kind: 'table', title: t('ragLab.s_fusion'), head: [t('ragLab.colPassage'), t('ragLab.colBm25Rank'), t('ragLab.colDenseRank'), t('ragLab.colFused')],
     rows: fused.map(h => [h.p.title, rankIn(a, h.p), rankIn(b, h.p), h.score.toFixed(4)]), note: t('ragLab.rrfNote')},
    {kind: 'tiles', title: t('ragLab.s_overlap'), items: [{label: t('ragLab.inBoth'), value: String(fused.filter(h => rankIn(a, h.p) !== '—' && rankIn(b, h.p) !== '—').length)}, {label: t('ragLab.onlyBm25'), value: String(fused.filter(h => rankIn(b, h.p) === '—').length)}, {label: t('ragLab.onlyDense'), value: String(fused.filter(h => rankIn(a, h.p) === '—').length)}]},
    hitsStep(fused, t('ragLab.rrfScore')),
  ], fused, q, o.k);
}

// ---------- 3. Semantic and hierarchical chunking ----------
function semanticChunks(pctl: number) {
  const key = `sem-${pctl}`; if (st.chunks.has(key)) return st.chunks.get(key)!;
  const L = lab(), passages: Passage[] = [], cuts = new Map<string, {s: string; d: number; cut: boolean}[]>();
  for (const doc of L.docs) {
    const ss = sentences(doc.text);
    if (ss.length < 3) { passages.push({id: `${doc.id}~s0`, title: doc.title, section: doc.section, href: doc.href, text: ss.join(' ') || doc.text, docId: doc.id}); continue; }
    const vs = ss.map((_, i) => L.space.embed(ss.slice(Math.max(0, i - 1), i + 2).join(' ')));
    const d = vs.slice(0, -1).map((v, i) => 1 - dot(v, vs[i + 1])), thr = percentile(d, pctl);
    cuts.set(doc.id, ss.map((s, i) => ({s, d: d[i] ?? 0, cut: i < d.length && d[i] > thr})));
    let cur: string[] = [];
    ss.forEach((s, i) => { cur.push(s); if (i === ss.length - 1 || d[i] > thr) { passages.push({id: `${doc.id}~s${passages.length}`, title: doc.title, section: doc.section, href: doc.href, text: cur.join(' '), docId: doc.id}); cur = []; } });
  }
  const out = {passages, index: new Index(passages, L.space), cuts}; st.chunks.set(key, out); return out;
}
function hierarchicalChunks() {
  if (st.chunks.has('hier')) return st.chunks.get('hier')!;
  const L = lab(), parents = chunkCorpus(L.docs, 'words', 150, 0).map(toPassage), children: Passage[] = [], parentOf = new Map<string, Passage>();
  parents.forEach(par => sentences(par.text).forEach((s, i) => { const c = {...par, id: `${par.id}/${i}`, text: s}; children.push(c); parentOf.set(c.id, par); }));
  const out = {passages: children, index: new Index(children, L.space), parents: parentOf}; st.chunks.set('hier', out); return out;
}
const stats = (ps: Passage[]) => { const w = ps.map(p => p.text.split(' ').length); return [ps.length, Math.round(w.reduce((s, x) => s + x, 0) / Math.max(1, w.length)), Math.min(...w), Math.max(...w)]; };
export function chunking(q: string, o: {k: number; strategy: 'fixed' | 'semantic' | 'hierarchical'; pctl: number}): Run {
  const L = lab(), qv = L.space.embed(q), sem = semanticChunks(o.pctl), hier = hierarchicalChunks();
  const steps: Step[] = [{kind: 'table', title: t('ragLab.s_chunkStats'), head: [t('ragLab.colStrategy'), t('ragLab.colPassages'), t('ragLab.colAvgWords'), t('ragLab.colMinWords'), t('ragLab.colMaxWords')],
    rows: [[t('ragLab.strat_fixed'), ...stats(L.passages)], [t('ragLab.strat_semantic', {p: o.pctl}), ...stats(sem.passages)], [t('ragLab.strat_hierarchical'), ...stats(hier.passages)]]}];
  let hits: Hit[];
  if (o.strategy === 'fixed') hits = L.index.hybrid(q, qv, o.k);
  else if (o.strategy === 'semantic') {
    hits = sem.index.hybrid(q, qv, o.k);
    const doc = hits[0]?.p.docId, rows = doc ? sem.cuts!.get(doc) : undefined;
    if (rows) steps.push({kind: 'table', title: t('ragLab.s_boundaries', {title: hits[0].p.title}), head: ['#', t('ragLab.colSentence'), t('ragLab.colDistance'), t('ragLab.colCut')], rows: rows.map((r, i) => [i + 1, cut(r.s, 90), i < rows.length - 1 ? r.d.toFixed(3) : '—', r.cut ? t('ragLab.cutHere') : '']), note: t('ragLab.boundaryNote', {p: o.pctl})});
  } else {
    const kids = hier.index.hybrid(q, qv, 30), seen = new Set<string>(), rows: (string | number)[][] = [];
    hits = [];
    for (const h of kids) { const par = hier.parents!.get(h.p.id)!; rows.push([cut(h.p.text, 80), `${par.title} · ${t('rag.chunkN', {n: Number(par.id.split('#')[1]) + 1})}`, seen.has(par.id) ? t('ragLab.merged') : t('ragLab.returned')]); if (!seen.has(par.id)) { seen.add(par.id); hits.push({p: par, score: h.score, note: t('ragLab.viaChild', {text: cut(h.p.text, 60)})}); } if (hits.length >= o.k) break; }
    steps.push({kind: 'table', title: t('ragLab.s_childToParent'), head: [t('ragLab.colChild'), t('ragLab.colParent'), t('ragLab.colAction')], rows});
  }
  steps.push(hitsStep(hits, t('ragLab.rrfScore')));
  return finish(steps, hits, q, o.k);
}

// ---------- 4. Contextual retrieval ----------
export function contextual(q: string, o: {k: number}): Run {
  const L = lab();
  if (!st.ctx) {
    const first = new Map(L.docs.map(d => [d.id, sentences(d.text)[0] ?? '']));
    const prefix = (p: Passage) => `${p.title}. ${p.section}. ${first.get(p.docId)}`;
    st.ctx = {plain: new Index(L.passages, L.space, p => p.text), ctx: new Index(L.passages, L.space, p => `${prefix(p)} ${p.text}`), prefix};
  }
  const qv = L.space.embed(q), plain = st.ctx.plain.hybrid(q, qv), ctx = st.ctx.ctx.hybrid(q, qv);
  const top = ctx.slice(0, o.k), lost = plain.slice(0, o.k).filter(h => !top.some(x => x.p.id === h.p.id));
  const steps: Step[] = [];
  if (top[0]) steps.push({kind: 'code', title: t('ragLab.s_prefix'), text: `${st.ctx.prefix(top[0].p)}\n---\n${top[0].p.text}`});
  steps.push({kind: 'table', title: t('ragLab.s_rankChange'), head: [t('ragLab.colPassage'), t('ragLab.colPlainRank'), t('ragLab.colCtxRank')], rows: [...top.map(h => [`${h.p.title} · ${cut(h.p.text, 50)}`, rankIn(plain, h.p), rankIn(ctx, h.p)]), ...lost.map(h => [`${h.p.title} · ${cut(h.p.text, 50)}`, rankIn(plain, h.p), rankIn(ctx, h.p)])], note: t('ragLab.ctxNote')});
  steps.push(hitsStep(top, t('ragLab.rrfScore')));
  return finish(steps, top, q, o.k);
}

// ---------- 5. Reranking ----------
export function rerank(q: string, o: {k: number; n: number}): Run {
  const L = lab(), qv = L.space.embed(q), qs = new Set(terms(q)), first = L.index.hybrid(q, qv, o.n);
  const scored = first.map((h, i) => {
    const toks = terms(`${h.p.title} ${h.p.text}`), cov = coverage(toks.join(' '), qs), prox = proximity(toks, qs), cos = Math.max(0, dot(qv, L.index.vecOf(h.p)));
    return {h, first: i + 1, cov, prox, cos, score: .5 * cov + .3 * prox + .2 * cos};
  }).sort((a, b) => b.score - a.score);
  const hits = scored.map(s => ({p: s.h.p, score: s.score, note: t('ragLab.movedFrom', {n: s.first})}));
  return finish([
    {kind: 'table', title: t('ragLab.s_rescore', {n: first.length}), head: [t('ragLab.colPassage'), t('ragLab.colFirstRank'), t('ragLab.colNewRank'), t('ragLab.colCoverage'), t('ragLab.colProximity'), t('ragLab.cosine'), t('ragLab.score')],
     rows: scored.slice(0, Math.max(o.k, 10)).map((s, i) => [s.h.p.title, s.first, i + 1, pct(s.cov), s.prox.toFixed(2), s.cos.toFixed(2), s.score.toFixed(3)]), note: t('ragLab.rerankNote')},
    hitsStep(hits.slice(0, o.k), t('ragLab.rerankScore')),
  ], hits, q, o.k);
}

// ---------- 6. Query transformation and RAG-Fusion ----------
export function queryVariants(q: string, extra: string[]) {
  const L = lab(), qs = new Set(terms(q)), out: {kind: string; text: string}[] = [{kind: t('ragLab.v_original'), text: q}];
  if (qs.size) out.push({kind: t('ragLab.v_keywords'), text: [...qs].join(' ')});
  const near = L.space.nearestWords(L.space.embed(q), 4, qs).map(n => n.word);
  if (near.length) out.push({kind: t('ragLab.v_expanded'), text: `${q} ${near.join(' ')}`});
  const clauses = q.split(/,|;|\band\b|\bor\b|\bbut\b/i).map(s => s.trim()).filter(s => terms(s).length >= 2);
  if (clauses.length > 1) clauses.forEach(c => out.push({kind: t('ragLab.v_clause'), text: c}));
  extra.map(s => s.trim()).filter(Boolean).forEach(s => out.push({kind: t('ragLab.v_rewrite'), text: s}));
  return out;
}
export function fusion(q: string, o: {k: number; rewrites: string[]}): Run {
  const L = lab(), variants = queryVariants(q, o.rewrites);
  const lists = variants.map(v => L.index.hybrid(v.text, L.space.embed(v.text), 20));
  const all = new Map(lists.flat().map(h => [h.p.id, h.p])), ids = [...all.keys()], pos = new Map(ids.map((id, i) => [id, i]));
  const fused = rrf(lists.map(l => l.map(h => pos.get(h.p.id)!))).map(([i, s]) => ({p: all.get(ids[i])!, score: s, note: t('ragLab.foundBy', {n: lists.filter(l => l.some(h => h.p.id === ids[i])).length, total: lists.length})}));
  return finish([
    {kind: 'table', title: t('ragLab.s_variants', {n: variants.length}), head: [t('ragLab.colVariant'), t('ragLab.colSearchText'), t('ragLab.colTopHit')], rows: variants.map((v, i) => [v.kind, v.text, lists[i][0]?.p.title ?? '—'])},
    hitsStep(fused.slice(0, o.k), t('ragLab.rrfScore')),
  ], fused, q, o.k);
}

// ---------- 7. HyDE ----------
export function hyde(q: string, o: {k: number; draft: string}): Run {
  const L = lab(), qv = L.space.embed(q), plain = L.index.dense(qv);
  if (!o.draft.trim()) return finish([{kind: 'text', title: t('ragLab.s_draft'), text: t('ragLab.noDraft'), tone: 'warn'}, hitsStep(plain.slice(0, o.k), t('ragLab.cosine'))], plain, q, o.k);
  const hv = normalize(Float64Array.from(L.space.embed(o.draft), (x, i) => (x + qv[i]) / 2)), hits = L.index.dense(hv);
  return finish([
    {kind: 'chips', title: t('ragLab.s_hydeWords'), items: L.space.nearestWords(hv, 8).map(n => `${n.word} · ${n.sim.toFixed(2)}`)},
    {kind: 'table', title: t('ragLab.s_hydeCompare'), head: [t('ragLab.colPassage'), t('ragLab.colWithDraft'), t('ragLab.colQuestionOnly')], rows: hits.slice(0, o.k).map((h, i) => [`${h.p.title} · ${cut(h.p.text, 50)}`, i + 1, rankIn(plain, h.p)])},
    hitsStep(hits.slice(0, o.k), t('ragLab.cosine')),
  ], hits, q, o.k);
}

// ---------- 8. Late interaction (MaxSim) ----------
function maxSim(qWords: {w: string; v: Vec}[], pi: number) {
  const L = lab(); let total = 0; const best: {q: string; d: string; s: number}[] = [];
  for (const {w, v} of qWords) {
    let bs = 0, bw = '';
    for (const id of st.words![pi].ids) { const s = dot(v, L.wordVecs[id]!); if (s > bs) { bs = s; bw = L.space.words[id]; } }
    total += bs; best.push({q: w, d: bw, s: bs});
  }
  return {total, best};
}
export function late(q: string, o: {k: number; candidates?: Passage[]}): Run {
  const L = lab();
  st.words ??= L.passages.map(p => ({ids: [...new Set(terms(`${p.title} ${p.text}`).map(w => L.space.vocab.get(w)).filter((x): x is number => x !== undefined && !!L.wordVecs[x]))]}));
  const all = [...new Set(terms(q))], qWords = all.filter(w => L.wordVecs[L.space.vocab.get(w) ?? -1]).map(w => ({w, v: L.wordVecs[L.space.vocab.get(w)!]!}));
  const pool = o.candidates ? o.candidates.map(p => L.passages.indexOf(p)) : L.passages.map((_, i) => i);
  const scored = pool.map(i => ({i, ...maxSim(qWords, i)})).sort((a, b) => b.total - a.total);
  const hits = scored.filter(s => s.total > 0).map(s => ({p: L.passages[s.i], score: s.total}));
  const steps: Step[] = [{kind: 'chips', title: t('ragLab.s_queryTokens', {n: qWords.length}), items: qWords.map(x => x.w)}];
  const unknown = knownWordsStep(q); if (unknown) steps.push(unknown);
  steps.push({kind: 'table', title: t('ragLab.s_maxsim'), head: [t('ragLab.colPassage'), t('ragLab.colQueryWord'), t('ragLab.colBestMatch'), t('ragLab.colSimilarity')],
    rows: scored.slice(0, 3).flatMap(s => s.best.map((b, j) => [j ? '' : L.passages[s.i].title, b.q, b.d || '—', b.s.toFixed(2)])), note: t('ragLab.maxsimNote')});
  steps.push(hitsStep(hits.slice(0, o.k), t('ragLab.maxsimScore')));
  return finish(steps, hits, q, o.k);
}

// ---------- 9. Multi-hop ----------
export function multihop(q: string, o: {k: number; subqs: string[]}): Run {
  const L = lab(), hops = o.subqs.map(s => s.trim()).filter(Boolean), plan = hops.length ? hops : [q, q];
  const rows: (string | number)[][] = [], found: Hit[] = [], seen = new Set<string>();
  let bridge: string[] = [];
  plan.forEach((sub, h) => {
    const text = [sub, ...bridge].join(' '), res = L.index.hybrid(text, L.space.embed(text), 3);
    res.forEach(r => { if (!seen.has(r.p.id)) { seen.add(r.p.id); found.push({...r, note: t('ragLab.fromHop', {n: h + 1})}); } });
    const ex = new Set([...terms(q), ...terms(sub), ...bridge]);
    const next = res[0] ? keyWords(res[0].p, ex) : [];
    rows.push([h + 1, text, res.map(r => r.p.title).join('; ') || '—', next.join(', ') || '—']);
    bridge = next;
  });
  const steps: Step[] = [];
  if (!hops.length) steps.push({kind: 'text', title: t('ragLab.s_plan'), text: t('ragLab.noSubqs'), tone: 'warn'});
  steps.push({kind: 'table', title: t('ragLab.s_hops', {n: plan.length}), head: [t('ragLab.colHop'), t('ragLab.colSearchText'), t('ragLab.colFound'), t('ragLab.colBridge')], rows, note: t('ragLab.bridgeNote')});
  steps.push(hitsStep(found.slice(0, o.k), t('ragLab.rrfScore')));
  return finish(steps, found, q, o.k);
}

// ---------- 10. GraphRAG ----------
export function communitiesOf() {
  const L = lab();
  if (!st.communities) {
    const label = labelPropagation(L.adj), groups = new Map<number, number[]>();
    label.forEach((l, i) => groups.set(l, [...(groups.get(l) ?? []), i]));
    st.communities = [...groups.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length);
  }
  return st.communities;
}
const passagesOfTopic = (i: number) => { const L = lab(), id = L.topics[i].doc.id; return L.passages.filter(p => p.docId === id); };
export function graphrag(q: string, o: {k: number; mode: 'local' | 'global'}): Run {
  const L = lab(), qv = L.space.embed(q), steps: Step[] = [], edges = L.adj.reduce((s, m) => s + m.size, 0) / 2;
  steps.push({kind: 'tiles', title: t('ragLab.s_graph'), items: [{label: t('ragLab.topics'), value: String(L.topics.length)}, {label: t('ragLab.links'), value: String(edges)}, {label: t('ragLab.communities'), value: String(communitiesOf().length)}]});
  if (o.mode === 'local') {
    let seeds = topicsNamedIn(q), fromSearch = false;
    if (!seeds.length) { fromSearch = true; seeds = [...new Set(L.index.dense(qv, 3).map(h => L.topicOfDoc.get(h.p.docId)!))]; }
    const neighbours = new Map<number, {w: number; via: number}>();
    seeds.forEach(s => L.adj[s].forEach((w, j) => { if (!seeds.includes(j) && w > (neighbours.get(j)?.w ?? 0)) neighbours.set(j, {w, via: s}); }));
    const near = [...neighbours].sort((a, b) => b[1].w - a[1].w).slice(0, 8);
    steps.push({kind: 'table', title: t(fromSearch ? 'ragLab.s_seedsSearch' : 'ragLab.s_seeds'), head: [t('ragLab.colTopic'), t('ragLab.colRole'), t('ragLab.colLinks')],
      rows: [...seeds.map(s => [L.topics[s].doc.title, t('ragLab.roleSeed'), L.adj[s].size]), ...near.map(([j, x]) => [L.topics[j].doc.title, t('ragLab.roleNeighbour', {via: L.topics[x.via].doc.title}), x.w])]});
    const pool = [...seeds, ...near.map(([j]) => j)].flatMap(passagesOfTopic);
    const hits = pool.map(p => ({p, score: dot(qv, L.index.vecOf(p))})).sort((a, b) => b.score - a.score);
    steps.push(hitsStep(hits.slice(0, o.k), t('ragLab.cosine')));
    return finish(steps, hits, q, o.k);
  }
  const reports = communitiesOf().map((members, n) => {
    const ps = members.flatMap(passagesOfTopic), centre = mean(ps.map(p => L.index.vecOf(p)));
    return {n: n + 1, members, ps, centre, words: L.space.nearestWords(centre, 5).map(x => x.word), rel: dot(qv, centre)};
  });
  const ranked = [...reports].sort((a, b) => b.rel - a.rel);
  steps.push({kind: 'table', title: t('ragLab.s_reports'), head: [t('ragLab.colCommunity'), t('ragLab.colMembers'), t('ragLab.colKeyWords'), t('ragLab.colRelevance')],
    rows: ranked.slice(0, 8).map(r => [t('ragLab.communityN', {n: r.n, size: r.members.length}), r.members.slice(0, 6).map(m => L.topics[m].doc.title).join(', ') + (r.members.length > 6 ? ' …' : ''), r.words.join(', '), r.rel.toFixed(3)]), note: t('ragLab.globalNote')});
  const hits: Hit[] = [];
  for (let round = 0; hits.length < o.k && round < 5; round++) for (const r of ranked.slice(0, 3)) {
    const best = r.ps.map(p => ({p, score: dot(qv, L.index.vecOf(p))})).sort((a, b) => b.score - a.score)[round];
    if (best && hits.length < o.k) hits.push({...best, note: t('ragLab.fromCommunity', {n: r.n})});
  }
  steps.push(hitsStep(hits, t('ragLab.cosine')));
  return finish(steps, hits, q, o.k);
}

// ---------- 11. RAPTOR ----------
function summarise(level: number, n: number, members: TreeNode[], centre: Vec): TreeNode {
  const L = lab(), ss = [...new Set(members.flatMap(m => sentences(m.p.text)))].map(s => ({s, sim: dot(centre, L.space.embed(s))})).sort((a, b) => b.sim - a.sim).slice(0, 2);
  const titles = [...new Set(members.map(m => m.level ? m.p.title : m.p.title))];
  return {p: {id: `raptor-${level}-${n}`, title: t('ragLab.clusterNode', {level, n: n + 1}), section: cut(titles.slice(0, 4).join(', ') + (titles.length > 4 ? ' …' : ''), 120), href: '#/rag/techniques/raptor', text: ss.map(x => x.s).join(' '), docId: '', level}, v: centre, level, members: members.length};
}
function buildTree() {
  if (st.tree) return st.tree;
  const L = lab(), leaves: TreeNode[] = L.passages.map(p => ({p: {...p, level: 0}, v: L.index.vecOf(p), level: 0, members: 1}));
  const nodes = [...leaves]; let layer = leaves;
  for (let level = 1; level <= 2 && layer.length > 6; level++) {
    const k = Math.max(2, Math.round(layer.length / (level === 1 ? 8 : 6))), {assign, centres} = kmeans(layer.map(x => x.v), k, 11 + level);
    layer = centres.map((c, j) => ({c, m: layer.filter((_, i) => assign[i] === j)})).filter(x => x.m.length).map((x, j) => summarise(level, j, x.m, x.c));
    nodes.push(...layer);
  }
  st.tree = nodes; return st.tree;
}
export function raptor(q: string, o: {k: number}): Run {
  const L = lab(), qv = L.space.embed(q), nodes = buildTree();
  const hits = nodes.map(n => ({p: n.p, score: dot(qv, n.v), note: n.level ? t('ragLab.levelSummary', {level: n.level, n: n.members}) : t('ragLab.levelLeaf')})).filter(h => h.score > 0).sort((a, b) => b.score - a.score);
  const count = (l: number) => nodes.filter(n => n.level === l).length, top = hits.slice(0, o.k);
  return finish([
    {kind: 'tiles', title: t('ragLab.s_tree'), items: [0, 1, 2].map(l => ({label: t(`ragLab.level${l}`), value: String(count(l))}))},
    {kind: 'bars', title: t('ragLab.s_levelsUsed'), rows: [0, 1, 2].map(l => ({label: t(`ragLab.level${l}`), value: top.filter(h => (h.p.level ?? 0) === l).length}))},
    hitsStep(top, t('ragLab.cosine')),
  ], hits, q, o.k);
}

// ---------- 12. Structured / SQL ----------
const FIELDS: Record<string, (m: Model) => SqlValue> = {
  name: m => m.name, publisher: m => m.publisher, country: m => m.country, released: m => m.released, class: m => m.architecture.class,
  total_params_b: m => m.totalParams ? +(m.totalParams / 1e9).toFixed(1) : null, active_params_b: m => m.activeParams ? +(m.activeParams / 1e9).toFixed(1) : null,
  context: m => m.context, kv_kib_per_token: m => m.kvKiBPerToken, licence: m => m.license.rule.name, commercial: m => m.license.rule.commercial, vision: m => m.official?.vision ?? null,
};
function test(v: SqlValue, op: string, x: SqlValue) {
  if (op === 'notnull') return v !== null && v !== undefined;
  if (v === null || v === undefined) return false;
  if (op === 'like') return String(v).toLowerCase().includes(String(x).toLowerCase());
  if (op === '=') return v === x;
  const a = v as number, b = x as number;
  return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : false;
}
export function runSql(models: Model[], s: SqlPreset) {
  const matched = models.filter(m => s.where.every(([f, op, x]) => test(FIELDS[f](m), op, x)));
  let rows: Record<string, SqlValue>[];
  if (s.group) {
    const groups = new Map<SqlValue, Model[]>();
    matched.forEach(m => { const k = FIELDS[s.group!](m); groups.set(k, [...(groups.get(k) ?? []), m]); });
    rows = [...groups].map(([k, ms]) => {
      const r: Record<string, SqlValue> = {[s.group!]: k, models: ms.length};
      if (s.median) { const v = ms.map(m => FIELDS[s.median!](m)).filter((x): x is number => typeof x === 'number'); r[`median_${s.median}`] = v.length ? percentile(v, 50) : null; }
      return r;
    });
  } else rows = matched.map(m => Object.fromEntries(s.select.map(f => [f, FIELDS[f](m)])));
  const [f, dir] = s.order;
  rows.sort((a, b) => a[f] === null ? 1 : b[f] === null ? -1 : (a[f]! < b[f]! ? -1 : a[f]! > b[f]! ? 1 : 0) * (dir === 'asc' ? 1 : -1) || String(a[s.select[0]]).localeCompare(String(b[s.select[0]])));
  return {matched: s.group ? rows.length : matched.length, rows: rows.slice(0, s.limit)};
}
const fmtCell = (f: string, v: SqlValue) => v === null || v === undefined ? '—' : f === 'commercial' ? commercialLabel(v as never) : typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
export function sql(models: Model[], q: string, s: SqlPreset): Run {
  const {matched, rows} = runSql(models, s), cols = s.select;
  const context = rows.map((r, i) => `[${i + 1}] ${cols.map(c => `${c}: ${fmtCell(c, r[c])}`).join('; ')}`).join('\n');
  return {
    steps: [
      {kind: 'code', title: t('ragLab.s_sql'), text: s.sql},
      {kind: 'tiles', title: t('ragLab.s_sqlRun'), items: [{label: t('ragLab.tableRows'), value: String(models.length)}, {label: t('ragLab.matched'), value: String(matched)}, {label: t('ragLab.returnedRows'), value: String(rows.length)}]},
      {kind: 'table', title: t('ragLab.s_sqlRows'), head: cols, rows: rows.map(r => cols.map(c => fmtCell(c, r[c])))},
    ],
    hits: [], prompt: promptOf(q, [], context),
    answer: rows.length ? {sentences: rows.slice(0, 3).map((r, i) => ({text: cols.map(c => `${c}: ${fmtCell(c, r[c])}`).join(', '), cite: i + 1}))} : null,
  };
}

// ---------- 13. Contextual compression ----------
export function compression(q: string, o: {k: number; threshold: number; order: 'relevance' | 'edges' | 'source'}): Run {
  const L = lab(), qv = L.space.embed(q), qs = new Set(terms(q)), hits = L.index.hybrid(q, qv, o.k);
  const ss = hits.flatMap((h, i) => sentences(h.p.text).map((s, j) => ({s, src: i + 1, j, raw: .5 * coverage(s, qs) + .5 * Math.max(0, dot(qv, L.space.embed(s)))})));
  const top = Math.max(0, ...ss.map(x => x.raw)), selective = top < .15;
  const scored = ss.map(x => ({...x, rel: top ? x.raw / top : 0})), keep = selective ? [] : scored.filter(x => x.rel >= o.threshold);
  let ordered = [...keep].sort((a, b) => b.rel - a.rel);
  if (o.order === 'source') ordered = [...keep].sort((a, b) => a.src - b.src || a.j - b.j);
  if (o.order === 'edges') { const front: typeof keep = [], back: typeof keep = []; ordered.forEach((x, i) => (i % 2 ? back : front).push(x)); ordered = [...front, ...back.reverse()]; }
  const words = (xs: {s: string}[]) => xs.reduce((n, x) => n + x.s.split(' ').length, 0), before = words(ss), after = words(keep);
  const body = ordered.map(x => `[${x.src}] ${x.s}`).join('\n');
  const steps: Step[] = [
    {kind: 'tiles', title: t('ragLab.s_compressed'), items: [{label: t('ragLab.wordsBefore'), value: String(before)}, {label: t('ragLab.wordsAfter'), value: String(after)}, {label: t('ragLab.kept'), value: before ? pct(after / before) : '—'}]},
  ];
  if (selective) steps.push({kind: 'text', title: t('ragLab.s_selective'), text: t('ragLab.selectiveText'), tone: 'warn'});
  steps.push({kind: 'table', title: t('ragLab.s_sentences'), head: [t('ragLab.colSource'), t('ragLab.colSentence'), t('ragLab.colRelevance'), t('ragLab.colKept')], rows: [...scored].sort((a, b) => b.rel - a.rel).map(x => [`[${x.src}]`, cut(x.s, 100), pct(x.rel), keep.includes(x) ? '✓' : '']), note: t('ragLab.compressNote')});
  return {steps, hits, answer: keep.length ? {sentences: [...keep].sort((a, b) => b.rel - a.rel).slice(0, 3).map(x => ({text: x.s, cite: x.src}))} : null, prompt: keep.length ? promptOf(q, [], body) : null};
}

// ---------- 14. Multimodal ----------
export function multimodal(models: Model[]): Run {
  const rows = models.filter(m => m.official?.vision || m.official?.audio).sort((a, b) => (b.context ?? 0) - (a.context ?? 0));
  const inputs = (m: Model) => [t('ragLab.inText'), m.official?.vision ? t('ragLab.inImage') : '', m.official?.audio ? t('ragLab.inAudio') : ''].filter(Boolean).join(', ');
  return {steps: [
    {kind: 'text', title: t('ragLab.s_notHere'), text: t('ragLab.multimodalText'), tone: 'warn'},
    {kind: 'tiles', title: t('ragLab.s_generators'), items: [{label: t('ragLab.withImages'), value: String(models.filter(m => m.official?.vision).length)}, {label: t('ragLab.withAudio'), value: String(models.filter(m => m.official?.audio).length)}, {label: t('ragLab.commercialToo'), value: String(rows.filter(m => m.license.rule.commercial === 'allowed').length)}]},
    {kind: 'table', title: t('ragLab.s_generatorList'), head: [t('ragLab.colModel'), t('ragLab.colPublisher'), t('ragLab.colInputs'), t('ragLab.colContext'), t('ragLab.colCommercial')], rows: rows.map(m => [m.name, m.publisher, inputs(m), m.context?.toLocaleString('en-US') ?? '—', commercialLabel(m.license.rule.commercial)])},
  ], hits: [], answer: null, prompt: null};
}

// ---------- 15. Self-RAG ----------
export function selfrag(q: string, o: {k: number; retrieveAt: number; relevantAt: number}): Run {
  const L = lab(), qv = L.space.embed(q), qs = new Set(terms(q)), cands = L.index.dense(qv, o.k), best = cands[0]?.score ?? 0;
  const steps: Step[] = [{kind: 'tiles', title: t('ragLab.s_retrieveToken'), items: [{label: t('ragLab.bestMatch'), value: best.toFixed(3)}, {label: t('ragLab.threshold'), value: o.retrieveAt.toFixed(2)}, {label: t('ragLab.decision'), value: best >= o.retrieveAt ? t('ragLab.retrieveYes') : t('ragLab.retrieveNo')}]}];
  if (best < o.retrieveAt) { steps.push({kind: 'text', title: t('ragLab.s_noRetrieval'), text: t('ragLab.noRetrievalText'), tone: 'warn'}); return {steps, hits: [], answer: null, prompt: null}; }
  const rows = cands.map((h, i) => {
    const ss = sentences(h.p.text).map(s => ({s, sc: .6 * coverage(s, qs) + .4 * dot(qv, L.space.embed(s))})).sort((a, b) => b.sc - a.sc);
    const cand = ss[0]?.s ?? h.p.text, ct = new Set(terms(cand));
    return {h, i, rel: h.score >= o.relevantAt, cand, ct, use: 1 + Math.round(4 * coverage(cand, qs))};
  });
  const scored = rows.map(r => {
    const others = rows.filter(x => x !== r && x.rel).map(x => new Set(terms(x.h.p.text)));
    const corro = r.ct.size ? Math.max(0, ...others.map(o2 => [...r.ct].filter(w => o2.has(w)).length / r.ct.size)) : 0;
    const sup = corro >= .5 ? 1 : corro >= .25 ? .5 : 0;
    return {...r, sup, score: (r.rel ? 1 : 0) + sup + .5 * (r.use - 1) / 4};
  }).sort((a, b) => b.score - a.score);
  steps.push({kind: 'table', title: t('ragLab.s_critique'), head: [t('ragLab.colPassage'), 'IsRel', t('ragLab.colCandidate'), 'IsSup', 'IsUse', t('ragLab.score')],
    rows: scored.map(r => [r.h.p.title, r.rel ? t('ragLab.relevant') : t('ragLab.irrelevant'), cut(r.cand, 90), r.sup === 1 ? t('ragLab.supFull') : r.sup ? t('ragLab.supPartial') : t('ragLab.supNo'), r.use, r.score.toFixed(2)]), note: t('ragLab.selfragNote')});
  const hits = scored.map(r => ({p: r.h.p, score: r.score}));
  const win = scored[0];
  return {steps: [...steps, hitsStep(hits, t('ragLab.critiqueScore'))], hits, prompt: promptOf(q, hits), answer: win ? {sentences: [{text: win.cand, cite: 1}]} : null};
}

// ---------- 16. CRAG ----------
export function crag(q: string, o: {k: number; upper: number; lower: number}): Run {
  const L = lab(), qv = L.space.embed(q), qs = new Set(terms(q)), got = L.index.hybrid(q, qv, o.k);
  const graded = got.map(h => ({h, s: dot(qv, L.index.vecOf(h.p))})), conf = Math.max(0, ...graded.map(g => g.s));
  const action = conf >= o.upper ? 'correct' : conf < o.lower ? 'incorrect' : 'ambiguous';
  const steps: Step[] = [
    {kind: 'table', title: t('ragLab.s_evaluator'), head: [t('ragLab.colPassage'), t('ragLab.colConfidence'), t('ragLab.colVerdict')], rows: graded.map(g => [g.h.p.title, g.s.toFixed(3), g.s >= o.upper ? t('ragLab.correct') : g.s < o.lower ? t('ragLab.incorrect') : t('ragLab.ambiguous')])},
    {kind: 'text', title: t('ragLab.s_action'), text: t(`ragLab.action_${action}`, {conf: conf.toFixed(3), upper: o.upper, lower: o.lower}), tone: action === 'correct' ? 'ok' : 'warn'},
  ];
  let hits: Hit[] = [], body = '';
  if (action !== 'incorrect') {
    const strips = graded.flatMap((g, i) => sentences(g.h.p.text).map(s => ({s, src: i + 1, sc: .5 * coverage(s, qs) + .5 * dot(qv, L.space.embed(s))})));
    const top = Math.max(0, ...strips.map(x => x.sc)), keep = strips.filter(x => x.sc >= .5 * top);
    steps.push({kind: 'table', title: t('ragLab.s_strips', {kept: keep.length, total: strips.length}), head: [t('ragLab.colSource'), t('ragLab.colStrip'), t('ragLab.colKept')], rows: strips.sort((a, b) => b.sc - a.sc).slice(0, 12).map(x => [`[${x.src}]`, cut(x.s, 100), keep.includes(x) ? '✓' : ''])});
    hits = graded.map(g => ({p: g.h.p, score: g.s}));
    body = keep.map(x => `[${x.src}] ${x.s}`).join('\n');
  }
  if (action !== 'correct') {
    const rewrite = [...new Set([...qs, ...L.space.nearestWords(qv, 3, qs).map(n => n.word)])].join(' ');
    const wide = L.docIndex.hybrid(rewrite, L.space.embed(rewrite), 3);
    steps.push({kind: 'table', title: t('ragLab.s_wider'), head: [t('ragLab.colSearchText'), t('ragLab.colFound')], rows: [[rewrite, wide.map(w => w.p.title).join('; ') || '—']], note: t('ragLab.widerNote')});
    const extra = wide.flatMap(w => L.passages.filter(p => p.docId === w.p.docId)).map(p => ({p, score: dot(qv, L.index.vecOf(p))})).sort((a, b) => b.score - a.score).slice(0, o.k);
    hits = [...hits, ...extra.filter(e => !hits.some(h => h.p.id === e.p.id))];
    const offset = body ? body.split('\n').length : 0;
    body = [body, ...extra.map((e, i) => `[${offset + i + 1}] ${e.p.title}: ${e.p.text}`)].filter(Boolean).join('\n');
  }
  steps.push(hitsStep(hits.slice(0, o.k), t('ragLab.cosine')));
  return {steps, hits: hits.slice(0, o.k), answer: answerFrom(hits, q), prompt: promptOf(q, hits, body)};
}

// ---------- 17. Adaptive ----------
export function adaptive(q: string, o: {k: number}): Run {
  const L = lab(), all = [...new Set(terms(q))], known = all.filter(w => L.space.vocab.has(w)), topics = topicsNamedIn(q);
  const cues = (q.match(/\b(and|both|versus|vs|compare|compared|difference|between|then|after|which of)\b/gi) ?? []).length;
  const route = !known.length ? 'A' : topics.length >= 3 || cues >= 1 ? 'C' : 'B';
  const head: Step[] = [
    {kind: 'table', title: t('ragLab.s_features'), head: [t('ragLab.colFeature'), t('ragLab.colValue')], rows: [[t('ragLab.f_known'), `${known.length} / ${all.length}`], [t('ragLab.f_topics'), topics.map(i => L.topics[i].doc.title).join(', ') || '—'], [t('ragLab.f_cues'), cues]]},
    {kind: 'text', title: t('ragLab.s_route'), text: t(`ragLab.route${route}`), tone: route === 'B' ? 'ok' : 'warn'},
  ];
  if (route === 'A') return {steps: head, hits: [], answer: null, prompt: `${t('ragLab.noContextPrompt')} ${q}`};
  const clauses = q.split(/,|;|\band\b|\bbut\b|\bversus\b|\bvs\b/i).map(s => s.trim()).filter(s => terms(s).length >= 2);
  const r = route === 'B' ? hybrid(q, o) : multihop(q, {k: o.k, subqs: clauses.length > 1 ? clauses : topics.length >= 2 ? topics.map(i => `${L.topics[i].doc.title} ${q}`) : []});
  return {...r, steps: [...head, ...r.steps]};
}

// ---------- 18. Agentic ----------
export function agentic(models: Model[], q: string, o: {k: number; budget: number}): Run {
  const L = lab(), qv = L.space.embed(q), want = [...new Set(terms(q))].filter(w => L.space.vocab.has(w)), evidence: Hit[] = [], rows: (string | number)[][] = [];
  const covered = () => { const text = new Set(evidence.flatMap(h => terms(`${h.p.title} ${h.p.text}`))); return want.filter(w => text.has(w)); };
  const add = (hs: Hit[]) => { let n = 0; hs.forEach(h => { if (!evidence.some(e => e.p.id === h.p.id)) { evidence.push(h); n++; } }); return n; };
  const topics = topicsNamedIn(q), asksModels = /\bmodels?\b|\bwhich\b.*\buse/i.test(q);
  let lookedUp = false, catalogDone = false;
  for (let step = 1; step <= o.budget; step++) {
    const missing = want.filter(w => !covered().includes(w));
    let tool = '', input = '', obs = '';
    if (step === 1) { tool = t('ragLab.tool_vector'); input = q; const r = L.index.dense(qv, 3); obs = t('ragLab.obsAdded', {n: add(r), titles: r.map(h => h.p.title).join('; ')}); }
    else if (asksModels && topics.length && !catalogDone) {
      catalogDone = true; tool = t('ragLab.tool_catalog'); const tp = L.topics[topics[0]].doc, id = tp.id.replace(/^(mech|family)-/, ''); input = tp.title;
      const using = models.filter(m => tp.id.startsWith('mech-') ? mechanismsOf(m).some(x => x.id === id) : familyOf(m)?.id === id);
      obs = t('ragLab.obsModels', {n: using.length, names: using.slice(0, 5).map(m => m.name).join(', ') || '—'});
      if (using.length) add([{p: {id: `catalog-${id}`, title: t('ragLab.catalogResult', {topic: tp.title}), section: t('ragLab.toolCatalogSection'), href: '#/catalog', text: t('ragLab.catalogText', {n: using.length, topic: tp.title, names: using.map(m => m.name).join(', ')}), docId: ''}, score: 1}]);
    } else if (missing.length && step <= o.budget - 1) { tool = t('ragLab.tool_keyword'); input = missing.join(' '); const r = L.index.bm25(input, 3); obs = r.length ? t('ragLab.obsAdded', {n: add(r), titles: r.map(h => h.p.title).join('; ')}) : t('ragLab.obsNothing'); }
    else if (!lookedUp && (topics.length || evidence.length)) {
      lookedUp = true; tool = t('ragLab.tool_graph'); const start = topics[0] ?? L.topicOfDoc.get(evidence[0].p.docId)!; input = L.topics[start].doc.title;
      const nb = [...L.adj[start]].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([j]) => j);
      const r = nb.flatMap(passagesOfTopic).map(p => ({p, score: dot(qv, L.index.vecOf(p))})).sort((a, b) => b.score - a.score).slice(0, 2);
      obs = t('ragLab.obsNeighbours', {names: nb.map(j => L.topics[j].doc.title).join(', ') || '—', n: add(r)});
    } else { rows.push([step, t('ragLab.tool_stop'), '—', t('ragLab.obsStop'), pct(covered().length / Math.max(1, want.length))]); break; }
    rows.push([step, tool, cut(input, 60), obs, pct(covered().length / Math.max(1, want.length))]);
    if (covered().length >= want.length * .9 && (!asksModels || !topics.length || catalogDone) && step >= 2) { rows.push([step + 1, t('ragLab.tool_stop'), '—', t('ragLab.obsEnough'), pct(covered().length / Math.max(1, want.length))]); break; }
  }
  const hits = [...evidence].sort((a, b) => b.score - a.score);
  return finish([
    {kind: 'table', title: t('ragLab.s_trace'), head: [t('ragLab.colStep'), t('ragLab.colTool'), t('ragLab.colInput'), t('ragLab.colObservation'), t('ragLab.colCovered')], rows, note: t('ragLab.agentNote')},
    hitsStep(hits.slice(0, o.k)),
  ], hits, q, o.k);
}

// ---------- 19. Memory ----------
export function memory(q: string, o: {k: number; history: Turn[]}): Run {
  const L = lab(), content = terms(q), follow = /\b(it|its|they|them|this|that|these|those|their)\b/i.test(q) || content.length < 3;
  const own = topicsNamedIn(q), seeds = new Map<number, number>(own.map(i => [i, 1]));
  const recent = [...o.history].reverse();
  if (follow) recent.slice(0, 3).forEach((turn, age) => turn.topics.forEach(i => seeds.set(i, Math.max(seeds.get(i) ?? 0, .5 / (age + 1)))));
  const borrowed = follow && recent[0] ? recent[0].words : [];
  const resolved = [q, ...borrowed].join(' '), qv = L.space.embed(resolved);
  if (!seeds.size) L.index.dense(qv, 3).forEach(h => seeds.set(L.topicOfDoc.get(h.p.docId)!, 1));
  const pr = personalizedPageRank(L.adj, seeds), topTopics = ranking(pr).slice(0, 8), maxPr = pr[topTopics[0]] || 1;
  const hits = topTopics.flatMap(i => passagesOfTopic(i).map(p => ({p, score: pr[i] / maxPr * (.5 + Math.max(0, dot(qv, L.index.vecOf(p))))}))).sort((a, b) => b.score - a.score);
  const steps: Step[] = [
    {kind: 'table', title: t('ragLab.s_memory', {n: o.history.length}), head: [t('ragLab.colTurn'), t('ragLab.colQuestion'), t('ragLab.colTopics')], rows: o.history.map((h, i) => [i + 1, h.q, h.topics.map(x => L.topics[x].doc.title).join(', ') || '—'])},
    {kind: 'text', title: t('ragLab.s_resolve'), text: follow && o.history.length ? t('ragLab.resolved', {q: resolved}) : follow ? t('ragLab.followNoMemory') : t('ragLab.standalone'), tone: follow && o.history.length ? 'ok' : undefined},
    {kind: 'bars', title: t('ragLab.s_ppr'), rows: topTopics.map(i => ({label: L.topics[i].doc.title, value: pr[i]})), percent: true},
    hitsStep(hits.slice(0, o.k), t('ragLab.pprScore')),
  ];
  return finish(steps, hits, q, o.k, {turn: {q, topics: [...new Set([...own, ...topTopics.slice(0, own.length ? 0 : 2)])].slice(0, 3), words: [...new Set([...own.flatMap(i => terms(L.topics[i].doc.title)), ...(own.length ? [] : topTopics.slice(0, 1).flatMap(i => terms(L.topics[i].doc.title)))])]}});
}

// ---------- 20. Reinforcement learning, and the shared known-item test set ----------
export interface KnownItem {q: string; target: string; title: string; sentence: string}
let items: KnownItem[] | null = null;
/**
 * One question per document with at least three sentences: one of its sentences, with the document's title words blanked.
 * Scoring uses a held-out collection in which that sentence is removed, so the document must be found from its other sentences.
 */
export function knownItems() {
  if (items) return items;
  items = [];
  for (const d of buildCorpus()) {
    const title = new Set(terms(d.title)), ss = sentences(d.text);
    if (ss.length < 3) continue;
    const s = [ss[1], ss[2], ss[0]].find(x => terms(x).filter(w => !title.has(w)).length >= 4);
    if (s) items.push({q: s.replace(/[A-Za-z0-9]+/g, w => title.has(w.toLowerCase()) ? '…' : w), target: d.id, title: d.title, sentence: s});
  }
  return items;
}
function heldOutDocs(): Doc[] {
  const out = new Map(knownItems().map(i => [i.target, i.sentence]));
  return buildCorpus().map(d => out.has(d.id) ? {...d, text: d.text.replace(/s+/g, ' ').replace(out.get(d.id)!, ' ')} : d);
}
const docRank = (hits: Hit[], target: string) => { const seen: string[] = []; for (const h of hits) { if (!seen.includes(h.p.docId)) seen.push(h.p.docId); if (h.p.docId === target) return seen.length; } return 0; };
export const ACTIONS = ['bm25', 'dense', 'hybrid', 'expanded'] as const;
function actionHits(a: typeof ACTIONS[number], q: string) {
  const L = lab(), qv = L.space.embed(q);
  if (a === 'bm25') return L.index.bm25(q, 40);
  if (a === 'dense') return L.index.dense(qv, 40);
  if (a === 'hybrid') return L.index.hybrid(q, qv, 40);
  const x = `${q} ${L.space.nearestWords(qv, 4, new Set(terms(q))).map(n => n.word).join(' ')}`;
  return L.index.hybrid(x, L.space.embed(x), 40);
}
const rr = (rank: number) => rank && rank <= 10 ? 1 / rank : 0;
export function bucketOf(q: string) { const L = lab(), ws = terms(q); return (ws.length >= 8 ? 2 : 0) + (ws.some(w => (L.index.bm.df.get(w) ?? 0) <= 2) ? 1 : 0); }
let rewardCache: {item: KnownItem; bucket: number; r: number[]}[] | null = null;
export function rl(o: {epochs: number; lr: number; seed: number}): Run {
  const all = rewardCache ??= withHeldOut(() => knownItems().map(item => ({item, bucket: bucketOf(item.q), r: ACTIONS.map(a => rr(docRank(actionHits(a, item.q), item.target)))})));
  const train = all.filter((_, i) => i % 10 < 7), held = all.filter((_, i) => i % 10 >= 7), rand = rng(o.seed);
  const theta = [0, 1, 2, 3].map(() => ACTIONS.map(() => 0)), base = [0, 0, 0, 0], curve: [number, number][] = [];
  const softmax = (v: number[]) => { const m = Math.max(...v), e = v.map(x => Math.exp(x - m)), s = e.reduce((a, b) => a + b, 0); return e.map(x => x / s); };
  for (let ep = 1; ep <= o.epochs; ep++) {
    const order = train.map((_, i) => i).sort(() => rand() - .5); let sum = 0;
    for (const i of order) {
      const {bucket: b, r} = train[i], p = softmax(theta[b]);
      let u = rand(), a = 0; while (a < p.length - 1 && (u -= p[a]) > 0) a++;
      const reward = r[a], adv = reward - base[b]; sum += reward;
      base[b] += .1 * (reward - base[b]);
      theta[b] = theta[b].map((x, j) => x + o.lr * adv * ((j === a ? 1 : 0) - p[j]));
    }
    curve.push([ep, sum / Math.max(1, train.length)]);
  }
  const counts = [0, 1, 2, 3].map(b => train.filter(x => x.bucket === b).length);
  const trainMean = ACTIONS.map((_, a) => train.reduce((s, x) => s + x.r[a], 0) / Math.max(1, train.length)), bestFixed = trainMean.indexOf(Math.max(...trainMean));
  // A question type with no training questions has learned nothing; it falls back to the best single action on the training questions.
  const greedy = theta.map((v, b) => counts[b] ? v.indexOf(Math.max(...v)) : bestFixed);
  const mrr = (f: (x: typeof all[number]) => number) => held.reduce((s, x) => s + f(x), 0) / Math.max(1, held.length);
  const fixed = ACTIONS.map((_, a) => mrr(x => x.r[a])), learned = mrr(x => x.r[greedy[x.bucket]]), oracle = mrr(x => Math.max(...x.r));
  const bucketName = (b: number) => t(`ragLab.bucket${b}`);
  return {steps: [
    {kind: 'tiles', title: t('ragLab.s_rlData'), items: [{label: t('ragLab.trainQs'), value: String(train.length)}, {label: t('ragLab.testQs'), value: String(held.length)}, {label: t('ragLab.actions'), value: String(ACTIONS.length)}]},
    {kind: 'chart', title: t('ragLab.s_rlCurve'), series: [{id: 'r', label: t('ragLab.meanReward'), tone: 1, points: curve}, {id: 'best', label: t('ragLab.bestFixedTrain'), tone: 7, points: [[1, trainMean[bestFixed]], [o.epochs, trainMean[bestFixed]]]}], xMax: o.epochs, yMax: Math.max(.2, ...curve.map(c => c[1]), oracle) * 1.1, xLabel: t('ragLab.epoch'), yLabel: t('ragLab.meanReward')},
    {kind: 'table', title: t('ragLab.s_policy'), head: [t('ragLab.colQuestionType'), t('ragLab.colTrainQs'), ...ACTIONS.map(a => t(`ragLab.act_${a}`)), t('ragLab.colChosen')], rows: [0, 1, 2, 3].map(b => [bucketName(b), counts[b], ...(counts[b] ? softmax(theta[b]).map(pct) : ACTIONS.map(() => '—')), counts[b] ? t(`ragLab.act_${ACTIONS[greedy[b]]}`) : t('ragLab.untrained', {action: t(`ragLab.act_${ACTIONS[bestFixed]}`)})])},
    {kind: 'bars', title: t('ragLab.s_heldOut'), rows: [{label: t('ragLab.learnedPolicy'), value: learned}, ...ACTIONS.map((a, i) => ({label: t('ragLab.always', {action: t(`ragLab.act_${a}`)}), value: fixed[i]})), {label: t('ragLab.oracle'), value: oracle}]},
    {kind: 'text', title: t('ragLab.s_rlRead'), text: t('ragLab.rlRead', {learned: learned.toFixed(3), best: Math.max(...fixed).toFixed(3), oracle: oracle.toFixed(3)})},
  ], hits: [], answer: null, prompt: null};
}

// ---------- Test-set scores for the retrieval techniques ----------
export interface BenchRow {id: string; label: string; hit5: number; mrr: number; ms: number}
export function benchmark(): BenchRow[] { return withHeldOut(runBenchmark); }
function runBenchmark(): BenchRow[] {
  const L = lab(), qs = knownItems();
  contextual('warm up', {k: 1});
  const methods: {id: string; run: (q: string) => Hit[]}[] = [
    {id: 'naive', run: q => L.index.dense(L.space.embed(q), 40)},
    {id: 'bm25', run: q => L.index.bm25(q, 40)},
    {id: 'hybrid', run: q => L.index.hybrid(q, L.space.embed(q), 40)},
    {id: 'chunk-semantic', run: q => semanticChunks(95).index.hybrid(q, L.space.embed(q), 40)},
    {id: 'chunk-hierarchical', run: q => hierarchicalChunks().index.hybrid(q, L.space.embed(q), 40)},
    {id: 'contextual', run: q => st.ctx!.ctx.hybrid(q, L.space.embed(q), 40)},
    {id: 'rerank', run: q => rerank(q, {k: 40, n: 40}).hits},
    {id: 'fusion', run: q => fusion(q, {k: 40, rewrites: []}).hits},
    {id: 'late', run: q => late(q, {k: 40, candidates: L.index.hybrid(q, L.space.embed(q), 60).map(h => h.p)}).hits},
  ];
  return methods.map(m => {
    const start = performance.now(); let hit = 0, mrr = 0;
    for (const it of qs) { const r = docRank(m.run(it.q), it.target); if (r && r <= 5) hit++; mrr += rr(r); }
    return {id: m.id, label: t(`ragLab.bench_${m.id}`), hit5: hit / qs.length, mrr: mrr / qs.length, ms: (performance.now() - start) / qs.length};
  });
}
