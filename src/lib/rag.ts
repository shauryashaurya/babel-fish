import {families, mechanismsOf, familyOf, mechanisms} from './architecture';
import {explainers, fineTuning} from './learning';
import type {Model} from './types';
import type {SourceLink} from './learning';
import type {MathItem} from './architecture';

export interface RagApproach {
  id: string; name: string; category: string; what: string; how: string[]; bestFor: string; strength: string; limit: string;
  indexCost: number; queryCost: number; multiHop: number; global: number; exact: number; source: SourceLink; docs?: SourceLink; more?: SourceLink[];
}
export interface Technique {id: string; name: string; approaches: string[]; plain: string; paper: string[]; here: string; differs: string;}
export interface LabQuery {q: string; hyde: string; rewrites: string[]; subqs: string[];}
export type SqlValue = string | number | boolean | null;
export interface SqlPreset {id: string; question: string; sql: string; select: string[]; where: [string, string, SqlValue][]; group?: string; median?: string; order: [string, 'asc' | 'desc']; limit: number;}
export interface PipelineStage {id: string; title: string; side: 'index' | 'query' | 'ops'; what: string; decide: string[]; fails: string; source?: SourceLink;}
export interface ChooserRule {when: Record<string, string>; add?: string[]; avoid?: string[]; why: string;}
export interface RagContent {
  intro: {what: string; analogy: string; goodFor: string[]; badFor: string[]; source: SourceLink};
  pipeline: PipelineStage[];
  failurePoints: {title: string; source: SourceLink; items: {name: string; stage: string; text: string}[]};
  categories: Record<string, string>;
  approaches: RagApproach[];
  chooser: {intro: string; questions: {id: string; label: string; options: {id: string; label: string}[]}[]; rules: ChooserRule[]};
  metrics: MathItem[]; metricsSource: SourceLink;
  risks: {title: string; text: string; source?: SourceLink}[];
  checklist: string[];
  compare: {title: string; rows: {need: string; rag: string; ft: string; long: string}[]};
  graphNote: string; graphSources: SourceLink[]; labNote: string; survey: SourceLink;
  techniques: {intro: string; corpusNote: string; items: Technique[]};
  labQueries: LabQuery[]; memoryFollowUps: string[]; sqlPresets: SqlPreset[];
}
export let rag = {} as RagContent;
export const setRag = (r: RagContent) => { rag = r; };

// ---------- Corpus: the text of this app's own explainers ----------
export interface Doc {id: string; title: string; section: string; text: string; href: string;}
export function buildCorpus(): Doc[] {
  const docs: Doc[] = [];
  for (const c of explainers.concepts ?? []) docs.push({id: `concept-${c.id}`, title: c.term, section: 'Key concepts', text: `${c.plain} ${c.why} ${c.example}`, href: '#/architecture/concepts'});
  for (const m of mechanisms) {
    const p = explainers.mechanisms?.[m.id];
    docs.push({id: `mech-${m.id}`, title: m.name, section: 'Building blocks', text: [m.summary, m.how, m.helps, m.watch, p?.what, p?.why, p?.example].filter(Boolean).join(' '), href: `#/architecture/mechanism/${m.id}`});
  }
  for (const f of families) {
    const p = explainers.families?.[f.id];
    docs.push({id: `family-${f.id}`, title: f.name, section: 'Architecture families', text: [f.summary, f.how, f.why, f.watch, p?.what, p?.why].filter(Boolean).join(' '), href: `#/architecture/family/${f.id}`});
  }
  for (const s of fineTuning.stages ?? []) docs.push({id: `ft-${s.id}`, title: s.title, section: 'Fine-tuning', text: [s.summary, ...s.detail, s.watch].join(' '), href: '#/finetuning/how'});
  for (const m of fineTuning.methods ?? []) docs.push({id: `ftm-${m.id}`, title: m.name, section: 'Fine-tuning methods', text: `${m.what} Best for: ${m.best}. ${m.strength}. ${m.limit}.`, href: '#/finetuning/methods'});
  for (const [i, r] of (fineTuning.risks ?? []).entries()) docs.push({id: `ftr-${i}`, title: r.title, section: 'Fine-tuning risks', text: r.text, href: '#/finetuning/risks'});
  for (const [i, r] of (rag.risks ?? []).entries()) docs.push({id: `ragr-${i}`, title: r.title, section: 'RAG risks', text: r.text, href: '#/rag/evaluate'});
  for (const a of rag.approaches ?? []) docs.push({id: `rag-${a.id}`, title: a.name, section: 'RAG approaches', text: `${a.what} ${a.how.join('. ')}. Best for: ${a.bestFor}. ${a.strength}. ${a.limit}.`, href: `#/rag/approaches`});
  return docs;
}

