/**
 * Agentic patterns run in the page. No language model runs here: every step a model would write (thoughts, plans,
 * critiques, memos) is produced by a stated rule, and every tool is real code over the catalog in ./data.
 * Each run counts the model calls, tool calls and sequential rounds the pattern needs, and checks its answer
 * against a direct query of the catalog.
 */
import {t} from './content';
import {agents, type BriefSpec, type JsonSchema} from './agents';
import {infrastructure, type CloudInstance} from './infrastructure';
import {naive, type GanttRow, type Series, type Step} from './ragLab';
import {dot, normalize, rng, terms} from './ragMath';
import type {Model} from './types';

const L = (k: string, v: Record<string, string | number> = {}) => t(`agentLab.${k}`, v);
const GIB = 1024 ** 3, MIB = 1024 * 1024;
export const gib = (v: number) => `${v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1)} GiB`;
export const tokens = (n: number) => n >= MIB ? `${+(n / MIB).toFixed(2)}M` : `${Math.round(n / 1024)}K`;
const tok = (s: string) => Math.ceil(s.length / 4);
const cut = (s: string, n = 90) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const names = (list: Model[], n = 3) => list.slice(0, n).map(m => m.name).join(', ') + (list.length > n ? L('andMore', {n: list.length - n}) : '');

// ---------- Metering ----------
export interface Metrics {llmCalls: number; toolCalls: number; llmRounds: number; toolRounds: number; tokens: number}
class Meter {
  m: Metrics = {llmCalls: 0, toolCalls: 0, llmRounds: 0, toolRounds: 0, tokens: 0};
  /** One model call: the whole prompt is sent, so a growing transcript costs more each time. */
  llm(prompt: string, out = '', parallel = false) { this.m.llmCalls++; if (!parallel) this.m.llmRounds++; this.m.tokens += tok(prompt) + tok(out); }
  tools(n: number, parallel = false) { this.m.toolCalls += n; this.m.toolRounds += n && parallel ? 1 : n; }
}

export type Verdict = 'best' | 'valid' | 'invalid' | 'none' | 'noneCorrect';
export interface AgentRun {steps: Step[]; metrics: Metrics; pick: Model | null; verdict: Verdict | null; latencyMs?: number; pending?: {id: string; text: string}}

// ---------- The environment: the catalog and the brief ----------
let all: Model[] = [];
export const useModels = (models: Model[]) => { all = models; };
const byId = (id: string) => all.find(m => m.id === id) ?? null;

export const licenceOk = (m: Model) => m.license.rule?.commercial === 'allowed';
/** Weights plus attention cache for the brief's sessions, plus headroom. Null when the catalog does not state the cache size. */
export function memoryOf(m: Model, b: BriefSpec, weights: number | null = m.weightGiB) {
  if (weights === null || m.kvKiBPerToken === null) return null;
  return (weights + m.kvKiBPerToken * b.contextTokens * b.sessions / MIB) * (1 + b.headroomPct / 100);
}
type Failure = 'licence' | 'context' | 'vision' | 'memory' | 'unknown';
export function failures(m: Model, b: BriefSpec): Failure[] {
  const f: Failure[] = [];
  if (b.commercial && !licenceOk(m)) f.push('licence');
  if ((m.context ?? 0) < b.minContext) f.push('context');
  if (b.vision && !m.official?.vision) f.push('vision');
  const mem = memoryOf(m, b);
  if (mem === null) f.push('unknown'); else if (mem > b.budgetGiB) f.push('memory');
  return f;
}
const failText = (m: Model, b: BriefSpec, f: Failure) => L(`fail_${f}`, {name: m.name, licence: m.license.rule?.name ?? m.license.key, context: tokens(m.context ?? 0), need: tokens(b.minContext), mem: gib(memoryOf(m, b) ?? 0), budget: gib(b.budgetGiB)});
/** Ranking rule: Artificial Analysis index where the catalog states it, then total parameters. */
const rankCmp = (a: Model, b: Model) => (b.artificialAnalysisIndex ?? -1) - (a.artificialAnalysisIndex ?? -1) || (b.totalParams ?? 0) - (a.totalParams ?? 0) || a.name.localeCompare(b.name);
export const ranked = (list: Model[]) => [...list].sort(rankCmp);
/** The reference answer: a direct query over the whole catalog. */
export function solve(b: BriefSpec) { const ok = ranked(all.filter(m => !failures(m, b).length)); return {ok, best: ok[0] ?? null}; }
function judge(pick: Model | null, b: BriefSpec): Verdict {
  const {best} = solve(b);
  if (!pick) return best ? 'none' : 'noneCorrect';
  if (failures(pick, b).length) return 'invalid';
  return pick.id === best?.id ? 'best' : 'valid';
}
/** The brief written as a sentence that the prompt-chaining extractor can read back. */
export const briefText = (b: BriefSpec) => L('briefText', {licence: L(b.commercial ? 'textCommercial' : 'textResearch'), context: tokens(b.minContext), sessions: b.sessions, tokens: tokens(b.contextTokens), budget: b.budgetGiB, vision: b.vision ? L('textVision') : '', headroom: b.headroomPct});
export const briefLine = (b: BriefSpec) => L('briefLine', {licence: L(b.commercial ? 'needCommercial' : 'anyLicence'), context: tokens(b.minContext), sessions: b.sessions, tokens: tokens(b.contextTokens), budget: gib(b.budgetGiB), vision: L(b.vision ? 'needVision' : 'textOnly'), headroom: b.headroomPct});

// ---------- Cloud instances ----------
const cloud = () => infrastructure.clouds.find(c => c.id === 'aws') ?? infrastructure.clouds[0];
const fleet = (): CloudInstance[] => (cloud()?.instances ?? []).filter(i => !i.fractional).sort((a, b) => a.gpuMemoryGiB - b.gpuMemoryGiB);
export function instanceFor(total: number) {
  const f = fleet(), one = f.find(i => i.gpuMemoryGiB >= total);
  if (one) return {inst: one, count: 1, gib: one.gpuMemoryGiB};
  const big = f[f.length - 1];
  if (!big) return null;
  const n = Math.ceil(total / big.gpuMemoryGiB);
  return {inst: big, count: n, gib: n * big.gpuMemoryGiB};
}
const instText = (x: ReturnType<typeof instanceFor>) => x ? L('instanceText', {count: x.count, name: x.inst.name, gpus: x.inst.gpus, gpu: x.inst.gpu, mem: x.gib.toLocaleString('en-US')}) : L('noInstance');

// ---------- Tools ----------
export interface ToolOut {ok: boolean; text: string; data?: unknown}
const spec = (name: string) => agents.tools.find(x => x.name === name);
export const toolMs = (name: string) => spec(name)?.ms ?? 300;
const call = (name: string, args: Record<string, unknown>) => `${name}(${JSON.stringify(args)})`;

/** Checks a value against the subset of JSON Schema the tool definitions use. */
export function validate(schema: JsonSchema, v: unknown, path = 'input'): string[] {
  const errs: string[] = [];
  const type = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  if (schema.type === 'integer' ? !(typeof v === 'number' && Number.isInteger(v)) : schema.type !== type) return [L('errType', {path, want: schema.type, got: type})];
  if (schema.enum && !schema.enum.includes(v as string | number)) errs.push(L('errEnum', {path, allowed: schema.enum.join(', ')}));
  if (typeof v === 'number' && schema.minimum !== undefined && v < schema.minimum) errs.push(L('errMin', {path, min: schema.minimum}));
  if (typeof v === 'number' && schema.maximum !== undefined && v > schema.maximum) errs.push(L('errMax', {path, max: schema.maximum}));
  if (type === 'object' && schema.properties) {
    const o = v as Record<string, unknown>;
    for (const r of schema.required ?? []) if (!(r in o)) errs.push(L('errRequired', {path: `${path}.${r}`}));
    for (const [k, val] of Object.entries(o)) {
      const s = schema.properties[k];
      if (!s) { if (schema.additionalProperties === false) errs.push(L('errExtra', {path: `${path}.${k}`})); continue; }
      errs.push(...validate(s, val, `${path}.${k}`));
    }
  }
  if (type === 'array' && schema.items) (v as unknown[]).forEach((x, i) => errs.push(...validate(schema.items!, x, `${path}[${i}]`)));
  return errs;
}

