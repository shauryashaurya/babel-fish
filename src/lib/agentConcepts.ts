/**
 * "How agents work": the concept explainer for the Agents page. Every text lives in
 * data/content/agent_concepts.json; this module holds the types and the arithmetic behind each demo.
 * Nothing here calls a language model. The loop demo runs the lab's real catalog tools.
 */
import {agents, type BriefSpec, type Link} from './agents';
import {runTool, solve} from './agentLab';
import type {MathItem} from './architecture';

export interface CodeSample {lang: string; title: string; text: string; note?: string}
export interface ConceptTable {columns: string[]; rows: string[][]}
export interface AppRow {name: string; what: string; patterns: string[]; benchmarks: Link[]; risk: string}
export interface Concept {
  id: string; group: string; name: string; short: string; plain: string;
  technical: string[]; matters: string;
  code: CodeSample[]; math: MathItem[];
  demo?: string; table?: ConceptTable; apps?: AppRow[];
  related?: {label: string; href: string}[];
  sources: Link[];
}
export interface FileNode {id: string; path: string; dir: string; name: string; scope: 'user' | 'project'; on: boolean}
export interface HookAction {id: string; tool: string; arg: string}
export interface HookControl {id: string; label: string; kind: 'advisory' | 'deny' | 'ask' | 'hook'; covers: string[]; on: boolean}
export interface Capability {id: string; label: string; legs: Leg[]; on: boolean}
export type Leg = 'private' | 'untrusted' | 'external';
export interface McpMessage {dir: 'out' | 'in' | 'host'; label: string; json: string; note: string}
export interface AgentConceptsContent {
  intro: string;
  groups: {id: string; name: string}[];
  topics: Concept[];
  loop: {system: string; finalTemplate: string; noFitTemplate: string};
  files: {nodes: FileNode[]; dirs: string[]};
  hooks: {actions: HookAction[]; controls: HookControl[]};
  trifecta: {capabilities: Capability[]};
  mcp: {messages: McpMessage[]};
}

export let concepts: AgentConceptsContent = {intro: '', groups: [], topics: [], loop: {system: '', finalTemplate: '', noFitTemplate: ''}, files: {nodes: [], dirs: []}, hooks: {actions: [], controls: []}, trifecta: {capabilities: []}, mcp: {messages: []}};
export const setConcepts = (c: AgentConceptsContent) => { concepts = c; };

/** Same token estimate as the lab: about four characters per token. */
export const tok = (s: string) => Math.ceil(s.length / 4);

// ---------- The loop, on the wire ----------
export interface WireMessage {role: 'system' | 'user' | 'assistant'; kind: 'system' | 'tools' | 'request' | 'tool_use' | 'tool_result' | 'text'; body: string; tokens: number}
export interface WireCall {messages: WireMessage[]; reply: WireMessage[]; input: number; output: number; stop: 'tool_use' | 'end_turn'}

/**
 * Builds the message list a harness would send for the brief, call by call, using the lab's tools.
 * The model's choices follow a stated rule: filter, then size candidates in rank order until one fits, then check its licence.
 */
export function loopTranscript(b: BriefSpec, request: string, maxSizing = 12): WireCall[] {
  const toolDefs = JSON.stringify(agents.tools.filter(x => x.effect === 'read').map(x => ({name: x.name, description: x.description, input_schema: x.schema})), null, 1);
  const history: WireMessage[] = [
    {role: 'system', kind: 'system', body: concepts.loop.system, tokens: tok(concepts.loop.system)},
    {role: 'system', kind: 'tools', body: toolDefs, tokens: tok(toolDefs)},
    {role: 'user', kind: 'request', body: request, tokens: tok(request)},
  ];
  const calls: WireCall[] = [];
  let id = 1;
  const call = (name: string, input: Record<string, unknown>) => {
    const use = JSON.stringify({type: 'tool_use', id: `toolu_${String(id).padStart(2, '0')}`, name, input});
    const out = runTool(name, input);
    const result = JSON.stringify({type: 'tool_result', tool_use_id: `toolu_${String(id).padStart(2, '0')}`, content: out.text, ...(out.ok ? {} : {is_error: true})});
    id++;
    const sent = history.reduce((s, m) => s + m.tokens, 0);
    const reply: WireMessage[] = [{role: 'assistant', kind: 'tool_use', body: use, tokens: tok(use)}, {role: 'user', kind: 'tool_result', body: result, tokens: tok(result)}];
    calls.push({messages: [...history], reply, input: sent, output: tok(use), stop: 'tool_use'});
    history.push(...reply);
    return out;
  };
  const found = call('filter_models', {commercial: b.commercial, minContext: b.minContext, ...(b.vision ? {vision: true} : {})});
  const list = (found.data as {id: string; name: string}[] | undefined) ?? [];
  let pick: {id: string; name: string} | null = null, total = 0;
  for (const m of list.slice(0, maxSizing)) {
    const est = call('memory_estimate', {id: m.id, contextTokens: b.contextTokens, sessions: b.sessions, headroomPct: b.headroomPct});
    if (est.ok && typeof est.data === 'number' && est.data <= b.budgetGiB) { pick = m; total = est.data; break; }
  }
  if (pick) call('check_licence', {id: pick.id});
  const answer = pick ? concepts.loop.finalTemplate.replace('{name}', pick.name).replace('{total}', total.toFixed(1)).replace('{budget}', String(b.budgetGiB))
    : concepts.loop.noFitTemplate.replace('{n}', String(Math.min(maxSizing, list.length))).replace('{budget}', String(b.budgetGiB));
  const sent = history.reduce((s, m) => s + m.tokens, 0);
  calls.push({messages: [...history], reply: [{role: 'assistant', kind: 'text', body: answer, tokens: tok(answer)}], input: sent, output: tok(answer), stop: 'end_turn'});
  return calls;
}
/** The catalog's own answer, to show the loop reached it. */
export const loopReference = (b: BriefSpec) => solve(b).best;