export interface Chunk {id: string; doc: Doc; index: number; text: string; words: number;}
export type ChunkMode = 'words' | 'sentences' | 'document';
export function chunkCorpus(docs: Doc[], mode: ChunkMode, size: number, overlap: number): Chunk[] {
  const out: Chunk[] = [];
  for (const doc of docs) {
    const body = doc.text.replace(/\s+/g, ' ').trim();
    let pieces: string[];
    if (mode === 'document') pieces = [body];
    else if (mode === 'sentences') {
      const sentences = body.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [body];
      const per = Math.max(1, Math.round(size / 20)), step = Math.max(1, per - Math.round(overlap / 20));
      pieces = [];
      for (let i = 0; i < sentences.length; i += step) { pieces.push(sentences.slice(i, i + per).join(' ')); if (i + per >= sentences.length) break; }
    } else {
      const words = body.split(' '), step = Math.max(1, size - overlap);
      pieces = [];
      for (let i = 0; i < words.length; i += step) { pieces.push(words.slice(i, i + size).join(' ')); if (i + size >= words.length) break; }
    }
    pieces.forEach((text, index) => out.push({id: `${doc.id}#${index}`, doc, index, text, words: text.split(' ').length}));
  }
  return out;
}

// ---------- Retrieval ----------
import {terms} from './ragMath';
export {terms};

/** Okapi BM25 with the usual k1 = 1.2 and b = 0.75 (Robertson and Zaragoza, 2009). */
export function bm25(chunks: Chunk[], query: string, k1 = 1.2, b = .75) {
  const docs = chunks.map(c => terms(`${c.doc.title} ${c.text}`)), avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  docs.forEach(d => new Set(d).forEach(w => df.set(w, (df.get(w) ?? 0) + 1)));
  const q = [...new Set(terms(query))], N = docs.length;
  return docs.map((d, i) => {
    const tf = new Map<string, number>(); d.forEach(w => tf.set(w, (tf.get(w) ?? 0) + 1));
    let score = 0; const matched: string[] = [];
    for (const w of q) {
      const f = tf.get(w) ?? 0; if (!f) continue;
      const n = df.get(w) ?? 0, idf = Math.log(1 + (N - n + .5) / (n + .5));
      score += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * d.length / avg)); matched.push(w);
    }
    return {chunk: chunks[i], score, matched};
  });
}
/** Cosine similarity of character-trigram counts: tolerant of word forms and typos, blind to meaning. */
export function trigram(chunks: Chunk[], query: string) {
  const grams = (text: string) => { const m = new Map<string, number>(); for (const w of terms(text)) { const s = ` ${w} `; for (let i = 0; i < s.length - 2; i++) { const g = s.slice(i, i + 3); m.set(g, (m.get(g) ?? 0) + 1); } } return m; };
  const norm = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0)) || 1;
  const q = grams(query), qn = norm(q);
  return chunks.map(chunk => {
    const g = grams(`${chunk.doc.title} ${chunk.text}`); let dot = 0;
    q.forEach((v, k) => { dot += v * (g.get(k) ?? 0); });
    return {chunk, score: dot / (qn * norm(g)), matched: [] as string[]};
  });
}
export interface Ranked {chunk: Chunk; score: number; matched: string[]; ranks: {bm25: number | null; trigram: number | null};}
/** Reciprocal rank fusion (Cormack, Clarke and Buettcher, 2009): score = sum of 1 / (k + rank). */
export function search(chunks: Chunk[], query: string, method: 'bm25' | 'trigram' | 'hybrid', depth = 50, k = 60): Ranked[] {
  const order = (rows: {chunk: Chunk; score: number; matched: string[]}[]) => rows.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, depth);
  const a = order(bm25(chunks, query)), b = order(trigram(chunks, query));
  const rankA = new Map(a.map((r, i) => [r.chunk.id, i + 1])), rankB = new Map(b.map((r, i) => [r.chunk.id, i + 1]));
  const matched = new Map(a.map(r => [r.chunk.id, r.matched]));
  const pick = method === 'bm25' ? a : method === 'trigram' ? b : [...new Map([...a, ...b].map(r => [r.chunk.id, r.chunk])).values()].map(chunk => ({
    chunk, matched: [] as string[], score: (rankA.has(chunk.id) ? 1 / (k + rankA.get(chunk.id)!) : 0) + (rankB.has(chunk.id) ? 1 / (k + rankB.get(chunk.id)!) : 0),
  })).sort((x, y) => y.score - x.score);
  return pick.map(r => ({...r, matched: matched.get(r.chunk.id) ?? [], ranks: {bm25: rankA.get(r.chunk.id) ?? null, trigram: rankB.get(r.chunk.id) ?? null}}));
}