function filterModels(a: {commercial?: boolean; minContext?: number; vision?: boolean}) {
  return ranked(all.filter(m => (!a.commercial || licenceOk(m)) && (m.context ?? 0) >= (a.minContext ?? 0) && (!a.vision || !!m.official?.vision)));
}
export function runTool(name: string, args: Record<string, unknown>): ToolOut {
  const s = spec(name);
  if (!s) return {ok: false, text: L('errNoTool', {name})};
  const errs = validate(s.schema, args);
  if (errs.length) return {ok: false, text: errs.join(' ')};
  const m = typeof args.id === 'string' ? byId(args.id) : null;
  if ('id' in args && !m) return {ok: false, text: L('errNoModel', {id: String(args.id)})};
  switch (name) {
    case 'filter_models': { const r = filterModels(args); return {ok: true, data: r, text: L('obsFilter', {n: r.length, top: r.length ? names(r) : '—'})}; }
    case 'get_model': return {ok: true, data: m, text: L('obsModel', {name: m!.name, params: m!.scale, context: tokens(m!.context ?? 0), vision: L(m!.official?.vision ? 'yes' : 'no'), licence: m!.license.rule?.name ?? m!.license.key})};
    case 'check_licence': { const r = m!.license.rule; return {ok: true, data: r, text: L('obsLicence', {licence: r?.name ?? m!.license.key, status: L(`commercial_${r?.commercial ?? 'unverified'}`), n: r?.obligations.length ?? 0})}; }
    case 'memory_estimate': {
      const b: BriefSpec = {commercial: false, minContext: 0, vision: false, budgetGiB: Infinity, contextTokens: Number(args.contextTokens), sessions: Number(args.sessions), headroomPct: Number(args.headroomPct ?? 0)};
      const total = memoryOf(m!, b);
      if (total === null) return {ok: false, text: L('obsMemoryUnknown', {name: m!.name})};
      const cache = (m!.kvKiBPerToken ?? 0) * b.contextTokens * b.sessions / MIB;
      return {ok: true, data: total, text: L('obsMemory', {name: m!.name, w: gib(m!.weightGiB ?? 0), c: gib(cache), total: gib(total)})};
    }
    case 'smallest_instance': { const x = instanceFor(Number(args.totalGiB)); return {ok: !!x, data: x, text: instText(x)}; }
    case 'search_docs': { const r = naive(String(args.query), {k: 3}); return {ok: true, data: r.hits, text: r.hits.length ? r.hits.map(h => h.p.title).join(' · ') : L('obsNoDocs')}; }
    case 'save_shortlist': return {ok: true, text: L('obsSaved', {n: (args.ids as unknown[]).length})};
    case 'request_gpu_quota': return {ok: true, text: L('obsQuota', {count: Number(args.count), instance: String(args.instance)})};
    case 'send_email': return {ok: true, text: L('obsEmail', {to: String(args.to)})};
    default: return {ok: false, text: L('errNoTool', {name})};
  }
}
const memArgs = (m: Model, b: BriefSpec) => ({id: m.id, contextTokens: b.contextTokens, sessions: b.sessions, headroomPct: b.headroomPct});

// ---------- Shared steps ----------
const toolsStep = (list: string[]): Step => ({kind: 'chips', title: L('s_tools'), items: list.map(n => `${n} · ${L(`effect_${spec(n)?.effect ?? 'read'}`)}`)});
function metricsStep(m: Metrics): Step {
  return {kind: 'tiles', title: L('s_cost'), items: [
    {label: L('m_llm'), value: String(m.llmCalls)}, {label: L('m_tools'), value: String(m.toolCalls)},
    {label: L('m_rounds'), value: String(m.llmRounds + m.toolRounds)}, {label: L('m_tokens'), value: m.tokens.toLocaleString('en-US')}]};
}
function verdictStep(pick: Model | null, b: BriefSpec): Step {
  const v = judge(pick, b), best = solve(b).best;
  const text = v === 'invalid' ? L('v_invalid', {name: pick!.name, why: failures(pick!, b).map(f => failText(pick!, b, f)).join(' ')}) : L(`v_${v}`, {name: pick?.name ?? '', best: best?.name ?? ''});
  return {kind: 'text', title: L('s_check'), text, tone: v === 'best' || v === 'noneCorrect' ? 'ok' : 'warn'};
}
function done(steps: Step[], meter: Meter, pick: Model | null, b: BriefSpec, extra: Partial<AgentRun> = {}, check = true): AgentRun {
  if (check) steps.push(verdictStep(pick, b));
  steps.push(metricsStep(meter.m));
  return {steps, metrics: meter.m, pick, verdict: check ? judge(pick, b) : null, ...extra};
}

// ---------- 1. ReAct ----------
export function react(models: Model[], b: BriefSpec, o: {budget: number}): AgentRun {
  useModels(models);
  const meter = new Meter(), rows: (string | number)[][] = [];
  let transcript = `${L('sysAgent')}\n${briefLine(b)}`, cands: Model[] | null = null, next = 0, pick: Model | null = null, stop = false;
  for (let i = 1; i <= o.budget && !stop; i++) {
    let thought: string, action: string, obs = '—', used = 0;
    if (pick) { thought = L('react_finish', {name: pick.name}); action = `finish("${pick.id}")`; stop = true; }
    else if (!cands) {
      const args = {commercial: b.commercial, minContext: b.minContext, vision: b.vision};
      thought = L('react_filter'); action = call('filter_models', args); const r = runTool('filter_models', args); obs = r.text; used = 1;
      cands = r.data as Model[];
    } else if (next >= cands.length) { thought = L('react_none'); action = 'finish(null)'; stop = true; }
    else {
      const m = cands[next++];
      thought = next === 1 ? L('react_first', {name: m.name}) : L('react_next', {name: m.name});
      action = call('memory_estimate', memArgs(m, b)); const r = runTool('memory_estimate', memArgs(m, b)); used = 1;
      const fits = r.ok && (r.data as number) <= b.budgetGiB;
      obs = `${r.text} ${r.ok ? L(fits ? 'fitsBudget' : 'overBudget', {budget: gib(b.budgetGiB)}) : ''}`;
      if (fits) pick = m;
    }
    meter.llm(transcript, thought + action); meter.tools(used);
    transcript += `\nThought: ${thought}\nAction: ${action}\nObservation: ${obs}`;
    rows.push([i, thought, action, cut(obs, 140)]);
  }
  const steps: Step[] = [toolsStep(['filter_models', 'memory_estimate']), {kind: 'table', title: L('s_reactLoop'), head: [L('colStep'), L('colThought'), L('colAction'), L('colObservation')], rows, note: L('ruleWritten')}];
  if (!stop) { steps.push({kind: 'text', title: L('s_budget'), text: L('budgetHit', {n: o.budget}), tone: 'warn'}); pick = null; }
  return done(steps, meter, pick, b);
}

// ---------- 2. Plan and execute ----------
export function planExecute(models: Model[], b: BriefSpec, o: {replan: boolean}): AgentRun {
  useModels(models);
  const meter = new Meter();
  type Kind = 'licence' | 'context' | 'vision' | 'memory';
  const plan: Kind[] = [...(b.commercial ? ['licence' as const] : []), 'context', ...(b.vision ? ['vision' as const] : []), 'memory'];
  const planText = [...plan.map((k, i) => `${i + 1}. ${L(`plan_${k}`, {context: tokens(b.minContext), budget: gib(b.budgetGiB)})}`), `${plan.length + 1}. ${L('plan_rank')}`].join('\n');
  meter.llm(`${L('sysPlanner')}\n${briefLine(b)}`, planText);
  let pool = [...all];
  const rows: (string | number)[][] = [], relaxed: Kind[] = [];
  for (const [i, k] of plan.entries()) {
    const before = pool;
    meter.llm(`${L('sysExecutor')}\n${planText}\n${L('stepNow', {n: i + 1})}`, k);
    let calls = 1;
    if (k === 'licence') pool = pool.filter(licenceOk);
    else if (k === 'context') pool = pool.filter(m => (m.context ?? 0) >= b.minContext);
    else if (k === 'vision') pool = pool.filter(m => !!m.official?.vision);
    else { calls = pool.length; pool = pool.filter(m => { const x = memoryOf(m, b); return x !== null && x <= b.budgetGiB; }); }
    meter.tools(calls);
    rows.push([i + 1, L(`plan_${k}`, {context: tokens(b.minContext), budget: gib(b.budgetGiB)}), calls, pool.length]);
    if (!pool.length && o.replan) {
      meter.llm(`${L('sysReplanner')}\n${planText}`, k);
      relaxed.push(k); pool = before;
      rows.push(['↺', L('replanned', {step: L(`plan_${k}`, {context: tokens(b.minContext), budget: gib(b.budgetGiB)})}), 0, pool.length]);
    }
  }
  const pick = ranked(pool)[0] ?? null;
  meter.llm(`${L('sysExecutor')}\n${planText}`, pick?.name ?? '');
  const steps: Step[] = [
    {kind: 'code', title: L('s_plan'), text: planText},
    {kind: 'table', title: L('s_execute'), head: [L('colStep'), L('colPlanStep'), L('colToolCalls'), L('colModelsLeft')], rows, note: L('ruleWritten')},
  ];
  if (relaxed.length) steps.push({kind: 'text', title: L('s_replan'), text: L('relaxedNote', {steps: relaxed.map(k => L(`plan_${k}`, {context: tokens(b.minContext), budget: gib(b.budgetGiB)})).join('; ')}), tone: 'warn'});
  steps.push({kind: 'text', title: L('s_answer'), text: pick ? L('answerPick', {name: pick.name}) : L('answerNone')});
  return done(steps, meter, pick, b);
}

