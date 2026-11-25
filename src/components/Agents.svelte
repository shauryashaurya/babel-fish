<script lang="ts">
 import AgentLab from './AgentLab.svelte';
 import AgentsExplained from './AgentsExplained.svelte';
 import BarChart, {type BarRow} from './BarChart.svelte';
 import DataTable from './DataTable.svelte';
 import {agents, CATEGORY_TONE as TONE, recommendPatterns, type AgentPattern} from '../lib/agents';
 import {briefLine, profile, type ProfileRow} from '../lib/agentLab';
 import {t} from '../lib/content';
 import type {Column} from '../lib/filters';
 import {safeUrl} from '../lib/selection';
 import type {Model} from '../lib/types';
 export let models: Model[];
 export let route = '';
 export let item = '';
 const sections = ['overview', 'explained', 'patterns', 'lab', 'cost', 'choose', 'govern'];
 let section = 'overview';
 $: if (route && sections.includes(route)) section = route;
 function go(s: string) { section = s; history.replaceState(null, '', `#/agents/${s}`); }
 const level = (n: number) => '●'.repeat(n) + '○'.repeat(3 - n);
 const byAutonomy = [1, 2, 3].map(a => agents.patterns.filter(p => p.autonomy === a));

 // Patterns
 let category = '', selectedId = agents.patterns[0]?.id ?? '';
 $: if (route === 'patterns' && item && agents.patterns.some(p => p.id === item)) selectedId = item;
 $: selected = agents.patterns.find(p => p.id === selectedId)!;
 $: selectedIndex = agents.patterns.findIndex(p => p.id === selectedId) + 1;
 $: rows = agents.patterns.filter(p => !category || p.category === category);
 $: columns = [
  {key: 'name', label: t('agents.colPattern'), value: (p: AgentPattern) => p.name, sub: (p: AgentPattern) => agents.categories[p.category]},
  {key: 'mechanism', label: t('agents.colMechanism'), value: (p: AgentPattern) => p.mechanism, cellClass: 'method-cell'},
  {key: 'bestFor', label: t('agents.colBestFor'), value: (p: AgentPattern) => p.bestFor},
  {key: 'autonomy', label: t('agents.colAutonomy'), value: (p: AgentPattern) => p.autonomy, text: (p: AgentPattern) => level(p.autonomy), cellClass: 'level'},
  {key: 'modelCalls', label: t('agents.colModelCalls'), value: (p: AgentPattern) => p.modelCalls, text: (p: AgentPattern) => level(p.modelCalls), cellClass: 'level'},
  {key: 'latency', label: t('agents.colLatency'), value: (p: AgentPattern) => p.latency, text: (p: AgentPattern) => level(p.latency), cellClass: 'level'},
  {key: 'predictability', label: t('agents.colPredictability'), value: (p: AgentPattern) => p.predictability, text: (p: AgentPattern) => level(p.predictability), cellClass: 'level'},
  {key: 'open', label: '', sortable: false, value: () => null, text: (p: AgentPattern) => t(p.id === selectedId ? 'rag.showing' : 'rag.details'), action: {disabled: (p: AgentPattern) => p.id === selectedId, run: (p: AgentPattern) => { selectedId = p.id; document.querySelector('.approach-detail')?.scrollIntoView({block: 'nearest'}); }}},
 ] as Column[];
 $: controlsFor = agents.controls.filter(c => c.patterns.includes(selectedId));

 // Cost profile
 let briefId = agents.briefs[0]?.id ?? '', llmMs = 1500, toolMsAll = 300, raw: ProfileRow[] | null = null, working = false;
 $: brief = agents.briefs.find(b => b.id === briefId)?.brief;
 function runProfile() {
  if (!brief) return;
  const b = brief; working = true;
  setTimeout(() => { try { raw = profile(models, b, {llmMs, toolMs: toolMsAll}); } finally { working = false; } }, 30);
 }
 $: if (briefId) raw = null;
 // Counts do not depend on the time assumptions, so moving a slider only recomputes the estimated time.
 $: prof = raw ? raw.map(r => ({...r, latencyMs: r.toolPathMs !== null ? 2 * llmMs + r.toolPathMs : r.metrics.llmRounds * llmMs + r.metrics.toolRounds * toolMsAll})) : null;
 const pat = (id: string) => agents.patterns.find(p => p.id === id)!;
 const seconds = (ms: number) => t('agents.secValue', {s: (ms / 1000).toFixed(1)});
 const bars = (list: ProfileRow[], value: (r: ProfileRow) => number, text: (r: ProfileRow) => string): BarRow[] =>
  [...list].sort((a, b) => value(a) - value(b)).map(r => ({id: r.id, label: pat(r.id).name, href: `#/agents/lab/${r.id}`, tone: TONE[pat(r.id).category], value: text(r), segments: [{value: value(r), style: 'solid', label: pat(r.id).name, text: text(r)}]}));
 $: legendCats = prof ? [...new Set(prof.map(r => pat(r.id).category))] : [];

 // Chooser
 let answers: Record<string, string> = Object.fromEntries(agents.chooser.questions.map(q => [q.id, q.options[0].id]));
 $: picks = recommendPatterns(answers);

 // Checklist
 let checked = new Set<number>();
 function toggleCheck(i: number) { const next = new Set(checked); if (next.has(i)) next.delete(i); else next.add(i); checked = next; }