// ---------- Graph built from the catalog ----------
export type NodeKind = 'model' | 'publisher' | 'family' | 'mechanism' | 'licence';
export interface GraphNode {id: string; kind: NodeKind; label: string; href?: string; model?: Model;}
export interface Graph {nodes: Map<string, GraphNode>; adj: Map<string, Set<string>>;}
export function buildGraph(models: Model[]): Graph {
  const nodes = new Map<string, GraphNode>(), adj = new Map<string, Set<string>>();
  const add = (n: GraphNode) => { if (!nodes.has(n.id)) { nodes.set(n.id, n); adj.set(n.id, new Set()); } return n.id; };
  const link = (a: string, b: string) => { adj.get(a)!.add(b); adj.get(b)!.add(a); };
  for (const m of models) {
    const id = add({id: `model:${m.id}`, kind: 'model', label: m.name, href: `#/model/${encodeURIComponent(m.id)}`, model: m});
    link(id, add({id: `publisher:${m.publisher}`, kind: 'publisher', label: m.publisher}));
    const f = familyOf(m); if (f) link(id, add({id: `family:${f.id}`, kind: 'family', label: f.name, href: `#/architecture/family/${f.id}`}));
    for (const x of mechanismsOf(m)) link(id, add({id: `mechanism:${x.id}`, kind: 'mechanism', label: x.name, href: `#/architecture/mechanism/${x.id}`}));
    link(id, add({id: `licence:${m.license.rule.name}`, kind: 'licence', label: m.license.rule.name}));
  }
  return {nodes, adj};
}
/** Models that share most of their attributes are linked; label propagation then finds groups (Raghavan, Albert and Kumara, 2007). */
export function communities(g: Graph, threshold: number) {
  const modelIds = [...g.nodes.values()].filter(n => n.kind === 'model').map(n => n.id);
  const attrs = new Map(modelIds.map(id => [id, new Set([...g.adj.get(id)!].filter(x => !x.startsWith('publisher:') && !x.startsWith('licence:')))]));
  const neighbours = new Map<string, string[]>(modelIds.map(id => [id, []]));
  for (let i = 0; i < modelIds.length; i++) for (let j = i + 1; j < modelIds.length; j++) {
    const a = attrs.get(modelIds[i])!, b = attrs.get(modelIds[j])!; let inter = 0; a.forEach(x => { if (b.has(x)) inter++; });
    const jac = inter / (a.size + b.size - inter || 1);
    if (jac >= threshold) { neighbours.get(modelIds[i])!.push(modelIds[j]); neighbours.get(modelIds[j])!.push(modelIds[i]); }
  }
  const label = new Map(modelIds.map(id => [id, id]));
  for (let round = 0; round < 20; round++) {
    let changed = false;
    for (const id of modelIds) { // fixed order keeps the result reproducible
      const counts = new Map<string, number>();
      for (const n of neighbours.get(id)!) counts.set(label.get(n)!, (counts.get(label.get(n)!) ?? 0) + 1);
      if (!counts.size) continue;
      const best = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0];
      if (best !== label.get(id) && (counts.get(best)! > (counts.get(label.get(id)!) ?? 0))) { label.set(id, best); changed = true; }
    }
    if (!changed) break;
  }
  const groups = new Map<string, string[]>();
  for (const id of modelIds) { const l = label.get(id)!; groups.set(l, [...(groups.get(l) ?? []), id]); }
  return [...groups.values()].sort((a, b) => b.length - a.length).map(ids => {
    const tally = (kind: NodeKind) => {
      const c = new Map<string, number>();
      ids.forEach(id => g.adj.get(id)!.forEach(n => { if (n.startsWith(kind + ':')) c.set(n, (c.get(n) ?? 0) + 1); }));
      return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([n, count]) => ({node: g.nodes.get(n)!, count}));
    };
    return {ids, models: ids.map(id => g.nodes.get(id)!), family: tally('family'), mechanism: tally('mechanism'), publisher: tally('publisher'), licence: tally('licence')};
  });
}

// ---------- Chooser ----------
export function recommend(answers: Record<string, string>) {
  const fired = rag.chooser.rules.filter(r => Object.entries(r.when).every(([k, v]) => answers[k] === v));
  const avoid = new Set(fired.flatMap(r => r.avoid ?? []));
  const picks = new Map<string, string[]>();
  for (const r of fired) for (const id of r.add ?? []) if (!avoid.has(id)) picks.set(id, [...(picks.get(id) ?? []), r.why]);
  const byId = (id: string) => rag.approaches.find(a => a.id === id)!;
  return {
    picks: [...picks.entries()].map(([id, why]) => ({approach: byId(id), why})),
    avoid: [...avoid].map(id => ({approach: byId(id), why: fired.filter(r => r.avoid?.includes(id)).map(r => r.why)})),
  };
}