// ---------- 3. Reflection (Self-Refine) ----------
export function reflection(models: Model[], b: BriefSpec, o: {rounds: number}): AgentRun {
  useModels(models);
  const meter = new Meter(), known = new Set<Failure>(), rows: (string | number)[][] = [];
  const draftFor = () => ranked(all.filter(m => [...known].every(f => !failures(m, b).includes(f))))[0] ?? null;
  let pick = ranked(all.filter(m => !b.commercial || licenceOk(m)))[0] ?? null;
  meter.llm(`${L('sysWriter')}\n${briefLine(b)}`, pick?.name ?? '');
  for (let r = 1; r <= o.rounds; r++) {
    if (!pick) { rows.push([r, '—', L('critiqueEmpty')]); break; }
    meter.tools(3); meter.llm(`${L('sysCritic')}\n${briefLine(b)}\n${pick.name}`, '');
    const f = failures(pick, b);
    rows.push([r, pick.name, f.length ? f.map(x => failText(pick!, b, x)).join(' ') : L('critiqueClean')]);
    if (!f.length) break;
    f.forEach(x => known.add(x));
    meter.llm(`${L('sysWriter')}\n${briefLine(b)}\n${f.join(', ')}`, '');
    pick = draftFor();
  }
  const steps: Step[] = [
    {kind: 'text', title: L('s_firstDraft'), text: L('firstDraftRule')},
    {kind: 'table', title: L('s_refine'), head: [L('colRound'), L('colDraft'), L('colFeedback')], rows, note: L('ruleWritten')},
  ];
  const final = pick && !failures(pick, b).length ? pick : null;
  if (pick && !final) steps.push({kind: 'text', title: L('s_rounds'), text: L('roundsHit', {n: o.rounds}), tone: 'warn'});
  return done(steps, meter, final, b);
}

// ---------- 4. Reflexion ----------
export function reflexion(models: Model[], b: BriefSpec, o: {trials: number; warmup: BriefSpec | null}): AgentRun {
  useModels(models);
  const meter = new Meter(), lessons: Failure[] = [], steps: Step[] = [];
  const episode = (brief: BriefSpec, label: string) => {
    const rows: (string | number)[][] = [];
    let win: Model | null = null;
    for (let i = 1; i <= o.trials; i++) {
      const choice = ranked(all.filter(m => lessons.every(f => !failures(m, brief).includes(f))))[0] ?? null;
      meter.llm(`${L('sysActor')}\n${briefLine(brief)}\n${lessons.map(x => L(`lesson_${x}`)).join('\n')}`, choice?.name ?? '');
      if (!choice) { rows.push([i, '—', L('trialNothing'), '—']); break; }
      meter.tools(3);
      const f = failures(choice, brief);
      if (!f.length) { rows.push([i, choice.name, L('trialPass'), '—']); win = choice; break; }
      const lesson = f.find(x => !lessons.includes(x)) ?? f[0];
      if (!lessons.includes(lesson)) lessons.push(lesson);
      meter.llm(`${L('sysReflect')}\n${failText(choice, brief, f[0])}`, L(`lesson_${lesson}`));
      rows.push([i, choice.name, f.map(x => failText(choice, brief, x)).join(' '), L(`lesson_${lesson}`)]);
    }
    steps.push({kind: 'table', title: label, head: [L('colTrial'), L('colChoice'), L('colFeedback'), L('colReflection')], rows, note: L('ruleWritten')});
    return win;
  };
  if (o.warmup) episode(o.warmup, L('s_warmup', {brief: briefLine(o.warmup)}));
  const pick = episode(b, L('s_trials'));
  steps.push({kind: 'chips', title: L('s_memory'), items: lessons.length ? lessons.map(x => L(`lesson_${x}`)) : [L('memoryEmpty')]});
  return done(steps, meter, pick, b);
}

// ---------- 5. ReWOO ----------
export function rewoo(models: Model[], b: BriefSpec, o: {breadth: number}): AgentRun {
  useModels(models);
  const meter = new Meter(), fargs = {commercial: b.commercial, minContext: b.minContext, vision: b.vision};
  const lines = [`Plan: ${L('rewoo_p1')}`, `#E1 = ${call('filter_models', fargs)}`, `Plan: ${L('rewoo_p2', {k: o.breadth})}`,
    ...Array.from({length: o.breadth}, (_, i) => `#E${i + 2} = memory_estimate({"id": "#E1[${i}]", "contextTokens": ${b.contextTokens}, "sessions": ${b.sessions}, "headroomPct": ${b.headroomPct}})`),
    `Plan: ${L('rewoo_p3')}`];
  const plan = lines.join('\n');
  meter.llm(`${L('sysPlanner')}\n${briefLine(b)}`, plan);
  const e1 = runTool('filter_models', fargs), cands = (e1.data as Model[]).slice(0, o.breadth);
  meter.tools(1); meter.tools(cands.length, true);
  const evidence = [['#E1', 'filter_models', e1.text], ...cands.map((m, i) => { const r = runTool('memory_estimate', memArgs(m, b)); return [`#E${i + 2}`, 'memory_estimate', `${r.text} ${r.ok ? L((r.data as number) <= b.budgetGiB ? 'fitsBudget' : 'overBudget', {budget: gib(b.budgetGiB)}) : ''}`]; })];
  const pick = cands.find(m => { const x = memoryOf(m, b); return x !== null && x <= b.budgetGiB; }) ?? null;
  meter.llm(`${L('sysSolver')}\n${briefLine(b)}\n${plan}\n${evidence.map(r => r.join(' ')).join('\n')}`, pick?.name ?? '');
  const reactRun = react(models, b, {budget: 60});
  const steps: Step[] = [
    {kind: 'code', title: L('s_rewooPlan'), text: plan},
    {kind: 'table', title: L('s_worker'), head: [L('colEvidence'), L('colTool'), L('colResult')], rows: evidence},
    {kind: 'text', title: L('s_solver'), text: pick ? L('answerPick', {name: pick.name}) : L('rewooMissed', {k: o.breadth}), tone: pick ? undefined : 'warn'},
    {kind: 'table', title: L('s_vsReact'), head: ['', 'ReWOO', 'ReAct'], rows: [
      [L('m_llm'), meter.m.llmCalls, reactRun.metrics.llmCalls], [L('m_tools'), meter.m.toolCalls, reactRun.metrics.toolCalls], [L('m_tokens'), meter.m.tokens.toLocaleString('en-US'), reactRun.metrics.tokens.toLocaleString('en-US')]], note: L('vsReactNote')},
  ];
  return done(steps, meter, pick, b);
}

// ---------- 6 and 7. Search over deployment plans: Tree of Thoughts and LATS ----------
type Precision = 'published' | 'bit8' | 'bit4';
interface Leaf {m: Model; p: Precision; need: number | null; inst: ReturnType<typeof instanceFor>; score: number}
const PRECISION_BYTES: Record<Precision, number> = {published: 0, bit8: 1, bit4: .5};
function weightsAt(m: Model, p: Precision) {
  if (p === 'published' || !m.totalParams) return m.weightGiB;
  return Math.min(m.weightGiB ?? Infinity, m.totalParams * PRECISION_BYTES[p] / GIB);
}
interface SearchSpace {models: Model[]; quality: (m: Model) => number; leaf: (m: Model, p: Precision) => Leaf; guess: (m: Model, p: Precision) => number}
function space(b: BriefSpec, o: {width: number; lambda: number}): SearchSpace {
  const models = ranked(all.filter(m => (!b.commercial || licenceOk(m)) && (m.context ?? 0) >= b.minContext && (!b.vision || m.official?.vision))).slice(0, o.width);
  const quality = (m: Model) => models.length < 2 ? 1 : 1 - models.indexOf(m) / (models.length - 1);
  /** Exact value of a finished plan: the model's rank, reduced by the share of the hardware budget it provisions. Zero when it does not fit. */
  const leaf = (m: Model, p: Precision): Leaf => {
    const need = memoryOf(m, b, weightsAt(m, p)), inst = need === null ? null : instanceFor(need);
    const fits = need !== null && inst !== null && need <= b.budgetGiB && inst.gib <= b.budgetGiB;
    return {m, p, need, inst, score: fits ? quality(m) * (1 - o.lambda * inst!.gib / b.budgetGiB) : 0};
  };
  /** Cheap estimate before any tool call: weights only, ignoring the cache, as a quick evaluator would. */
  const guess = (m: Model, p: Precision) => {
    const w = weightsAt(m, p);
    if (w === null || w * (1 + b.headroomPct / 100) > b.budgetGiB) return 0;
    const inst = instanceFor(w * (1 + b.headroomPct / 100));
    return inst && inst.gib <= b.budgetGiB ? quality(m) * (1 - o.lambda * inst.gib / b.budgetGiB) : 0;
  };
  return {models, quality, leaf, guess};
}
const precisionLabel = (p: Precision) => L(`prec_${p}`);
const leafRow = (x: Leaf) => [x.m.name, precisionLabel(x.p), x.need === null ? '—' : gib(x.need), x.inst ? instText(x.inst) : '—', x.score ? x.score.toFixed(3) : L('doesNotFit')];