// ---------- Context budget ----------
export interface BudgetIn {window: number; system: number; tools: number; perTool: number; instructions: number; skills: number; perTurn: number; turns: number; compactAt: number; summary: number}
export function contextRun(p: BudgetIn) {
  const fixed = p.system + p.tools * p.perTool + p.instructions + p.skills * 100;
  const plain: [number, number][] = [], compacted: [number, number][] = [];
  let live = 0, compactions = 0, firstCompaction: number | null = null;
  for (let t = 1; t <= p.turns; t++) {
    plain.push([t, fixed + t * p.perTurn]);
    live += p.perTurn;
    if (fixed + live >= p.compactAt / 100 * p.window) { compactions++; firstCompaction ??= t; live = p.summary; }
    compacted.push([t, fixed + live]);
  }
  const overflow = plain.find(([, v]) => v > p.window)?.[0] ?? null;
  return {fixed, plain, compacted, compactions, firstCompaction, overflow};
}

// ---------- Cost of a loop ----------
export interface CostIn {prefix: number; perTurn: number; turns: number; read: number; write: number}
/** Cumulative input tokens without caching, and the cache-weighted equivalent, turn by turn. */
export function costRun(p: CostIn) {
  const plain: [number, number][] = [], cached: [number, number][] = [];
  let a = 0, c = 0;
  for (let t = 1; t <= p.turns; t++) {
    const input = p.prefix + t * p.perTurn;
    const fresh = t === 1 ? input : p.perTurn;
    a += input;
    c += p.write * fresh + p.read * (input - fresh);
    plain.push([t, a]); cached.push([t, c]);
  }
  const closed = p.turns * p.prefix + p.perTurn * p.turns * (p.turns + 1) / 2;
  return {plain, cached, total: a, totalCached: c, closed};
}

// ---------- Reliability ----------
export const chain = (p: number, n: number) => p ** n;
export const withRetry = (p: number, r: number) => 1 - (1 - p) ** (r + 1);
export const passAt = (p: number, k: number) => 1 - (1 - p) ** k;
export const passHat = (p: number, k: number) => p ** k;

// ---------- Skills ----------
export interface SkillsIn {installed: number; active: number; body: number; files: number; read: number}
export function skillsCost(p: SkillsIn) {
  const eager = p.installed * (100 + p.body + p.files);
  const lazy = p.installed * 100 + Math.min(p.active, p.installed) * (p.body + p.read);
  return {eager, lazy, metadata: p.installed * 100};
}

// ---------- Instruction files ----------
export type LoadWhen = 'launch' | 'demand' | 'skipped';
export interface LoadRow {node: FileNode; when: LoadWhen; reason: string; reasonValues?: Record<string, string>}
const within = (dir: string, cwd: string) => cwd === dir || cwd.startsWith(dir + '/');

/**
 * Which files each tool loads, following the documented rules (Claude Code memory docs; Codex AGENTS.md guide).
 * Claude Code uses its default "CLAUDE.md, or AGENTS.md when there is no CLAUDE.md" setting.
 */
