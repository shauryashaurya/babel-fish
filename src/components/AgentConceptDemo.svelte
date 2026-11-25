<script lang="ts">
 /** Interactive demos for "How agents work". Each one is plain arithmetic or the lab's real catalog tools; no model runs. */
 import BarChart, {type BarRow} from './BarChart.svelte';
 import CodeBlock from './CodeBlock.svelte';
 import MiniChart, {type ChartSeries} from './MiniChart.svelte';
 import {agents} from '../lib/agents';
 import {useModels} from '../lib/agentLab';
 import {chain, concepts, contextRun, costRun, decide, LEGS, loopReference, loopTranscript, passAt, passHat, resolveFiles, skillsCost, trifecta, withRetry, type Capability, type FileNode, type HookControl} from '../lib/agentConcepts';
 import {t} from '../lib/content';
 import type {Model} from '../lib/types';
 export let demo: string;
 export let models: Model[];
 export let topic = '';
 const T = (k: string, v: Record<string, string | number> = {}) => t(`agentsExplained.${k}`, v);
 useModels(models);

 const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
 const tk = (v: number) => v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}K` : String(Math.round(v));
 const pc = (v: number) => v > 0.999 && v < 1 ? '>99.9%' : `${(100 * v).toFixed(v >= 0.995 || v < 0.1 ? 1 : 0)}%`;

 // ---------- Loop ----------
 let briefId = agents.briefs[0]?.id ?? '', step = 0;
 $: preset = agents.briefs.find(b => b.id === briefId) ?? agents.briefs[0];
 $: calls = preset ? loopTranscript(preset.brief, preset.text) : [];
 $: at = Math.min(step, Math.max(0, calls.length - 1));
 $: call = calls[at];
 $: carried = at > 0 ? calls[at - 1].messages.length : 0;
 $: reference = preset ? loopReference(preset.brief) : null;
 $: reached = call?.stop === 'end_turn' ? call.reply[0]?.body.includes(reference?.name ?? '\u0000') : null;
 $: loopRows = calls.map((c, i): BarRow => ({id: String(i), label: T('callN', {n: i + 1}), tone: 1, value: tk(c.input), segments: [
  {value: i ? calls[i - 1].input : 0, style: 'solid', label: T('carried'), text: tk(i ? calls[i - 1].input : 0)},
  {value: c.input - (i ? calls[i - 1].input : 0), style: 'light', label: T('added'), text: tk(c.input - (i ? calls[i - 1].input : 0))}]}));
 $: loopTotal = calls.reduce((s, c) => s + c.input, 0);
 const preview = (s: string) => s.length > 320 ? `${s.slice(0, 320)}…` : s;
 function pickBrief(e: Event) { briefId = (e.currentTarget as HTMLSelectElement).value; step = 0; }

 // ---------- Context budget ----------
 let win = 200000, sys = 3000, nTools = 12, perTool = 300, instr = 2500, nSkills = 10, perTurn = 4000, turns = 80, compactAt = 80, summary = 3000;
 $: budget = contextRun({window: win, system: sys, tools: nTools, perTool, instructions: instr, skills: nSkills, perTurn, turns, compactAt, summary});
 $: bTop = Math.max(win * 1.12, ...budget.compacted.map(p => p[1]));
 $: budgetSeries = [
  {id: 'plain', label: T('noCompaction'), tone: 8, dashed: true, points: budget.plain.filter(p => p[1] <= win), endLabel: T('noCompaction')},
  {id: 'compact', label: T('withCompaction'), tone: 1, points: budget.compacted, endLabel: T('withCompaction')},
 ] as ChartSeries[];
 $: lastLive = budget.compacted[budget.compacted.length - 1]?.[1] ?? 0;
 $: stack = [
  {id: 'system', v: sys, tone: 1}, {id: 'tools', v: nTools * perTool, tone: 2}, {id: 'instructions', v: instr, tone: 3},
  {id: 'skills', v: nSkills * 100, tone: 7}, {id: 'history', v: Math.max(0, lastLive - budget.fixed), tone: 8},
 ];

 // ---------- Cost ----------
 let prefix = 8000, cTurn = 2500, cTurns = 30, readMul = 0.1;
 $: cost = costRun({prefix, perTurn: cTurn, turns: cTurns, read: readMul, write: 1.25});
 $: costSeries = [
  {id: 'plain', label: T('noCache'), tone: 2, points: cost.plain, endLabel: tk(cost.total)},
  {id: 'cached', label: T('withCache'), tone: 1, points: cost.cached, endLabel: tk(cost.totalCached)},
 ] as ChartSeries[];

 // ---------- Reliability ----------
 let p = 0.95, steps = 10, retries = 0, k = 8;
 $: pr = withRetry(p, retries);
 $: relSeries = [
  {id: 'p', label: T('noRetry'), tone: 2, points: Array.from({length: 50}, (_, i) => [i + 1, chain(p, i + 1)] as [number, number]), endLabel: T('noRetry')},
  ...(retries ? [{id: 'r', label: T('withRetries', {r: retries}), tone: 1, points: Array.from({length: 50}, (_, i) => [i + 1, chain(pr, i + 1)] as [number, number]), endLabel: T('withRetries', {r: retries})}] : []),
 ] as ChartSeries[];
 $: passSeries = [
  {id: 'at', label: T('passAt', {k: 'k'}), tone: 3, points: Array.from({length: 16}, (_, i) => [i + 1, passAt(p, i + 1)] as [number, number]), endLabel: T('passAt', {k: 'k'})},
  {id: 'hat', label: T('passHat', {k: 'k'}), tone: 7, points: Array.from({length: 16}, (_, i) => [i + 1, passHat(p, i + 1)] as [number, number]), endLabel: T('passHat', {k: 'k'})},
 ] as ChartSeries[];

 // ---------- MCP ----------
 let mcpStep = 0, hosts = 5, servers = 20;
 $: mcpMsg = concepts.mcp.messages[mcpStep];

 // ---------- Files ----------
 let fileTool: 'claude' | 'codex' = topic === 'agentsmd' ? 'codex' : 'claude', cwd = concepts.files.dirs[0] ?? '', touched = '';
 let nodes: FileNode[] = concepts.files.nodes.map(n => ({...n}));
 $: fileRows = resolveFiles(nodes, fileTool, cwd, touched);
 $: loaded = fileRows.filter(r => r.when !== 'skipped');
 $: skipped = fileRows.filter(r => r.when === 'skipped');
 $: subDirs = concepts.files.dirs.filter(d => d !== cwd && d.startsWith(cwd + '/'));
 $: if (touched && !subDirs.includes(touched)) touched = '';

 // ---------- Skills ----------
 let installed = 40, active = 1, body = 3000, files = 15000, read = 2000;
 $: sk = skillsCost({installed, active, body, files, read});
 $: skillRows = [
  {id: 'eager', label: T('skEager'), tone: 2, value: tk(sk.eager), segments: [{value: sk.eager, style: 'solid', label: T('skEager'), text: tk(sk.eager)}]},
  {id: 'lazy', label: T('skLazy'), tone: 1, value: tk(sk.lazy), segments: [{value: sk.metadata, style: 'solid', label: T('skMeta'), text: tk(sk.metadata)}, {value: sk.lazy - sk.metadata, style: 'light', label: T('skActive'), text: tk(sk.lazy - sk.metadata)}]},
 ] as BarRow[];

 // ---------- Hooks ----------
 let controls: HookControl[] = concepts.hooks.controls.map(c => ({...c}));
 $: decisions = concepts.hooks.actions.map(a => ({a, ...decide(a, controls)}));

 // ---------- Trifecta ----------
 let caps: Capability[] = concepts.trifecta.capabilities.map(c => ({...c})), gated = false;
 $: tri = trifecta(caps, gated);
</script>

{#if demo === 'loop'}
 <h2>{T('loopTitle')}</h2>
 <p class="note flush">{T('loopIntro')}</p>
 <div class="net-controls">
  <label class="field"><span>{t('agentLab.brief')}</span><select value={briefId} on:change={pickBrief}>{#each agents.briefs as b (b.id)}<option value={b.id}>{b.name}</option>{/each}</select></label>
  <div class="stepper"><button class="btn small" disabled={at === 0} on:click={() => step = at - 1}>← {T('prev')}</button><b>{T('callOf', {n: at + 1, total: calls.length})}</b><button class="btn small" disabled={at >= calls.length - 1} on:click={() => step = at + 1}>{T('next')} →</button></div>
 </div>
 {#if call}
  <div class="kpi-strip">
   <div><span>{T('kpiModelCalls')}</span><strong>{calls.length}</strong><small>{T('kpiToolCalls', {n: calls.length - 1})}</small></div>
   <div><span>{T('kpiThisCall')}</span><strong>{tk(call.input)}</strong><small>{T('kpiThisCallNote')}</small></div>
   <div><span>{T('kpiRunInput')}</span><strong>{tk(loopTotal)}</strong><small>{T('kpiRunInputNote')}</small></div>
   <div><span>{T('kpiAnswer')}</span><strong>{reference?.name ?? '—'}</strong><small>{T('kpiAnswerNote')}</small></div>
  </div>
  <div class="wire-grid">
   <div>
    <h3>{T('sent', {n: at + 1})}</h3>
    <ol class="wire-list">{#each call.messages as m, i}<li class:new={i >= carried} class={`wire-${m.role}`}><header><b>{m.role}</b><span>{T(`kind_${m.kind}`)}</span><small>{T('tokensN', {n: n0(m.tokens)})}</small></header><pre>{preview(m.body)}</pre></li>{/each}</ol>
   </div>
   <div>
    <h3>{call.stop === 'tool_use' ? T('returnedTool') : T('returnedEnd')}</h3>
    <ol class="wire-list">{#each call.reply as m}<li class="new" class:wire-harness={m.kind === 'tool_result'}><header><b>{m.kind === 'tool_result' ? T('harness') : m.role}</b><span>{T(`kind_${m.kind}`)}</span><small>{T('tokensN', {n: n0(m.tokens)})}</small></header><pre>{preview(m.body)}</pre></li>{/each}</ol>
    <p class="note">{call.stop === 'tool_use' ? T('stopTool') : T('stopEnd')}</p>
    {#if reached !== null}<p><span class={`status ${reached ? 'pass' : 'fail'}`}>{reached ? T('matches') : T('differs')}</span></p>{/if}
   </div>
  </div>
  <h3>{T('loopChart')}</h3>
  <BarChart rows={loopRows} format={tk} legend={[{style: 'solid', label: T('carried')}, {style: 'light', label: T('added')}]} aria={T('loopChart')}/>
  <p class="note">{T('loopNote')}</p>
 {/if}

{:else if demo === 'budget'}
 <h2>{T('budgetTitle')}</h2>
 <p class="note flush">{T('budgetIntro')}</p>
 <div class="net-controls">
  <label class="field"><span>{T('window')}</span><select bind:value={win}><option value={200000}>200K</option><option value={1000000}>1M</option></select></label>
  <label class="net-slider"><span>{T('systemPrompt')}<b>{tk(sys)}</b></span><input type="range" min="500" max="20000" step="500" bind:value={sys}/></label>
  <label class="net-slider"><span>{T('toolCount')}<b>{nTools}</b></span><input type="range" min="0" max="60" bind:value={nTools}/></label>
  <label class="net-slider"><span>{T('perTool')}<b>{n0(perTool)}</b></span><input type="range" min="100" max="1500" step="50" bind:value={perTool}/></label>
  <label class="net-slider"><span>{T('instructions')}<b>{tk(instr)}</b></span><input type="range" min="0" max="20000" step="500" bind:value={instr}/></label>
  <label class="net-slider"><span>{T('skillCount')}<b>{nSkills}</b></span><input type="range" min="0" max="100" bind:value={nSkills}/></label>
  <label class="net-slider"><span>{T('perTurn')}<b>{tk(perTurn)}</b></span><input type="range" min="500" max="20000" step="500" bind:value={perTurn}/></label>
  <label class="net-slider"><span>{T('turns')}<b>{turns}</b></span><input type="range" min="5" max="200" bind:value={turns}/></label>
  <label class="net-slider"><span>{T('compactAt')}<b>{compactAt}%</b></span><input type="range" min="50" max="95" step="5" bind:value={compactAt}/></label>
  <label class="net-slider"><span>{T('summarySize')}<b>{tk(summary)}</b></span><input type="range" min="1000" max="20000" step="500" bind:value={summary}/></label>
 </div>
 <div class="kpi-strip">
  <div><span>{T('kpiFixed')}</span><strong>{tk(budget.fixed)}</strong><small>{T('kpiFixedNote', {pct: pc(budget.fixed / win)})}</small></div>
  <div><span>{T('kpiFirstCompaction')}</span><strong>{budget.firstCompaction ?? '—'}</strong><small>{budget.firstCompaction ? T('kpiTurn') : T('kpiNever')}</small></div>
  <div><span>{T('kpiCompactions')}</span><strong>{budget.compactions}</strong><small>{T('kpiInTurns', {n: turns})}</small></div>
  <div><span>{T('kpiOverflow')}</span><strong>{budget.overflow ?? '—'}</strong><small>{budget.overflow ? T('kpiOverflowNote') : T('kpiFits')}</small></div>
 </div>
 <MiniChart series={budgetSeries} xMin={1} xMax={turns} yMin={0} yMax={bTop} refs={[{y: win, label: T('refWindow')}, {y: compactAt / 100 * win, label: T('refCompact', {pct: compactAt})}]} markers={budget.overflow ? [{x: budget.overflow, label: T('markOverflow')}] : []} format={tk} xFormat={v => String(Math.round(v))} xLabel={T('turnAxis')} yLabel={T('contextAxis')} aria={T('budgetTitle')} height={300}/>
 <h3>{T('stackTitle', {n: turns})}</h3>
 <div class="ctx-stack" role="img" aria-label={T('stackTitle', {n: turns})}>{#each stack.filter(s => s.v > 0) as s (s.id)}<i style={`flex-grow:${s.v}; --tone: var(--s${s.tone})`} title={`${T(`part_${s.id}`)}: ${tk(s.v)}`}></i>{/each}{#if lastLive < win}<i class="free" style={`flex-grow:${win - lastLive}`} title={T('part_free')}></i>{/if}</div>
 <div class="chart-legend map-legend">{#each stack as s (s.id)}<span><i class="dot" style={`--tone: var(--s${s.tone})`}></i>{T(`part_${s.id}`)} · {tk(s.v)}</span>{/each}<span><i class="dot free"></i>{T('part_free')} · {tk(Math.max(0, win - lastLive))}</span></div>
 <p class="note">{T('budgetNote')}</p>

{:else if demo === 'cost'}
 <h2>{T('costTitle')}</h2>
 <p class="note flush">{T('costIntro')}</p>
 <div class="net-controls">
  <label class="net-slider"><span>{T('prefix')}<b>{tk(prefix)}</b></span><input type="range" min="1000" max="50000" step="1000" bind:value={prefix}/></label>
  <label class="net-slider"><span>{T('perTurn')}<b>{tk(cTurn)}</b></span><input type="range" min="200" max="10000" step="100" bind:value={cTurn}/></label>
  <label class="net-slider"><span>{T('turns')}<b>{cTurns}</b></span><input type="range" min="1" max="100" bind:value={cTurns}/></label>
  <label class="field"><span>{T('readMul')}</span><select bind:value={readMul}><option value={0.1}>0.1 × ({T('readDefault')})</option><option value={0.05}>0.05 ×</option><option value={0.025}>0.025 ×</option></select></label>
 </div>
 <div class="kpi-strip">
  <div><span>{T('kpiNoCache')}</span><strong>{tk(cost.total)}</strong><small>{T('kpiClosed', {v: tk(cost.closed)})}</small></div>
  <div><span>{T('kpiCached')}</span><strong>{tk(cost.totalCached)}</strong><small>{T('kpiCachedNote')}</small></div>
  <div><span>{T('kpiSaving')}</span><strong>{pc(1 - cost.totalCached / cost.total)}</strong><small>{T('kpiSavingNote')}</small></div>
  <div><span>{T('kpiLastTurn')}</span><strong>{tk(prefix + cTurns * cTurn)}</strong><small>{T('kpiLastTurnNote', {n: cTurns})}</small></div>
 </div>
 <MiniChart series={costSeries} xMin={1} xMax={Math.max(2, cTurns)} yMin={0} yMax={cost.total * 1.05} format={tk} xFormat={v => String(Math.round(v))} xLabel={T('turnAxis')} yLabel={T('cumulativeAxis')} aria={T('costTitle')} height={300}/>
 <p class="note">{T('costNote')}</p>

{:else if demo === 'reliability'}
 <h2>{T('relTitle')}</h2>
 <p class="note flush">{T('relIntro')}</p>
 <div class="net-controls">
  <label class="net-slider"><span>{T('pStep')}<b>{(100 * p).toFixed(1)}%</b></span><input type="range" min="0.8" max="0.999" step="0.001" bind:value={p}/></label>
  <label class="net-slider"><span>{T('nSteps')}<b>{steps}</b></span><input type="range" min="1" max="50" bind:value={steps}/></label>
  <label class="net-slider"><span>{T('retries')}<b>{retries}</b></span><input type="range" min="0" max="3" bind:value={retries}/></label>
  <label class="net-slider"><span>{T('kTrials')}<b>{k}</b></span><input type="range" min="1" max="16" bind:value={k}/></label>
 </div>
 <div class="kpi-strip">
  <div><span>{T('kpiTask', {n: steps})}</span><strong>{pc(chain(p, steps))}</strong><small>p<sup>{steps}</sup></small></div>
  <div><span>{T('kpiTaskRetry', {r: retries})}</span><strong>{pc(chain(pr, steps))}</strong><small>{T('kpiStepRate', {v: (100 * pr).toFixed(2)})}</small></div>
  <div><span>{T('passAt', {k})}</span><strong>{pc(passAt(p, k))}</strong><small>{T('kpiAtNote')}</small></div>
  <div><span>{T('passHat', {k})}</span><strong>{pc(passHat(p, k))}</strong><small>{T('kpiHatNote')}</small></div>
 </div>
 <div class="card-grid flush-grid">
  <div><h3>{T('relChartA')}</h3><MiniChart series={relSeries} xMin={1} xMax={50} yMin={0} yMax={1} markers={[{x: steps, label: T('markSteps', {n: steps})}]} format={v => `${Math.round(100 * v)}%`} xFormat={v => String(Math.round(v))} xLabel={T('stepsAxis')} yLabel={T('successAxis')} aria={T('relChartA')} height={260}/></div>
  <div><h3>{T('relChartB')}</h3><MiniChart series={passSeries} xMin={1} xMax={16} yMin={0} yMax={1} markers={[{x: k, label: `k = ${k}`}]} format={v => `${Math.round(100 * v)}%`} xFormat={v => String(Math.round(v))} xLabel={T('trialsAxis')} yLabel={T('successAxis')} aria={T('relChartB')} height={260}/></div>
 </div>
 <p class="note">{T('relNote')}</p>

{:else if demo === 'mcp'}
 <h2>{T('mcpTitle')}</h2>
 <p class="note flush">{T('mcpIntro')}</p>
 <div class="net-controls"><div class="stepper"><button class="btn small" disabled={mcpStep === 0} on:click={() => mcpStep--}>← {T('prev')}</button><b>{T('msgOf', {n: mcpStep + 1, total: concepts.mcp.messages.length})}</b><button class="btn small" disabled={mcpStep >= concepts.mcp.messages.length - 1} on:click={() => mcpStep++}>{T('next')} →</button></div></div>
 <div class="seq">
  <div class="seq-head"><span>{T('laneHost')}</span><span>{T('laneClient')}</span><span>{T('laneServer')}</span></div>
  {#each concepts.mcp.messages as m, i}
   <button class={`seq-row ${m.dir}`} class:on={i === mcpStep} class:past={i < mcpStep} disabled={i > mcpStep + 1} on:click={() => mcpStep = i}><span class="seq-arrow"><b>{m.label}</b></span></button>
  {/each}
 </div>
 {#if mcpMsg}<p class="callout">{mcpMsg.note}</p><CodeBlock title={mcpMsg.label} lang="json" text={mcpMsg.json}/>{/if}
 <h3>{T('nmTitle')}</h3>
 <div class="net-controls">
  <label class="net-slider"><span>{T('hosts')}<b>{hosts}</b></span><input type="range" min="1" max="50" bind:value={hosts}/></label>
  <label class="net-slider"><span>{T('servers')}<b>{servers}</b></span><input type="range" min="1" max="200" bind:value={servers}/></label>
 </div>
 <BarChart rows={[{id: 'nm', label: T('nmWithout'), tone: 2, value: n0(hosts * servers), segments: [{value: hosts * servers, style: 'solid', label: T('nmWithout'), text: n0(hosts * servers)}]}, {id: 'np', label: T('nmWith'), tone: 1, value: n0(hosts + servers), segments: [{value: hosts + servers, style: 'solid', label: T('nmWith'), text: n0(hosts + servers)}]}]} format={v => n0(v)} aria={T('nmTitle')}/>
 <p class="note">{T('mcpNote')}</p>

{:else if demo === 'files'}
 <h2>{T('filesTitle')}</h2>
 <p class="note flush">{T('filesIntro')}</p>
 <div class="net-controls">
  <label class="field"><span>{T('tool')}</span><select bind:value={fileTool}><option value="claude">{T('toolClaude')}</option><option value="codex">{T('toolCodex')}</option></select></label>
  <label class="field"><span>{T('cwd')}</span><select bind:value={cwd}>{#each concepts.files.dirs as d}<option value={d}>{d}</option>{/each}</select></label>
  <label class="field"><span>{T('touched')}</span><select bind:value={touched}><option value="">{T('touchedNone')}</option>{#each subDirs as d}<option value={d}>{d}</option>{/each}</select></label>
 </div>
 <div class="card-grid flush-grid">
  <fieldset class="file-tree"><legend>{T('filesPresent')}</legend>{#each nodes as n (n.id)}<label class="check"><input type="checkbox" bind:checked={n.on}/> <code>{n.path}</code></label>{/each}</fieldset>
  <div>
   <h3>{T('filesLoaded', {n: loaded.length})}</h3>
   {#if loaded.length}<ol class="load-list">{#each loaded as r (r.node.id)}<li><code>{r.node.path}</code><span class={`status ${r.when === 'launch' ? 'pass' : 'confirm'}`}>{T(`when_${r.when}`)}</span><small>{T(r.reason)}</small></li>{/each}</ol>{:else}<p class="empty">{T('filesNone')}</p>{/if}
   {#if skipped.length}<h3>{T('filesSkipped')}</h3><ul class="load-list skipped">{#each skipped as r (r.node.id)}<li><code>{r.node.path}</code><small>{T(r.reason)}</small></li>{/each}</ul>{/if}
  </div>
 </div>
 <p class="note">{fileTool === 'claude' ? T('filesNoteClaude') : T('filesNoteCodex')}</p>

{:else if demo === 'skills'}
 <h2>{T('skillsTitle')}</h2>
 <p class="note flush">{T('skillsIntro')}</p>
 <div class="net-controls">
  <label class="net-slider"><span>{T('skInstalled')}<b>{installed}</b></span><input type="range" min="1" max="300" bind:value={installed}/></label>
  <label class="net-slider"><span>{T('skActiveN')}<b>{active}</b></span><input type="range" min="0" max="5" bind:value={active}/></label>
  <label class="net-slider"><span>{T('skBody')}<b>{tk(body)}</b></span><input type="range" min="500" max="5000" step="250" bind:value={body}/></label>
  <label class="net-slider"><span>{T('skFiles')}<b>{tk(files)}</b></span><input type="range" min="0" max="50000" step="1000" bind:value={files}/></label>
  <label class="net-slider"><span>{T('skRead')}<b>{tk(read)}</b></span><input type="range" min="0" max="20000" step="500" bind:value={read}/></label>
 </div>
 <div class="kpi-strip">
  <div><span>{T('skEager')}</span><strong>{tk(sk.eager)}</strong><small>{T('skEagerNote')}</small></div>
  <div><span>{T('skLazy')}</span><strong>{tk(sk.lazy)}</strong><small>{T('skLazyNote', {meta: tk(sk.metadata)})}</small></div>
  <div><span>{T('skRatio')}</span><strong>{(sk.eager / Math.max(1, sk.lazy)).toFixed(sk.eager / sk.lazy >= 10 ? 0 : 1)}×</strong><small>{T('skRatioNote')}</small></div>
  <div><span>{T('skFits')}</span><strong>{sk.eager <= 200000 ? T('yes') : T('no')}</strong><small>{T('skFitsNote')}</small></div>
 </div>
 <BarChart rows={skillRows} format={tk} legend={[{style: 'solid', label: T('skMeta')}, {style: 'light', label: T('skActive')}]} aria={T('skillsTitle')}/>
 <p class="note">{T('skillsNote')}</p>

{:else if demo === 'hooks'}
 <h2>{T('hooksTitle')}</h2>
 <p class="note flush">{T('hooksIntro')}</p>
 <fieldset class="file-tree"><legend>{T('controls')}</legend>{#each controls as c (c.id)}<label class="check"><input type="checkbox" bind:checked={c.on}/> {c.label} <span class={`status ${c.kind === 'advisory' ? 'confirm' : 'pass'}`}>{T(`kind_${c.kind}`)}</span></label>{/each}</fieldset>
 <div class="table-wrap auto"><table class="trace-table"><thead><tr><th>{T('colAction')}</th><th>{T('colOutcome')}</th><th>{T('colBy')}</th></tr></thead>
  <tbody>{#each decisions as d (d.a.id)}<tr><td><code>{d.a.tool}({d.a.arg})</code></td><td><span class={`status ${d.outcome === 'blocked' ? 'pass' : d.outcome === 'ask' ? 'confirm' : d.outcome === 'advisoryOnly' ? 'fail' : 'neutral'}`}>{T(`out_${d.outcome}`)}</span></td><td>{d.by.length ? d.by.map(c => c.label).join('; ') : '—'}</td></tr>{/each}</tbody></table></div>
 <p class="note">{T('hooksNote')}</p>

{:else if demo === 'trifecta'}
 <h2>{T('triTitle')}</h2>
 <p class="note flush">{T('triIntro')}</p>
 <div class="card-grid flush-grid">
  <fieldset class="file-tree"><legend>{T('triTools')}</legend>
   {#each caps as c (c.id)}<label class="check"><input type="checkbox" bind:checked={c.on}/> {c.label} {#each c.legs as l}<span class={`leg-tag ${l}`}>{T(`leg_${l}`)}</span>{/each}</label>{/each}
   <label class="check gate"><input type="checkbox" bind:checked={gated}/> {T('triGate')}</label>
  </fieldset>
  <div>
   <div class="legs">{#each LEGS as l}<div class={`leg ${l}`} class:lit={tri.legs[l].length}><span>{T(`leg_${l}`)}</span><strong>{tri.legs[l].length ? T('legPresent') : T('legAbsent')}</strong><small>{tri.legs[l].map(c => c.label).join(', ') || '—'}</small></div>{/each}</div>
   {#if tri.all && !tri.gated}<p class="callout warn"><b>{T('triAll')}</b> {T('triAllText')}</p>
   {:else if tri.gated}<p class="callout"><b>{T('triGated')}</b> {T('triGatedText')}</p>
   {:else}<p class="callout"><b>{T('triSafe')}</b> {T('triSafeText', {legs: LEGS.filter(l => !tri.legs[l].length).map(l => T(`leg_${l}`)).join(', ')})}</p>{/if}
   {#if tri.all && tri.breakers.length}<p class="note">{T('triBreakers', {list: tri.breakers.map(c => c.label).join(', ')})}</p>{/if}
  </div>
 </div>
 <p class="note">{T('triNote')}</p>
{/if}