export function tot(models: Model[], b: BriefSpec, o: {beam: number; width: number; lambda: number; precisions: Precision[]}): AgentRun {
  useModels(models);
  const meter = new Meter(), S = space(b, o), steps: Step[] = [];
  if (!S.models.length) { steps.push({kind: 'text', title: L('s_tree'), text: L('treeEmpty'), tone: 'warn'}); return done(steps, meter, null, b); }
  // Level 1: propose a model, rate each with the cheap evaluator, keep the best `beam`.
  meter.llm(`${L('sysProposer')}\n${briefLine(b)}`, S.models.map(m => m.name).join(', '));
  const level1 = S.models.map(m => ({m, v: Math.max(...o.precisions.map(p => S.guess(m, p)))}));
  meter.llm(`${L('sysEvaluator')}\n${S.models.map(m => m.name).join('\n')}`, '');
  const kept = [...level1].sort((a, b) => b.v - a.v).slice(0, o.beam).map(x => x.m);
  steps.push({kind: 'table', title: L('s_level1', {n: S.models.length, beam: o.beam}), head: [L('colModel'), L('colEstimate'), L('colKept')],
    rows: level1.map(x => [x.m.name, x.v ? x.v.toFixed(3) : L('doesNotFit'), kept.includes(x.m) ? L('kept') : L('pruned')]), note: L('estimateNote')});
  // Level 2: for each kept model, try each precision and check exactly with the memory tool.
  const leaves = kept.flatMap(m => o.precisions.map(p => S.leaf(m, p)));
  meter.llm(`${L('sysProposer')}\n${kept.map(m => m.name).join('\n')}`, ''); meter.tools(leaves.length, true);
  const best = leaves.filter(x => x.score > 0).sort((a, b) => b.score - a.score)[0] ?? null;
  steps.push({kind: 'table', title: L('s_level2', {n: leaves.length}), head: [L('colModel'), L('colPrecision'), L('colNeed'), L('colInstance'), L('colScore')], rows: leaves.map(leafRow)});
  // The same search with a beam of one, for comparison.
  const greedyModel = [...level1].sort((a, b) => b.v - a.v)[0].m, greedy = o.precisions.map(p => S.leaf(greedyModel, p)).sort((a, b) => b.score - a.score)[0];
  steps.push({kind: 'tiles', title: L('s_treeResult'), items: [
    {label: L('t_beamBest', {beam: o.beam}), value: best ? `${best.m.name} · ${best.score.toFixed(3)}` : L('doesNotFit')},
    {label: L('t_greedy'), value: greedy.score ? `${greedy.m.name} · ${greedy.score.toFixed(3)}` : L('doesNotFit')},
    {label: L('t_states'), value: String(level1.length + leaves.length)}]});
  steps.push({kind: 'text', title: L('s_answer'), text: best ? L('deployPlan', {name: best.m.name, precision: precisionLabel(best.p), need: gib(best.need ?? 0), inst: instText(best.inst)}) : L('answerNone')});
  return done(steps, meter, best?.m ?? null, b, {}, false);
}

export function lats(models: Model[], b: BriefSpec, o: {iterations: number; width: number; lambda: number; precisions: Precision[]; c: number; seed: number}): AgentRun {
  useModels(models);
  const meter = new Meter(), S = space(b, o), steps: Step[] = [], rand = rng(o.seed);
  if (!S.models.length) { steps.push({kind: 'text', title: L('s_tree'), text: L('treeEmpty'), tone: 'warn'}); return done(steps, meter, null, b); }
  interface Node {m: Model; n: number; w: number; kids: Map<Precision, {n: number; w: number}>}
  const nodes: Node[] = S.models.map(m => ({m, n: 0, w: 0, kids: new Map()}));
  const reflections: string[] = [], failed = new Set<string>(), curve: [number, number][] = [], randomCurve: [number, number][] = [];
  let best: Leaf | null = null, total = 0, randomBest = 0;
  const leafCache = new Map<string, Leaf>();
  const exact = (m: Model, p: Precision) => { const k = `${m.id}|${p}`; if (!leafCache.has(k)) { leafCache.set(k, S.leaf(m, p)); meter.tools(1); } return leafCache.get(k)!; };
  for (let it = 1; it <= o.iterations; it++) {
    total++;
    // Selection by UCT; unvisited children are scored by the cheap value estimate, as LATS scores new nodes with a value function.
    const uct = (x: Node) => x.n ? x.w / x.n + o.c * Math.sqrt(Math.log(total) / x.n) : 1 + S.guess(x.m, o.precisions[0]);
    const node = nodes.reduce((a, x) => uct(x) > uct(a) ? x : a, nodes[0]);
    const options = o.precisions.filter(p => !failed.has(`${node.m.id}|${p}`));
    const p = options.length ? options.reduce((a, q) => { const k = node.kids.get(q), ka = node.kids.get(a); const v = (x?: {n: number; w: number}) => x?.n ? x.w / x.n + o.c * Math.sqrt(Math.log(node.n + 1) / x.n) : 2; return v(k) > v(ka) ? q : a; }, options[0]) : o.precisions[0];
    meter.llm(`${L('sysProposer')}\n${node.m.name}\n${reflections.slice(-3).join('\n')}`, p);
    const leaf = exact(node.m, p), reward = leaf.score;
    if (!reward && !failed.has(`${node.m.id}|${p}`)) { failed.add(`${node.m.id}|${p}`); reflections.push(L('latsReflection', {name: node.m.name, precision: precisionLabel(p), need: leaf.need === null ? '—' : gib(leaf.need), budget: gib(b.budgetGiB)})); meter.llm(L('sysReflect'), ''); }
    node.n++; node.w += reward; const k = node.kids.get(p) ?? {n: 0, w: 0}; k.n++; k.w += reward; node.kids.set(p, k);
    if (reward && (!best || reward > best.score)) best = leaf;
    curve.push([it, best?.score ?? 0]);
    // Baseline: the same number of plans drawn uniformly at random.
    const rm = S.models[Math.floor(rand() * S.models.length)], rp = o.precisions[Math.floor(rand() * o.precisions.length)];
    randomBest = Math.max(randomBest, S.leaf(rm, rp).score); randomCurve.push([it, randomBest]);
  }
  const top = Math.max(.05, ...curve.map(p => p[1]), ...randomCurve.map(p => p[1]));
  steps.push({kind: 'chart', title: L('s_latsCurve'), series: [{id: 'lats', label: 'LATS', tone: 1, points: curve}, {id: 'random', label: L('randomBaseline'), tone: 8, points: randomCurve}] as Series[], xMax: o.iterations, yMax: +(top * 1.1).toFixed(3), xLabel: L('axisIterations'), yLabel: L('axisBestScore')});
  steps.push({kind: 'table', title: L('s_visits'), head: [L('colModel'), L('colVisits'), L('colMeanReward')], rows: [...nodes].filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 8).map(x => [x.m.name, x.n, (x.w / x.n).toFixed(3)])});
  steps.push({kind: 'chips', title: L('s_reflections'), items: reflections.length ? reflections.slice(0, 8) : [L('memoryEmpty')]});
  steps.push({kind: 'text', title: L('s_answer'), text: best ? L('deployPlan', {name: best.m.name, precision: precisionLabel(best.p), need: gib(best.need ?? 0), inst: instText(best.inst)}) : L('answerNone')});
  return done(steps, meter, best?.m ?? null, b, {}, false);
}

// ---------- 8. LLMCompiler ----------
interface Task {id: string; label: string; tool: string; deps: string[]; ms: number}
function schedule(tasks: Task[], start: number) {
  const end = new Map<string, number>(), rows: GanttRow[] = [];
  for (const x of tasks) { const s = Math.max(start, ...x.deps.map(d => end.get(d) ?? start)); end.set(x.id, s + x.ms); rows.push({label: x.label, start: s, end: s + x.ms, tone: x.tool === 'llm' ? 7 : 1}); }
  return {rows, end: Math.max(start, ...end.values())};
}
export function compiler(models: Model[], b: BriefSpec, o: {n: number; llmMs: number}): AgentRun {
  useModels(models);
  const meter = new Meter(), fargs = {commercial: b.commercial, minContext: b.minContext, vision: b.vision};
  const cands = (runTool('filter_models', fargs).data as Model[]).slice(0, o.n);
  const tasks: Task[] = [{id: '$1', label: `$1 filter_models`, tool: 'filter_models', deps: [], ms: toolMs('filter_models')}];
  cands.forEach((m, i) => {
    tasks.push({id: `$L${i}`, label: `check_licence · ${m.name}`, tool: 'check_licence', deps: ['$1'], ms: toolMs('check_licence')});
    tasks.push({id: `$M${i}`, label: `memory_estimate · ${m.name}`, tool: 'memory_estimate', deps: ['$1'], ms: toolMs('memory_estimate')});
    tasks.push({id: `$I${i}`, label: `smallest_instance · ${m.name}`, tool: 'smallest_instance', deps: [`$M${i}`], ms: toolMs('smallest_instance')});
  });
  const planText = tasks.map(x => `${x.id} = ${x.label.replace(' · ', '(')}${x.label.includes(' · ') ? ')' : ''}${x.deps.length ? `  ← ${x.deps.join(', ')}` : ''}`).join('\n') + `\njoin()`;
  meter.llm(`${L('sysPlanner')}\n${briefLine(b)}`, planText); meter.tools(tasks.length, true); meter.m.toolRounds = 3;
  const par = schedule(tasks, o.llmMs);
  const rowsPar: GanttRow[] = [{label: L('g_planner'), start: 0, end: o.llmMs, tone: 7}, ...par.rows, {label: L('g_joiner'), start: par.end, end: par.end + o.llmMs, tone: 7}];
  meter.llm(`${L('sysJoiner')}\n${planText}`, '');
  const parTotal = par.end + o.llmMs;
  let tSeq = 0; const rowsSeq: GanttRow[] = [];
  for (const x of tasks) { rowsSeq.push({label: L('g_think', {task: x.id}), start: tSeq, end: tSeq + o.llmMs, tone: 7}); tSeq += o.llmMs; rowsSeq.push({label: x.label, start: tSeq, end: tSeq + x.ms, tone: 1}); tSeq += x.ms; }
  rowsSeq.push({label: L('g_answer'), start: tSeq, end: tSeq + o.llmMs, tone: 7}); tSeq += o.llmMs;
  const results = cands.map(m => { const need = memoryOf(m, b); return {m, need, inst: need === null ? null : instanceFor(need)}; });
  const pick = results.find(r => r.need !== null && r.need <= b.budgetGiB)?.m ?? null;
  const steps: Step[] = [
    {kind: 'code', title: L('s_dag'), text: planText},
    {kind: 'gantt', title: L('s_parallel', {ms: parTotal.toLocaleString('en-US')}), rows: rowsPar, total: tSeq, unit: 'ms', note: L('ganttNote')},
    {kind: 'gantt', title: L('s_sequential', {ms: tSeq.toLocaleString('en-US')}), rows: rowsSeq.length > 18 ? [...rowsSeq.slice(0, 16), {label: L('g_more', {n: rowsSeq.length - 17}), start: rowsSeq[16].start, end: rowsSeq[rowsSeq.length - 2].end, tone: 8}, rowsSeq[rowsSeq.length - 1]] : rowsSeq, total: tSeq, unit: 'ms'},
    {kind: 'tiles', title: L('s_speedup'), items: [{label: L('t_parallel'), value: `${parTotal.toLocaleString('en-US')} ms`}, {label: L('t_sequential'), value: `${tSeq.toLocaleString('en-US')} ms`}, {label: L('t_speedup'), value: `${(tSeq / parTotal).toFixed(1)}×`}, {label: L('t_llmSaved'), value: `${tasks.length + 1} → 2`}]},
    ...(pick ? [] : [{kind: 'text', title: L('s_joinResult'), text: L('compilerMissed', {k: cands.length}), tone: 'warn'} as Step]),
    {kind: 'table', title: L('s_join'), head: [L('colModel'), L('colLicence'), L('colNeed'), L('colInstance')], rows: results.map(r => [r.m.name, L(`commercial_${r.m.license.rule?.commercial ?? 'unverified'}`), r.need === null ? '—' : `${gib(r.need)} ${L(r.need <= b.budgetGiB ? 'fitsBudget' : 'overBudget', {budget: gib(b.budgetGiB)})}`, instText(r.inst)])},
  ];
  return done(steps, meter, pick, b, {latencyMs: parTotal});
}