export function resolveFiles(nodes: FileNode[], tool: 'claude' | 'codex', cwd: string, touched: string): LoadRow[] {
  const rows: LoadRow[] = [];
  const present = nodes.filter(n => n.on);
  const ancestors = (concepts.files.dirs).filter(d => within(d, cwd));
  if (tool === 'claude') {
    const user = present.find(n => n.path === '~/.claude/CLAUDE.md');
    if (user) rows.push({node: user, when: 'launch', reason: 'r_user'});
    const counting = present.filter(n => n.scope === 'project' && (n.name === 'CLAUDE.md' || n.name === 'CLAUDE.local.md') && ancestors.includes(n.dir));
    const agentsMode = counting.length === 0;
    for (const d of ancestors) for (const name of ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md']) {
      const n = present.find(x => x.dir === d && x.name === name);
      if (!n) continue;
      if (name === 'AGENTS.md') rows.push(agentsMode ? {node: n, when: 'launch', reason: 'r_agentsNoClaude'} : {node: n, when: 'skipped', reason: 'r_agentsShadowed'});
      else rows.push({node: n, when: 'launch', reason: name === 'CLAUDE.md' ? 'r_ancestor' : 'r_local'});
    }
    for (const n of present.filter(x => x.scope === 'project' && !ancestors.includes(x.dir))) {
      const opened = touched && within(n.dir, touched) && n.dir !== cwd;
      if (n.name === 'AGENTS.override.md') rows.push({node: n, when: 'skipped', reason: 'r_overrideClaude'});
      else if (n.name === 'AGENTS.md') {
        const hasClaude = present.some(x => x.dir === n.dir && x.name.startsWith('CLAUDE'));
        rows.push(agentsMode && !hasClaude && opened ? {node: n, when: 'demand', reason: 'r_demandAgents'} : {node: n, when: 'skipped', reason: agentsMode ? (hasClaude ? 'r_subClaudeWins' : 'r_notOpened') : 'r_agentsShadowed'});
      } else rows.push(opened ? {node: n, when: 'demand', reason: 'r_demand'} : {node: n, when: 'skipped', reason: 'r_notOpened'});
    }
    for (const n of present.filter(x => x.scope === 'project' && ancestors.includes(x.dir) && x.name === 'AGENTS.override.md')) rows.push({node: n, when: 'skipped', reason: 'r_overrideClaude'});
    for (const n of present.filter(x => x.path.startsWith('~/.codex'))) rows.push({node: n, when: 'skipped', reason: 'r_otherTool'});
  } else {
    const global = present.find(n => n.path === '~/.codex/AGENTS.md');
    if (global) rows.push({node: global, when: 'launch', reason: 'r_codexGlobal'});
    for (const d of ancestors) {
      const override = present.find(x => x.dir === d && x.name === 'AGENTS.override.md'), plain = present.find(x => x.dir === d && x.name === 'AGENTS.md');
      if (override) rows.push({node: override, when: 'launch', reason: 'r_codexOverride'});
      if (plain) rows.push(override ? {node: plain, when: 'skipped', reason: 'r_codexOneFile'} : {node: plain, when: 'launch', reason: 'r_codexDir'});
    }
    for (const n of present.filter(x => x.scope === 'project' && !ancestors.includes(x.dir) && x.name.startsWith('AGENTS'))) rows.push({node: n, when: 'skipped', reason: 'r_codexBelow'});
    for (const n of present.filter(x => x.name.startsWith('CLAUDE') || x.path.startsWith('~/.claude'))) rows.push({node: n, when: 'skipped', reason: 'r_otherTool'});
  }
  return rows;
}

// ---------- Hooks and permissions ----------
export type HookOutcome = 'blocked' | 'ask' | 'advisoryOnly' | 'runs';
export function decide(action: HookAction, controls: HookControl[]) {
  const on = controls.filter(c => c.on && c.covers.includes(action.id));
  const blockers = on.filter(c => c.kind === 'deny' || c.kind === 'hook');
  const outcome: HookOutcome = blockers.length ? 'blocked' : on.some(c => c.kind === 'ask') ? 'ask' : on.some(c => c.kind === 'advisory') ? 'advisoryOnly' : 'runs';
  return {outcome, by: blockers.length ? blockers : on};
}

// ---------- Lethal trifecta ----------
export const LEGS: Leg[] = ['private', 'untrusted', 'external'];
export function trifecta(caps: Capability[], gated: boolean) {
  const on = caps.filter(c => c.on);
  const legs = Object.fromEntries(LEGS.map(l => [l, on.filter(c => c.legs.includes(l))])) as Record<Leg, Capability[]>;
  const present = LEGS.filter(l => legs[l].length);
  const all = present.length === 3;
  /** Capabilities whose removal alone breaks the trifecta: the only provider of some leg. */
  const breakers = all ? on.filter(c => c.legs.some(l => legs[l].length === 1)) : [];
  return {legs, present, all, gated: all && gated, breakers};
}