</script>

<header class="page-head"><div><h1>{t('agents.title')}</h1><p>{agents.intro.what}</p></div></header>
<div class="section-tabs page-tabs" role="tablist" aria-label={t('agents.title')}>
 {#each sections as s}<button role="tab" aria-selected={section === s} class:on={section === s} on:click={() => go(s)}>{t(`agents.tab_${s}`)}</button>{/each}
</div>

{#if section === 'overview'}
 <div class="arch-detail">
  <section class="card plain-card"><p class="plain-analogy"><span>{t('plain.imagine')}</span> {agents.intro.analogy}</p>
   <p class="note">{t('architecture.source')}: <a href={agents.intro.source.url} target="_blank" rel="noreferrer">{agents.intro.source.title}</a> · <a href={agents.survey.url} target="_blank" rel="noreferrer">{agents.survey.title}</a></p></section>
  <section class="card explain-cta"><div><h2>{t('agents.explainTitle')}</h2><p>{t('agents.explainText')}</p></div><button class="btn primary" on:click={() => go('explained')}>{t('agents.explainLink')}</button></section>
  <div class="insight-grid">
   <section class="card insight"><h2>{t('agents.workflowsTitle')}</h2><p>{agents.intro.workflows}</p></section>
   <section class="card insight"><h2>{t('agents.agentsTitle')}</h2><p>{agents.intro.agents}</p></section>
  </div>
  <section class="card">
   <div class="chart-card-head"><div><h2>{t('agents.mapTitle')}</h2><p>{t('agents.mapSub')}</p></div></div>
   <div class="autonomy-map">
    {#each byAutonomy as list, i}
     <div class="autonomy-col"><h3>{t(`agents.autonomy${i + 1}`)}</h3>
      {#each list as p (p.id)}<a class="pattern-chip" href={`#/agents/lab/${p.id}`} style={`--tone: var(--s${TONE[p.category]})`}><b>{p.name}</b><small>{p.mechanism}</small></a>{/each}
     </div>
    {/each}
   </div>
   <div class="chart-legend map-legend">{#each Object.entries(agents.categories) as [id, label]}<span><i class="dot" style={`--tone: var(--s${TONE[id]})`}></i>{label}</span>{/each}</div>
   <p class="note">{t('agents.mapNote')}</p>
  </section>
  <section class="card"><h2>{t('agents.buildingTitle')}</h2>
   <div class="concept-grid">{#each agents.building as x}<div class="concept"><h3>{x.title}</h3><p>{x.text}</p></div>{/each}</div>
  </section>
  <section class="card"><h2>{t('agents.principlesTitle')}</h2><ol class="plain">{#each agents.principles as x}<li>{x}</li>{/each}</ol>
   <p class="note">{t('architecture.source')}: <a href={agents.intro.source.url} target="_blank" rel="noreferrer">{agents.intro.source.title}</a></p></section>
  <div class="insight-grid">{#each agents.failureModes as f (f.title)}<section class="card insight fail"><h2>{f.title}</h2><p>{f.text}</p><p class="note">{t('architecture.source')}: <a href={f.source.url} target="_blank" rel="noreferrer">{f.source.title}</a></p></section>{/each}</div>
 </div>
{:else if section === 'explained'}
 <AgentsExplained {models} topic={route === 'explained' ? item : ''}/>
{:else if section === 'patterns'}
 <section class="card approach-detail">
  <p class="overline">{t('agents.patternOf', {n: selectedIndex, total: agents.patterns.length})}</p>
  <h2>{selected.name} <span class="tag" style={`--tone: var(--s${TONE[selected.category]})`}>{agents.categories[selected.category]}</span></h2>
  <p><b>{selected.mechanism}.</b> {selected.what}</p>
  <ol class="step-list">{#each selected.how as h, i}<li><b>{i + 1}</b><div><span>{h}</span></div></li>{/each}</ol>
  <div class="card-grid flush-grid">
   <dl><div><dt>{t('agents.colBestFor')}</dt><dd>{selected.bestFor}</dd></div><div><dt>{t('architecture.strengths')}</dt><dd>{selected.strength}</dd></div><div><dt>{t('architecture.limitations')}</dt><dd>{selected.limit}</dd></div></dl>
   <dl><div><dt>{t('agents.colAutonomy')}</dt><dd class="level">{level(selected.autonomy)}</dd></div><div><dt>{t('agents.colModelCalls')}</dt><dd class="level">{level(selected.modelCalls)}</dd></div><div><dt>{t('agents.colLatency')}</dt><dd class="level">{level(selected.latency)}</dd></div><div><dt>{t('agents.colPredictability')}</dt><dd class="level">{level(selected.predictability)}</dd></div></dl>
  </div>
  <p class="callout"><b>{t('agents.governTitle')}</b> {selected.govern}{#if controlsFor.length} <span class="note">{t('agents.controlsListed', {list: controlsFor.map(c => c.name).join(', ')})}</span>{/if}</p>
  <p class="note">{t('architecture.source')}: {#each selected.sources as s, i}{i ? ' · ' : ''}<a href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}</a>{/each}</p>
  <p><a class="btn primary small" href={`#/agents/lab/${selected.id}`}>{t('agents.runInLab')}</a></p>
 </section>
 <DataTable {rows} {columns} rowKey={(p) => p.id} searchable size="auto">
  <svelte:fragment slot="toolbar"><select aria-label={t('agents.category')} bind:value={category}><option value="">{t('agents.allCategories')}</option>{#each Object.entries(agents.categories) as [id, label]}<option value={id}>{label}</option>{/each}</select></svelte:fragment>
 </DataTable>
 <p class="note">{t('agents.levelNote')}</p>
{:else if section === 'lab'}
 <AgentLab {models} {item}/>
{:else if section === 'cost'}
 <div class="arch-detail">
  <section class="card"><h2>{t('agents.costTitle')}</h2><p class="note flush">{agents.costIntro}</p>
   <div class="net-controls">
    <label class="field"><span>{t('agentLab.brief')}</span><select bind:value={briefId}>{#each agents.briefs as b (b.id)}<option value={b.id}>{b.name}</option>{/each}</select></label>
    <label class="net-slider"><span>{t('agents.llmMs')}<b>{seconds(llmMs)}</b></span><input type="range" min="300" max="6000" step="100" bind:value={llmMs}/></label>
    <label class="net-slider"><span>{t('agents.toolMs')}<b>{t('agents.msValue', {ms: toolMsAll})}</b></span><input type="range" min="50" max="2000" step="50" bind:value={toolMsAll}/></label>
   </div>
   {#if brief}<p class="note">{briefLine(brief)}</p>{/if}
   <p><button class="btn primary" disabled={working} on:click={runProfile}>{working ? t('ragLab.running') : prof ? t('ragLab.runAgain') : t('agents.runProfile')}</button></p>
   <p class="note">{agents.costAssumptions}</p>
  </section>
  {#if prof}
   <div class="card-grid">
    <section class="card"><div class="chart-card-head"><div><h2>{t('agentLab.m_llm')}</h2><p>{t('agents.llmSub')}</p></div></div>
     <BarChart rows={bars(prof, r => r.metrics.llmCalls, r => String(r.metrics.llmCalls))} format={v => String(Math.round(v))} aria={t('agentLab.m_llm')}/></section>
    <section class="card"><div class="chart-card-head"><div><h2>{t('agents.latencyTitle')}</h2><p>{t('agents.latencySub')}</p></div></div>
     <BarChart rows={bars(prof, r => r.latencyMs, r => seconds(r.latencyMs))} format={v => v ? seconds(v) : '0'} aria={t('agents.latencyTitle')}/></section>
    <section class="card"><div class="chart-card-head"><div><h2>{t('agentLab.m_tokens')}</h2><p>{t('agents.tokensSub')}</p></div></div>
     <BarChart rows={bars(prof, r => r.metrics.tokens, r => r.metrics.tokens.toLocaleString('en-US'))} format={v => v >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v))} aria={t('agentLab.m_tokens')}/></section>
    <section class="card"><div class="chart-card-head"><div><h2>{t('agentLab.m_tools')}</h2><p>{t('agents.toolsSub')}</p></div></div>
     <BarChart rows={bars(prof, r => r.metrics.toolCalls, r => String(r.metrics.toolCalls))} format={v => String(Math.round(v))} aria={t('agentLab.m_tools')}/></section>
   </div>
   <div class="chart-legend map-legend">{#each legendCats as c}<span><i class="dot" style={`--tone: var(--s${TONE[c]})`}></i>{agents.categories[c]}</span>{/each}</div>
   <section class="card"><h2>{t('agents.tableTitle')}</h2>
    <div class="table-wrap auto"><table class="trace-table"><thead><tr><th>{t('agents.colPattern')}</th><th>{t('agentLab.m_llm')}</th><th>{t('agentLab.m_tools')}</th><th>{t('agentLab.m_rounds')}</th><th>{t('agentLab.m_tokens')}</th><th>{t('agents.latencyTitle')}</th><th>{t('agents.colResult')}</th></tr></thead>
     <tbody>{#each prof as r (r.id)}<tr><td><a href={`#/agents/lab/${r.id}`}>{pat(r.id).name}</a></td><td>{r.metrics.llmCalls}</td><td>{r.metrics.toolCalls}</td><td>{r.metrics.llmRounds + r.metrics.toolRounds}</td><td>{r.metrics.tokens.toLocaleString('en-US')}</td><td>{seconds(r.latencyMs)}</td><td><span class={`status ${r.verdict === 'best' || r.verdict === 'noneCorrect' ? 'pass' : r.verdict === null ? 'confirm' : 'fail'}`}>{t(`agents.verdict_${r.verdict ?? 'other'}`)}</span></td></tr>{/each}</tbody></table></div>
    <p class="note">{t('agents.tableNote')}</p>
   </section>
  {/if}
 </div>
{:else if section === 'choose'}
 <div class="arch-detail">
  <section class="card"><h2>{t('agents.chooseTitle')}</h2><p class="note flush">{agents.chooser.intro}</p>
   <div class="chooser">{#each agents.chooser.questions as q (q.id)}<fieldset><legend>{q.label}</legend>{#each q.options as o (o.id)}<label class="check"><input type="radio" name={q.id} value={o.id} bind:group={answers[q.id]}/> {o.label}</label>{/each}</fieldset>{/each}</div>
  </section>
  <section class="card"><h2>{t('rag.recommended')}</h2>
   {#if picks.length}
    <div class="table-wrap auto"><table class="stack-table"><thead><tr><th>{t('agents.colPattern')}</th><th>{t('rag.because')}</th><th>{t('agents.colAutonomy')}</th><th>{t('agents.colModelCalls')}</th><th>{t('agents.colPredictability')}</th></tr></thead><tbody>
     {#each picks as p (p.pattern.id)}<tr><td><a class="strong" href={`#/agents/lab/${p.pattern.id}`}>{p.pattern.name}</a><small>{p.pattern.mechanism}</small></td><td data-label={t('rag.because')}><ul class="plain">{#each p.why as w}<li>{w}</li>{/each}</ul></td><td class="level" data-label={t('agents.colAutonomy')}>{level(p.pattern.autonomy)}</td><td class="level" data-label={t('agents.colModelCalls')}>{level(p.pattern.modelCalls)}</td><td class="level" data-label={t('agents.colPredictability')}>{level(p.pattern.predictability)}</td></tr>{/each}
    </tbody></table></div>
   {:else}<p class="empty">{t('agents.noPick')}</p>{/if}
   <p class="note">{t('agents.chooseNote')}</p>
  </section>
 </div>
{:else}
 <div class="arch-detail">
  <section class="card"><h2>{t('agents.frameworksTitle')}</h2><p class="note flush">{t('agents.frameworksIntro')}</p>
   <div class="concept-grid">{#each agents.frameworks as f (f.id)}<div class="concept"><h3>{f.name}</h3><p>{f.text}</p><p class="note"><a href={f.source.url} target="_blank" rel="noreferrer">{f.source.title}</a></p></div>{/each}</div>
  </section>
  <section class="card"><h2>{t('agents.controlsTitle')}</h2><p class="note flush">{t('agents.controlsIntro')}</p>
   <div class="table-wrap auto"><table class="trace-table"><thead><tr><th>{t('agents.colControl')}</th><th>{t('agents.colWhat')}</th><th>{t('agents.colNeededBy')}</th><th>{t('compare.sources')}</th></tr></thead>
    <tbody>{#each agents.controls as c (c.id)}<tr><th scope="row">{c.name}</th><td>{c.text}</td><td class="chip-cell">{#each c.patterns as id}{@const p = pat(id)}<a class="pattern-mini" href={`#/agents/patterns/${id}`} style={`--tone: var(--s${TONE[p.category]})`}>{p.name}</a>{/each}</td><td><a href={c.source.url} target="_blank" rel="noreferrer">{c.source.title}</a></td></tr>{/each}</tbody></table></div>
  </section>
  <section class="card"><h2>{t('agents.benchmarksTitle')}</h2><p class="note flush">{t('agents.benchmarksIntro')}</p><ul class="plain">{#each agents.benchmarks as b}<li><a href={b.url} target="_blank" rel="noreferrer">{b.title}</a></li>{/each}</ul></section>
  <section class="card"><h2>{t('ft.checklist')} <span class="status confirm">{t('common.positionOf', {position: checked.size, total: agents.checklist.length})}</span></h2>
   <div class="check-list">{#each agents.checklist as c, i}<label class="check"><input type="checkbox" checked={checked.has(i)} on:change={() => toggleCheck(i)}/> {c}</label>{/each}</div>
  </section>
 </div>
{/if}