// ---------- 9. Tool calling ----------
/** Finds the catalog model named in a sentence: the longest model name it contains. */
export function findModel(text: string) {
  const s = text.toLowerCase();
  return [...all].sort((a, b) => b.name.length - a.name.length).find(m => s.includes(m.name.toLowerCase()) || s.includes(m.id)) ?? null;
}
function numberIn(text: string, re: RegExp) { const m = text.match(re); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, '')); return /m/i.test(m[2] ?? '') ? n * MIB : /k/i.test(m[2] ?? '') ? n * 1024 : n; }
export function toolCalling(models: Model[], request: string): AgentRun {
  useModels(models);
  const meter = new Meter(), steps: Step[] = [];
  const granted = agents.tools.filter(x => x.effect === 'read' && x.name !== 'search_docs');
  steps.push({kind: 'code', title: L('s_schemas'), text: JSON.stringify(granted.map(x => ({name: x.name, description: x.description, input_schema: x.schema})), null, 1)});
  const s = request.toLowerCase(), m = findModel(request);
  // Selection rule standing in for the model's choice of function.
  const tool = /licen[cs]e|commercial|allowed|terms/.test(s) ? 'check_licence' : /memory|gib|gpu|fit|vram|tokens/.test(s) ? 'memory_estimate' : /context|layers|parameters|vision|about|tell me/.test(s) ? 'get_model' : /delete|remove|send|email|buy|order|approve/.test(s) ? 'refuse' : 'none';
  const args: Record<string, unknown> = {};
  if (m) args.id = m.id; else if (tool !== 'refuse' && tool !== 'none') args.id = (request.match(/(?:of|for|is|does)\s+([\w.\- ()]+?)(?:\s+(?:need|use|at|allowed|licensed)|[?.]|$)/i)?.[1] ?? '').trim();
  if (tool === 'memory_estimate') {
    const ctx = numberIn(request, /(\d[\d,.]*)\s*(k|m)?\s*(?:tokens|context)/i);
    const ses = numberIn(request, /(\d+)\s*()(?:sessions|users|conversations)/i);
    if (ctx !== null) args.contextTokens = Math.round(ctx);
    args.sessions = ses ?? 1; args.headroomPct = 10;
  }
  meter.llm(`${L('sysTools')}\n${request}`, `${tool}${JSON.stringify(args)}`);
  if (tool === 'refuse' || tool === 'none') {
    steps.push({kind: 'text', title: L('s_select'), text: L(tool === 'refuse' ? 'toolRefuse' : 'toolNone'), tone: 'warn'});
    steps.push(metricsStep(meter.m));
    return {steps, metrics: meter.m, pick: null, verdict: null};
  }
  steps.push({kind: 'code', title: L('s_call'), text: JSON.stringify({type: 'tool_use', name: tool, input: args}, null, 1)});
  const errs = validate(spec(tool)!.schema, args);
  steps.push({kind: 'text', title: L('s_validate'), text: errs.length ? L('validateFail', {errors: errs.join(' ')}) : L('validateOk'), tone: errs.length ? 'warn' : 'ok'});
  if (errs.length) {
    steps.push({kind: 'text', title: L('s_retry'), text: L('retryNote')});
    steps.push(metricsStep(meter.m));
    return {steps, metrics: meter.m, pick: null, verdict: null};
  }
  const r = runTool(tool, args); meter.tools(1);
  steps.push({kind: 'code', title: L('s_result'), text: JSON.stringify({type: 'tool_result', is_error: !r.ok, content: r.text}, null, 1)});
  meter.llm(`${L('sysTools')}\n${request}\n${r.text}`, '');
  steps.push({kind: 'text', title: L('s_answer'), text: r.text}, metricsStep(meter.m));
  return {steps, metrics: meter.m, pick: m, verdict: null};
}

// ---------- 10. Prompt chaining ----------
export function parseBrief(text: string): {brief: BriefSpec; found: Record<string, string | null>} {
  const s = text.replace(/,(?=\d{3})/g, '');
  const commercial = /non-?commercial|research only|internal research/i.test(s) ? false : /commercial|customer|product|client|paid/i.test(s) ? true : null;
  const ctx = numberIn(s, /(?:at least|minimum of|min\.?)\s*(\d[\d.]*)\s*(k|m)?\s*tokens?(?: of)? context/i) ?? numberIn(s, /context(?: window)?(?: of)?(?: at least)?\s*(\d[\d.]*)\s*(k|m)/i);
  const ses = s.match(/(\d+)\s+(?:conversations|sessions|users|documents)\s+of\s+(\d[\d.]*)\s*(k|m)\b/i);
  const bud = s.match(/(\d+)\s*(?:x|×)\s*(\d+)\s*(?:GiB|GB)/i) ?? s.match(/(\d[\d.]*)\s*(?:GiB|GB)/i);
  const budget = bud ? (bud.length > 2 && bud[2] ? +bud[1] * +bud[2] : +bud[1]) : null;
  const vision = /image|vision|photo|scan|diagram|screenshot/i.test(s);
  const head = s.match(/(\d+)\s*%\s*headroom/i);
  const brief: BriefSpec = {
    commercial: commercial ?? true, minContext: ctx ?? 0, sessions: ses ? +ses[1] : 1,
    contextTokens: ses ? Math.round(+ses[2] * (/m/i.test(ses[3]) ? MIB : 1024)) : ctx ?? 32768, budgetGiB: budget ?? 0, vision, headroomPct: head ? +head[1] : 10,
  };
  return {brief, found: {licence: commercial === null ? null : L(commercial ? 'needCommercial' : 'anyLicence'), context: ctx === null ? null : tokens(ctx), load: ses ? `${ses[1]} × ${tokens(brief.contextTokens)}` : null, budget: budget === null ? null : gib(budget), input: L(vision ? 'needVision' : 'textOnly')}};
}
function memoFor(m: Model, b: BriefSpec) {
  const need = memoryOf(m, b) ?? 0, inst = instanceFor(need);
  return L('memo', {name: m.name, licence: m.license.rule?.name ?? m.license.key, status: L(`commercial_${m.license.rule?.commercial ?? 'unverified'}`), context: tokens(m.context ?? 0), need: gib(need), inst: instText(inst), headroom: b.headroomPct});
}
export function chaining(models: Model[], text: string): AgentRun {
  useModels(models);
  const meter = new Meter(), steps: Step[] = [], {brief: b, found} = parseBrief(text);
  meter.llm(`${L('sysExtract')}\n${text}`, JSON.stringify(found));
  steps.push({kind: 'table', title: L('s_extract'), head: [L('colField'), L('colValue')], rows: Object.entries(found).map(([k, v]) => [L(`field_${k}`), v ?? L('notFound')]), note: L('extractNote')});
  const missing = ['licence', 'context', 'budget'].filter(k => !found[k]);
  if (missing.length) { steps.push({kind: 'text', title: L('s_gate1'), text: L('gateMissing', {fields: missing.map(k => L(`field_${k}`)).join(', ')}), tone: 'warn'}, metricsStep(meter.m)); return {steps, metrics: meter.m, pick: null, verdict: null}; }
  steps.push({kind: 'text', title: L('s_gate1'), text: L('gatePass'), tone: 'ok'});
  meter.llm(`${L('sysShortlist')}\n${briefLine(b)}`, '');
  const r = runTool('filter_models', {commercial: b.commercial, minContext: b.minContext, vision: b.vision}), list = r.data as Model[]; meter.tools(1);
  steps.push({kind: 'text', title: L('s_shortlist'), text: r.text});
  if (!list.length) { steps.push({kind: 'text', title: L('s_gate2'), text: L('gateEmpty'), tone: 'warn'}); return done(steps, meter, null, b); }
  let pick: Model | null = null, checked = 0;
  for (const m of list) { checked++; const x = memoryOf(m, b); if (x !== null && x <= b.budgetGiB) { pick = m; break; } }
  meter.tools(checked); meter.llm(`${L('sysSizer')}\n${briefLine(b)}`, pick?.name ?? '');
  steps.push({kind: 'text', title: L('s_size'), text: pick ? L('sizedPick', {n: checked, name: pick.name}) : L('sizedNone', {n: checked}), tone: pick ? undefined : 'warn'});
  if (!pick) return done(steps, meter, null, b);
  const memo = memoFor(pick, b); meter.llm(`${L('sysMemo')}\n${pick.name}`, memo);
  steps.push({kind: 'code', title: L('s_memo'), text: memo});
  // Gate 3: every number in the memo must come from a tool result.
  const evidence = [gib(memoryOf(pick, b) ?? 0), instText(instanceFor(memoryOf(pick, b) ?? 0)), tokens(pick.context ?? 0), String(b.headroomPct), pick.license.rule?.name ?? pick.license.key].join(' ');
  const nums = (memo.match(/\d[\d,.]*/g) ?? []).filter(n => !evidence.includes(n) && !pick!.name.includes(n));
  steps.push({kind: 'text', title: L('s_gate3'), text: nums.length ? L('gateNumbersFail', {nums: nums.join(', ')}) : L('gateNumbersPass'), tone: nums.length ? 'warn' : 'ok'});
  return done(steps, meter, pick, b);
}

// ---------- 11. Routing ----------
function routeVectors() {
  const docs = agents.routes.map(r => r.examples.map(terms));
  const df = new Map<string, number>(), N = docs.flat().length;
  docs.flat().forEach(d => new Set(d).forEach(w => df.set(w, (df.get(w) ?? 0) + 1)));
  const vocab = [...df.keys()], index = new Map(vocab.map((w, i) => [w, i]));
  const vec = (ws: string[]) => { const v = new Float64Array(vocab.length); ws.forEach(w => { const i = index.get(w); if (i !== undefined) v[i] += Math.log((N + 1) / ((df.get(w) ?? 0) + 1)) + 1; }); return normalize(v); };
  return {vec, centroids: docs.map(list => normalize(list.map(vec).reduce((a, v) => a.map((x, i) => x + v[i]), new Float64Array(vocab.length))))};
}
export function routing(models: Model[], request: string, o: {threshold: number}): AgentRun {
  useModels(models);
  const meter = new Meter(), {vec, centroids} = routeVectors(), q = vec(terms(request));
  const sims = agents.routes.map((r, i) => ({r, s: dot(q, centroids[i])})).sort((a, b) => b.s - a.s);
  const top = sims[0], margin = top.s - (sims[1]?.s ?? 0), confident = top.s >= o.threshold;
  meter.llm(`${L('sysRouter')}\n${request}`, top.r.id);
  const steps: Step[] = [
    {kind: 'bars', title: L('s_routeScores'), rows: sims.map(x => ({label: x.r.name, value: +x.s.toFixed(3)}))},
    {kind: 'text', title: L('s_route'), text: confident ? L('routeTo', {route: top.r.name, s: top.s.toFixed(2), margin: margin.toFixed(2)}) : L('routeHuman', {s: top.s.toFixed(2), threshold: o.threshold.toFixed(2)}), tone: confident ? 'ok' : 'warn'},
  ];
  if (confident && top.r.tool) {
    const m = findModel(request), args: Record<string, unknown> = top.r.tool === 'search_docs' ? {query: request} : top.r.tool === 'memory_estimate' ? {id: m?.id ?? '', contextTokens: Math.round(numberIn(request, /(\d[\d,.]*)\s*(k|m)?\s*(?:tokens|context)/i) ?? 32768), sessions: 1, headroomPct: 10} : {id: m?.id ?? ''};
    const r = runTool(top.r.tool, args); meter.tools(1); meter.llm(`${L('sysSpecialist', {route: top.r.name})}\n${request}\n${r.text}`, '');
    steps.push({kind: 'code', title: L('s_specialist', {route: top.r.name}), text: `${call(top.r.tool, args)}\n→ ${r.text}`});
  } else if (confident) steps.push({kind: 'text', title: L('s_specialist', {route: top.r.name}), text: L('routeNoTool')});
  steps.push(metricsStep(meter.m));
  return {steps, metrics: meter.m, pick: null, verdict: null};
}

// ---------- 12. Parallelization ----------
export function sectioning(models: Model[], b: BriefSpec, id: string, llm = 1200): AgentRun {
  useModels(models);
  const meter = new Meter(), m = byId(id) ?? solve(b).best ?? ranked(all)[0];
  const sections = [
    {name: L('sec_licence'), tool: 'check_licence', args: {id: m.id}},
    {name: L('sec_capability'), tool: 'get_model', args: {id: m.id}},
    {name: L('sec_memory'), tool: 'memory_estimate', args: memArgs(m, b)},
    {name: L('sec_evidence'), tool: 'search_docs', args: {query: `${m.architecture.class ?? ''} ${m.architecture.attention ?? ''} cache memory`}},
  ];
  meter.llm(`${L('sysPlanner')}\n${m.name}`, ''); sections.forEach(() => meter.llm(L('sysWorker'), '', true)); meter.m.llmRounds++; meter.tools(sections.length, true);
  const results = sections.map(x => ({...x, r: runTool(x.tool, x.args)}));
  meter.llm(`${L('sysAggregator')}\n${results.map(x => x.r.text).join('\n')}`, '');
  const f = failures(m, b);
  let t0 = llm;
  const par: GanttRow[] = [{label: L('g_planner'), start: 0, end: llm, tone: 7}, ...results.map(x => ({label: `${x.name} · ${x.tool}`, start: llm, end: llm + llm + toolMs(x.tool), tone: 1})), {label: L('g_aggregate'), start: llm + llm + Math.max(...results.map(x => toolMs(x.tool))), end: 2 * llm + llm + Math.max(...results.map(x => toolMs(x.tool))), tone: 7}];
  const seqTotal = llm + results.reduce((s, x) => s + llm + toolMs(x.tool), 0) + llm;
  t0 = par[par.length - 1].end;
  const steps: Step[] = [
    {kind: 'table', title: L('s_sections', {name: m.name}), head: [L('colSection'), L('colTool'), L('colResult')], rows: results.map(x => [x.name, x.tool, cut(x.r.text, 160)])},
    {kind: 'gantt', title: L('s_parallelRun', {par: t0.toLocaleString('en-US'), seq: seqTotal.toLocaleString('en-US')}), rows: par, total: seqTotal, unit: 'ms', note: L('ganttNoteFixed', {ms: llm})},
    {kind: 'text', title: L('s_aggregate'), text: f.length ? f.map(x => failText(m, b, x)).join(' ') : L('aggregatePass', {name: m.name}), tone: f.length ? 'warn' : 'ok'},
    metricsStep(meter.m),
  ];
  return {steps, metrics: meter.m, pick: m, verdict: null, latencyMs: t0};
}
/** Voting simulated with independent and correlated voters over the catalog's licence facts. */
export function voting(models: Model[], o: {voters: number; error: number; correlation: number; seed: number}): AgentRun {
  useModels(models);
  const rand = rng(o.seed), truth = all.map(licenceOk), reps = 30;
  const accuracy = (n: number, rho: number) => {
    let right = 0, total = 0;
    for (let r = 0; r < reps; r++) for (const fact of truth) {
      const sharedWrong = rand() < o.error;
      let yes = 0;
      for (let v = 0; v < n; v++) { const wrong = rand() < rho ? sharedWrong : rand() < o.error; if ((wrong ? !fact : fact)) yes++; }
      if ((yes * 2 > n) === fact) right++; total++;
    }
    return right / total;
  };
  const ns = [1, 3, 5, 7, 9, 11, 15];
  const series: Series[] = [
    {id: 'ind', label: L('votersIndependent'), tone: 1, points: ns.map(n => [n, +accuracy(n, 0).toFixed(4)] as [number, number])},
    {id: 'cor', label: L('votersCorrelated', {rho: Math.round(o.correlation * 100)}), tone: 2, points: ns.map(n => [n, +accuracy(n, o.correlation).toFixed(4)] as [number, number])},
  ];
  const at = (s: Series) => s.points.find(p => p[0] === o.voters)?.[1] ?? accuracy(o.voters, s.id === 'ind' ? 0 : o.correlation);
  const meter = new Meter(); for (let v = 0; v < o.voters; v++) meter.llm(L('sysVoter'), '', true); meter.m.llmRounds = 1;
  const steps: Step[] = [
    {kind: 'text', title: L('s_voteTask'), text: L('voteTask', {n: all.length, yes: truth.filter(Boolean).length})},
    {kind: 'chart', title: L('s_voteCurve'), series, xMax: 15, yMax: 1, xLabel: L('axisVoters'), yLabel: L('axisAccuracy')},
    {kind: 'tiles', title: L('s_voteResult', {n: o.voters}), items: [{label: L('t_single'), value: `${((1 - o.error) * 100).toFixed(1)}%`}, {label: L('votersIndependent'), value: `${(at(series[0]) * 100).toFixed(1)}%`}, {label: L('votersCorrelated', {rho: Math.round(o.correlation * 100)}), value: `${(at(series[1]) * 100).toFixed(1)}%`}]},
    {kind: 'text', title: L('s_voteReading'), text: L('voteReading')},
    metricsStep(meter.m),
  ];
  return {steps, metrics: meter.m, pick: null, verdict: null};
}

// ---------- 13. Evaluator-optimizer ----------
export function evaluatorOptimizer(models: Model[], b: BriefSpec, o: {rounds: number; maxWords: number}): AgentRun {
  useModels(models);
  const meter = new Meter(), m = solve(b).best;
  if (!m) return done([{kind: 'text', title: L('s_answer'), text: L('answerNone'), tone: 'warn'}], meter, null, b);
  const rule = m.license.rule, need = memoryOf(m, b) ?? 0, inst = instanceFor(need);
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const checks: Record<string, (memo: string) => boolean> = {
    licence: memo => memo.includes(rule?.name ?? m.license.key) && memo.includes(L(`commercial_${rule?.commercial ?? 'unverified'}`)),
    obligations: memo => !rule?.obligations.length || rule.obligations.slice(0, 3).every(x => memo.includes(cut(x, 60))),
    memory: memo => memo.includes(gib(need)),
    instance: memo => !!inst && memo.includes(inst.inst.name),
    headroom: memo => memo.includes(`${b.headroomPct}%`),
    source: memo => memo.includes(m.galleryUrl),
    length: memo => words(memo) <= o.maxWords,
  };
  const fixes: Record<string, () => string> = {
    licence: () => L('fix_licence', {licence: rule?.name ?? m.license.key, status: L(`commercial_${rule?.commercial ?? 'unverified'}`)}),
    obligations: () => L('fix_obligations', {list: (rule?.obligations ?? []).map(x => cut(x, 60)).join('; ')}),
    memory: () => L('fix_memory', {need: gib(need), sessions: b.sessions, tokens: tokens(b.contextTokens)}),
    instance: () => L('fix_instance', {inst: instText(inst)}),
    headroom: () => L('fix_headroom', {headroom: b.headroomPct}),
    source: () => L('fix_source', {url: m.galleryUrl}),
  };
  const ids = agents.rubric.map(r => r.id).filter(id => checks[id]);
  let parts: Record<string, string> = {head: L('memoHead', {name: m.name})}, memo = '', final = '';
  const table: (string | number)[][] = ids.map(id => [agents.rubric.find(r => r.id === id)!.text]);
  meter.llm(`${L('sysWriter')}\n${briefLine(b)}`, parts.head);
  for (let r = 1; r <= o.rounds; r++) {
    memo = Object.values(parts).join(' ');
    const failed = ids.filter(id => !checks[id](memo));
    meter.llm(`${L('sysEvaluator')}\n${agents.rubric.map(x => x.text).join('\n')}\n${memo}`, failed.join(','));
    ids.forEach((id, i) => table[i].push(failed.includes(id) ? '✗' : '✓'));
    if (!failed.length) { final = memo; break; }
    meter.llm(`${L('sysWriter')}\n${memo}\n${failed.join(', ')}`, '');
    for (const id of failed) {
      if (id === 'length') { if (parts.obligations) parts.obligations = L('fix_obligations', {list: (rule?.obligations ?? []).slice(0, 3).map(x => cut(x, 60)).join('; ') + ((rule?.obligations.length ?? 0) > 3 ? L('moreObligations', {n: (rule?.obligations.length ?? 0) - 3}) : '')}); }
      else parts[id] = fixes[id]();
    }
  }
  const steps: Step[] = [
    {kind: 'table', title: L('s_rubric'), head: [L('colCriterion'), ...table[0].slice(1).map((_, i) => L('colRoundN', {n: i + 1}))], rows: table, note: L('rubricNote')},
    {kind: 'code', title: L(final ? 's_finalMemo' : 's_lastMemo'), text: final || memo},
  ];
  if (!final) steps.push({kind: 'text', title: L('s_rounds'), text: L('roundsHit', {n: o.rounds}), tone: 'warn'});
  meter.tools(3);
  return done(steps, meter, m, b);
}

// ---------- 14. Supervisor and workers ----------
export function supervisor(models: Model[], b: BriefSpec): AgentRun {
  useModels(models);
  const meter = new Meter(), rows: (string | number)[][] = [];
  const workers = ['catalog', 'licence', 'infrastructure', ...(b.vision ? ['modality'] : []), 'research'];
  meter.llm(`${L('sysSupervisor')}\n${briefLine(b)}`, workers.join(', '));
  const cat = runTool('filter_models', {commercial: b.commercial, minContext: 0, vision: false}); meter.tools(1); meter.llm(L('sysWorker'), '');
  let pool = cat.data as Model[];
  rows.push([L('w_catalog'), L('task_catalog'), 'filter_models', cat.text]);
  pool = pool.filter(m => (m.context ?? 0) >= b.minContext);
  const short = pool.slice(0, 6);
  meter.tools(short.length); meter.llm(L('sysWorker'), '');
  const lic = short.map(m => m.license.rule?.obligations.length ?? 0);
  rows.push([L('w_licence'), L('task_licence', {n: short.length}), 'check_licence', short.map((m, i) => `${m.name}: ${L('obligationsN', {n: lic[i]})}`).join(' · ')]);
  // The infrastructure worker sizes every candidate, so the answer does not depend on how many the licence worker reviewed.
  meter.tools(pool.length); meter.llm(L('sysWorker'), '');
  const sized = pool.map(m => ({m, need: memoryOf(m, b)}));
  let fit = sized.filter(x => x.need !== null && x.need <= b.budgetGiB).map(x => x.m);
  rows.push([L('w_infrastructure'), L('task_infrastructure', {n: pool.length}), 'memory_estimate', L('sizedResult', {fit: fit.length, of: pool.length, top: fit.length ? names(fit) : '—'})]);
  if (b.vision) { meter.tools(fit.length); meter.llm(L('sysWorker'), ''); const before = fit.length; fit = fit.filter(m => m.official?.vision); rows.push([L('w_modality'), L('task_modality'), 'get_model', L('modalityResult', {kept: fit.length, of: before})]); }
  const pick = fit[0] ?? null;
  if (pick) { const r = runTool('search_docs', {query: `${pick.architecture.class ?? ''} ${pick.architecture.attention ?? ''}`}); meter.tools(1); meter.llm(L('sysWorker'), ''); rows.push([L('w_research'), L('task_research', {name: pick.name}), 'search_docs', r.text]); }
  meter.llm(`${L('sysSupervisor')}\n${rows.map(r => r.join(' ')).join('\n')}`, '');
  const steps: Step[] = [
    {kind: 'chips', title: L('s_delegation'), items: workers.map(w => L(`w_${w}`))},
    {kind: 'table', title: L('s_workers'), head: [L('colWorker'), L('colTask'), L('colTool'), L('colResult')], rows: rows.map(r => r.map(x => cut(String(x), 200))), note: L('ruleWritten')},
    {kind: 'text', title: L('s_synthesis'), text: pick ? memoFor(pick, b) : L('supervisorNone', {n: short.length}), tone: pick ? undefined : 'warn'},
  ];
  return done(steps, meter, pick, b);
}

// ---------- 15. Multi-agent collaboration (debate) ----------
export function debate(models: Model[], b: BriefSpec, o: {rounds: number; tolerance: number}): AgentRun {
  useModels(models);
  const meter = new Meter(), pool = solve(b).ok.slice(0, 12), steps: Step[] = [];
  if (!pool.length) { steps.push({kind: 'text', title: L('s_debate'), text: L('answerNone'), tone: 'warn'}); return done(steps, meter, null, b); }
  const obligations = (m: Model) => (m.license.rule?.obligations.length ?? 0) + (m.license.rule?.restrictions?.length ?? 0);
  const agentsList = [
    {id: 'cost', order: [...pool].sort((x, y) => (memoryOf(x, b) ?? 0) - (memoryOf(y, b) ?? 0))},
    {id: 'capability', order: ranked(pool)},
    {id: 'risk', order: [...pool].sort((x, y) => obligations(x) - obligations(y) || rankCmp(x, y))},
  ];
  const pos = (a: typeof agentsList[number], m: Model) => a.order.indexOf(m) / Math.max(1, pool.length - 1);
  let proposals = agentsList.map(a => a.order[0]);
  const rows: (string | number)[][] = agentsList.map((a, i) => [1, L(`agent_${a.id}`), proposals[i].name, L(`why_${a.id}`, {mem: gib(memoryOf(proposals[i], b) ?? 0), n: obligations(proposals[i])})]);
  agentsList.forEach(() => meter.llm(L('sysDebater'), '', true)); meter.m.llmRounds++;
  let round = 1;
  while (new Set(proposals.map(p => p.id)).size > 1 && round < o.rounds) {
    round++;
    const avg = (m: Model) => agentsList.reduce((s, a) => s + pos(a, m), 0) / agentsList.length;
    const shared = [...new Set(proposals)].sort((x, y) => avg(x) - avg(y))[0];
    proposals = agentsList.map((a, i) => {
      const accept = pos(a, shared) <= o.tolerance;
      rows.push([round, L(`agent_${a.id}`), accept ? shared.name : proposals[i].name, accept ? (shared.id === proposals[i].id ? L('keeps') : L('accepts', {name: shared.name, pct: Math.round(pos(a, shared) * 100)})) : L('rejects', {name: shared.name, pct: Math.round(pos(a, shared) * 100), tol: Math.round(o.tolerance * 100)})]);
      return accept ? shared : proposals[i];
    });
    agentsList.forEach(() => meter.llm(`${L('sysDebater')}\n${rows.map(r => r.join(' ')).join('\n')}`, '', true)); meter.m.llmRounds++;
  }
  const agreed = new Set(proposals.map(p => p.id)).size === 1;
  const borda = (m: Model) => agentsList.reduce((s, a) => s + (pool.length - a.order.indexOf(m)), 0);
  const pick = agreed ? proposals[0] : [...pool].sort((x, y) => borda(y) - borda(x))[0];
  steps.push({kind: 'table', title: L('s_debate'), head: [L('colRound'), L('colAgent'), L('colProposes'), L('colReason')], rows, note: L('ruleWritten')});
  steps.push({kind: 'text', title: L('s_consensus'), text: agreed ? L('consensus', {name: pick.name, n: round}) : L('noConsensus', {name: pick.name, n: round}), tone: agreed ? 'ok' : 'warn'});
  return done(steps, meter, pick, b);
}

// ---------- 16. Human approval gates ----------
export function approval(models: Model[], b: BriefSpec, o: {decisions: Record<string, 'approve' | 'reject'>; autoApprove: boolean}): AgentRun {
  useModels(models);
  const meter = new Meter(), audit: (string | number)[][] = [], best = solve(b).best, need = best ? memoryOf(best, b) ?? 0 : 0, inst = best ? instanceFor(need) : null;
  const actions = [
    {id: 'a1', tool: 'filter_models', args: {commercial: b.commercial, minContext: b.minContext, vision: b.vision}},
    ...(best ? [{id: 'a2', tool: 'memory_estimate', args: memArgs(best, b)}, {id: 'a3', tool: 'smallest_instance', args: {totalGiB: +need.toFixed(2)}},
      {id: 'a4', tool: 'save_shortlist', args: {ids: [best.id], note: briefLine(b)}}, ...(inst ? [{id: 'a5', tool: 'request_gpu_quota', args: {instance: inst.inst.name, count: inst.count}}] : [])] : []),
  ];
  meter.llm(`${L('sysAgent')}\n${briefLine(b)}`, actions.map(a => a.tool).join(', '));
  let pending: AgentRun['pending'];
  for (const [i, a] of actions.entries()) {
    const effect = spec(a.tool)?.effect ?? 'read', gated = effect !== 'read';
    const decision = !gated ? null : o.autoApprove ? 'approve' : o.decisions[a.id];
    if (gated && !decision) { pending = {id: a.id, text: L('pendingText', {action: call(a.tool, a.args), effect: L(`effect_${effect}`)})}; audit.push([i + 1, call(a.tool, a.args), L(`effect_${effect}`), L('byHuman'), L('waiting')]); break; }
    if (decision === 'reject') { audit.push([i + 1, call(a.tool, a.args), L(`effect_${effect}`), L('byHuman'), L('rejected')]); continue; }
    const r = runTool(a.tool, a.args); meter.tools(1);
    audit.push([i + 1, cut(call(a.tool, a.args), 120), L(`effect_${effect}`), gated ? (o.autoApprove ? L('byPolicy') : L('byHuman')) : L('byPolicyRead'), cut(r.text, 140)]);
  }
  const steps: Step[] = [
    {kind: 'table', title: L('s_policy'), head: [L('colEffect'), L('colRule')], rows: (['read', 'write', 'external'] as const).map(e => [L(`effect_${e}`), L(`policy_${e}`)])},
    {kind: 'table', title: L('s_audit'), head: [L('colStep'), L('colAction'), L('colEffect'), L('colDecidedBy'), L('colOutcome')], rows: audit},
  ];
  if (o.autoApprove) steps.push({kind: 'text', title: L('s_noGate'), text: L('noGate'), tone: 'warn'});
  if (pending) { steps.push(metricsStep(meter.m)); return {steps, metrics: meter.m, pick: null, verdict: null, pending}; }
  return done(steps, meter, best, b);
}

// ---------- 17. Guardrails ----------
export function guardrails(models: Model[], b: BriefSpec, o: {input: boolean; tools: boolean; output: boolean}): AgentRun {
  useModels(models);
  const meter = new Meter(), steps: Step[] = [], u = agents.untrusted;
  const docs = runTool('search_docs', {query: 'licence commercial use obligations'}); meter.tools(1);
  steps.push({kind: 'text', title: L('s_retrieved'), text: `${docs.text} · ${u.title} (${u.source})`});
  steps.push({kind: 'code', title: L('s_untrusted'), text: u.text});
  const flagged = agents.injectionPatterns.flatMap(p => { const m = u.text.match(new RegExp(p, 'i')); return m ? [m[0]] : []; });
  const injected = !(o.input && flagged.length);
  steps.push({kind: 'text', title: L('s_inputGuard'), text: !o.input ? L('guardOff') : flagged.length ? L('inputFlagged', {n: flagged.length, hits: flagged.map(x => `"${cut(x, 50)}"`).join(', ')}) : L('inputClean'), tone: !o.input ? 'warn' : 'ok'});
  // The agent's rule here deliberately obeys instructions it finds in context, as an unprotected model can.
  const target = findModel(u.text), email = u.text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? '';
  let pick = injected && target ? target : solve(b).best;
  meter.llm(`${L('sysAgent')}\n${briefLine(b)}\n${docs.text}\n${injected ? u.text : L('quarantined')}`, pick?.name ?? '');
  const attempted = injected ? [{tool: 'send_email', args: {to: email, body: pick?.name ?? ''}}] : [];
  const allowed = agents.tools.filter(x => x.effect === 'read' || x.name === 'save_shortlist').map(x => x.name);
  const toolRows = attempted.map(a => { const blocked = o.tools && !allowed.includes(a.tool); if (!blocked) meter.tools(1); return [call(a.tool, a.args), blocked ? L('blocked') : runTool(a.tool, a.args).text]; });
  steps.push({kind: 'table', title: L('s_toolGuard'), head: [L('colAction'), L('colOutcome')], rows: toolRows.length ? toolRows : [[L('noToolAttempt'), '—']], note: o.tools ? L('allowList', {list: allowed.join(', ')}) : L('guardOff')});
  let answer = pick ? memoFor(pick, b) : L('answerNone');
  const bad = pick ? failures(pick, b) : [];
  if (o.output && bad.length) {
    steps.push({kind: 'text', title: L('s_outputGuard'), text: L('outputBlocked', {name: pick!.name, why: bad.map(f => failText(pick!, b, f)).join(' ')}), tone: 'ok'});
    pick = solve(b).best; answer = pick ? memoFor(pick, b) : L('answerNone');
  } else steps.push({kind: 'text', title: L('s_outputGuard'), text: o.output ? L('outputPass') : L('guardOff'), tone: o.output ? 'ok' : 'warn'});
  steps.push({kind: 'code', title: L('s_answer'), text: answer});
  return done(steps, meter, pick, b);
}

// ---------- Cost profile: the brief-solving patterns side by side ----------
export interface ProfileRow {id: string; metrics: Metrics; verdict: Verdict | null; latencyMs: number; toolPathMs: number | null}
export function profile(models: Model[], b: BriefSpec, o: {llmMs: number; toolMs: number}): ProfileRow[] {
  const P: Precision[] = ['published', 'bit8'];
  const runs: [string, () => AgentRun][] = [
    ['react', () => react(models, b, {budget: 40})],
    ['plan', () => planExecute(models, b, {replan: false})],
    ['reflection', () => reflection(models, b, {rounds: 5})],
    ['reflexion', () => reflexion(models, b, {trials: 6, warmup: null})],
    ['rewoo', () => rewoo(models, b, {breadth: 5})],
    ['tot', () => tot(models, b, {beam: 3, width: 10, lambda: .5, precisions: P})],
    ['lats', () => lats(models, b, {iterations: 30, width: 10, lambda: .5, precisions: P, c: 1, seed: 1})],
    ['compiler', () => compiler(models, b, {n: 5, llmMs: o.llmMs})],
    ['chaining', () => chaining(models, briefText(b))],
    ['evaluator', () => evaluatorOptimizer(models, b, {rounds: 5, maxWords: 120})],
    ['supervisor', () => supervisor(models, b)],
    ['multiagent', () => debate(models, b, {rounds: 4, tolerance: .5})],
  ];
  return runs.map(([id, f]) => {
    const r = f();
    const latency = r.latencyMs ?? r.metrics.llmRounds * o.llmMs + r.metrics.toolRounds * o.toolMs;
    return {id, metrics: r.metrics, verdict: r.verdict, latencyMs: latency, toolPathMs: r.latencyMs === undefined ? null : r.latencyMs - 2 * o.llmMs};
  });
}
