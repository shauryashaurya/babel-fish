<script lang="ts">
 import DataTable from './DataTable.svelte';
 import GraphLab from './GraphLab.svelte';
 import MathBlock from './MathBlock.svelte';
 import RetrievalLab from './RetrievalLab.svelte';
 import RagTechniques from './RagTechniques.svelte';
 import {t} from '../lib/content';
 import type {Column} from '../lib/filters';
 import {rag, recommend, type RagApproach} from '../lib/rag';
 import {safeUrl} from '../lib/selection';
 import type {Model} from '../lib/types';
 export let models: Model[];
 export let route = '';
 export let item = '';
 const sections = ['overview', 'approaches', 'techniques', 'retrieval', 'graph', 'choose', 'evaluate'];
 let section = 'overview';
 $: if (route && sections.includes(route)) section = route;
 function go(s: string) { section = s; history.replaceState(null, '', `#/rag/${s}`); }

 // Overview
 let stageId = 'chunk';
 $: stage = rag.pipeline.find(s => s.id === stageId)!;
 $: stageFails = rag.failurePoints.items.filter(f => f.stage === stageId);
 const sides = ['index', 'query', 'ops'] as const;

 // Approaches
 let category = '', selectedId = 'graphrag';
 $: if (route === 'approaches' && item && rag.approaches.some(a => a.id === item)) selectedId = item;
 $: runsIn = rag.techniques.items.filter(x => x.approaches.includes(selectedId));
 $: selected = rag.approaches.find(a => a.id === selectedId)!;
 $: rows = rag.approaches.filter(a => !category || a.category === category);
 const level = (n: number) => '●'.repeat(n) + '○'.repeat(3 - n);
 $: columns = [
  {key: 'name', label: t('rag.colApproach'), value: (a: RagApproach) => a.name, sub: (a: RagApproach) => rag.categories[a.category]},
  {key: 'what', label: t('rag.colWhat'), value: (a: RagApproach) => a.what, cellClass: 'method-cell'},
  {key: 'indexCost', label: t('rag.colIndexCost'), value: (a: RagApproach) => a.indexCost, text: (a: RagApproach) => level(a.indexCost), cellClass: 'level'},
  {key: 'queryCost', label: t('rag.colQueryCost'), value: (a: RagApproach) => a.queryCost, text: (a: RagApproach) => level(a.queryCost), cellClass: 'level'},
  {key: 'exact', label: t('rag.colExact'), value: (a: RagApproach) => a.exact, text: (a: RagApproach) => level(a.exact), cellClass: 'level'},
  {key: 'multiHop', label: t('rag.colMultiHop'), value: (a: RagApproach) => a.multiHop, text: (a: RagApproach) => level(a.multiHop), cellClass: 'level'},
  {key: 'global', label: t('rag.colGlobal'), value: (a: RagApproach) => a.global, text: (a: RagApproach) => level(a.global), cellClass: 'level'},
  {key: 'open', label: '', sortable: false, value: () => null, text: (a: RagApproach) => t(a.id === selectedId ? 'rag.showing' : 'rag.details'), action: {disabled: (a: RagApproach) => a.id === selectedId, run: (a: RagApproach) => { selectedId = a.id; document.querySelector('.approach-detail')?.scrollIntoView({block: 'nearest'}); }}},
 ] as Column[];

 // Chooser
 let answers: Record<string, string> = Object.fromEntries(rag.chooser.questions.map(q => [q.id, q.options[0].id]));
 $: result = recommend(answers);

 // Evaluate
 let checked = new Set<number>();
 function toggleCheck(i: number) { const next = new Set(checked); if (next.has(i)) next.delete(i); else next.add(i); checked = next; }
</script>
<header class="page-head"><div><h1>{t('rag.title')}</h1><p>{rag.intro.what}</p></div></header>
<div class="section-tabs page-tabs" role="tablist" aria-label={t('rag.title')}>
 {#each sections as s}<button role="tab" aria-selected={section === s} class:on={section === s} on:click={() => go(s)}>{t(`rag.tab_${s}`)}</button>{/each}
</div>
{#if section === 'overview'}
 <div class="arch-detail">
  <section class="card plain-card"><p class="plain-analogy"><span>{t('plain.imagine')}</span> {rag.intro.analogy}</p><p class="note">{t('architecture.source')}: <a href={rag.intro.source.url} target="_blank" rel="noreferrer">{rag.intro.source.title}</a> · <a href={rag.survey.url} target="_blank" rel="noreferrer">{rag.survey.title}</a></p></section>
  <section class="card"><h2>{t('rag.pipelineTitle')}</h2><p class="note flush">{t('rag.pipelineIntro')}</p>
   <div class="pipeline">
    {#each sides as side}
     <div class="pipe-row"><span class="pipe-side">{t(`rag.side_${side}`)}</span>
      <div class="pipe-steps">{#each rag.pipeline.filter(p => p.side === side) as p, i (p.id)}{#if i}<span class="pipe-arrow" aria-hidden="true">→</span>{/if}<button class:on={p.id === stageId} class:has-fail={rag.failurePoints.items.some(f => f.stage === p.id)} on:click={() => stageId = p.id}>{p.title}</button>{/each}</div>
     </div>
    {/each}
   </div>
   <div class="stage-body">
    <div class="stage-text"><h3>{stage.title}</h3><p>{stage.what}</p><h4>{t('rag.decide')}</h4><ul class="plain">{#each stage.decide as d}<li>{d}</li>{/each}</ul>
     <p class="callout warn"><b>{t('ft.watch')}</b> {stage.fails}</p>{#if stage.source}<p class="note">{t('architecture.source')}: <a href={stage.source.url} target="_blank" rel="noreferrer">{stage.source.title}</a></p>{/if}</div>
    <div class="stage-widget"><h4>{rag.failurePoints.title}</h4>
     <ul class="fail-list">{#each rag.failurePoints.items as fp}<li class:on={fp.stage === stageId}><button class="link-btn" on:click={() => stageId = fp.stage}>{fp.name}</button><span>{fp.text}</span></li>{/each}</ul>
     <p class="note">{stageFails.length ? t('rag.failHere', {count: stageFails.length}) : t('rag.failNone')} {t('architecture.source')}: <a href={rag.failurePoints.source.url} target="_blank" rel="noreferrer">{rag.failurePoints.source.title}</a></p>
    </div>
   </div>
  </section>
  <div class="insight-grid">
   <section class="card insight pass"><h2>{t('ft.goodFor')}</h2><ul class="plain">{#each rag.intro.goodFor as x}<li>{x}</li>{/each}</ul></section>
   <section class="card insight fail"><h2>{t('ft.badFor')}</h2><ul class="plain">{#each rag.intro.badFor as x}<li>{x}</li>{/each}</ul></section>
  </div>
  <section class="card"><h2>{rag.compare.title}</h2>
   <div class="table-wrap auto"><table><thead><tr><th>{t('rag.need')}</th><th>{t('rag.colRag')}</th><th>{t('rag.colFt')}</th><th>{t('rag.colLong')}</th></tr></thead>
    <tbody>{#each rag.compare.rows as r}<tr><th scope="row">{r.need}</th><td>{r.rag}</td><td>{r.ft}</td><td>{r.long}</td></tr>{/each}</tbody></table></div>
   <p class="note"><a href="#/finetuning">{t('rag.toFineTuning')}</a></p>
  </section>
 </div>
{:else if section === 'approaches'}
 <section class="card approach-detail">
  <h2>{selected.name} <span class="tag">{rag.categories[selected.category]}</span></h2>
  <p>{selected.what}</p>
  <ol class="step-list">{#each selected.how as h, i}<li><b>{i + 1}</b><div><span>{h}</span></div></li>{/each}</ol>
  <div class="card-grid flush-grid">
   <dl><div><dt>{t('rag.bestFor')}</dt><dd>{selected.bestFor}</dd></div><div><dt>{t('architecture.strengths')}</dt><dd>{selected.strength}</dd></div><div><dt>{t('architecture.limitations')}</dt><dd>{selected.limit}</dd></div></dl>
   <dl><div><dt>{t('rag.colIndexCost')}</dt><dd class="level">{level(selected.indexCost)}</dd></div><div><dt>{t('rag.colQueryCost')}</dt><dd class="level">{level(selected.queryCost)}</dd></div><div><dt>{t('rag.colExact')}</dt><dd class="level">{level(selected.exact)}</dd></div><div><dt>{t('rag.colMultiHop')}</dt><dd class="level">{level(selected.multiHop)}</dd></div><div><dt>{t('rag.colGlobal')}</dt><dd class="level">{level(selected.global)}</dd></div></dl>
  </div>
  <p class="note">{t('architecture.source')}: <a href={safeUrl(selected.source.url)} target="_blank" rel="noreferrer">{selected.source.title}</a>{#if selected.docs} · <a href={safeUrl(selected.docs.url)} target="_blank" rel="noreferrer">{selected.docs.title}</a>{/if}{#each selected.more ?? [] as m} · <a href={safeUrl(m.url)} target="_blank" rel="noreferrer">{m.title}</a>{/each}</p>
  {#if runsIn.length}<p class="callout">{t('ragLab.runInLab')} {#each runsIn as x, i}{i ? ' · ' : ''}<a href={`#/rag/techniques/${x.id}`}>{x.name}</a>{/each}</p>{/if}
  {#if selected.id === 'graphrag' || selected.id === 'hipporag' || selected.id === 'kg' || selected.id === 'lightrag'}<p class="callout">{t('rag.tryGraph')} <button class="link-btn" on:click={() => go('graph')}>{t('rag.tab_graph')}</button></p>
  {:else if ['bm25', 'dense', 'hybrid', 'chunking', 'naive'].includes(selected.id)}<p class="callout">{t('rag.tryRetrieval')} <button class="link-btn" on:click={() => go('retrieval')}>{t('rag.tab_retrieval')}</button></p>{/if}
 </section>
 <DataTable {rows} {columns} rowKey={(a) => a.id} searchable size="auto">
  <svelte:fragment slot="toolbar"><select aria-label={t('rag.category')} bind:value={category}><option value="">{t('rag.allCategories')}</option>{#each Object.entries(rag.categories) as [id, label]}<option value={id}>{label}</option>{/each}</select></svelte:fragment>
 </DataTable>
 <p class="note">{t('rag.levelNote')}</p>
{:else if section === 'techniques'}
 <RagTechniques {models} {item}/>
{:else if section === 'retrieval'}
 <div class="arch-detail"><RetrievalLab/></div>
{:else if section === 'graph'}
 <div class="arch-detail"><GraphLab {models}/></div>
{:else if section === 'choose'}
 <div class="arch-detail">
  <section class="card"><h2>{t('rag.chooseTitle')}</h2><p class="note flush">{rag.chooser.intro}</p>
   <div class="chooser">{#each rag.chooser.questions as q (q.id)}<fieldset><legend>{q.label}</legend>{#each q.options as o (o.id)}<label class="check"><input type="radio" name={q.id} value={o.id} bind:group={answers[q.id]}/> {o.label}</label>{/each}</fieldset>{/each}</div>
  </section>
  <section class="card"><h2>{t('rag.recommended')}</h2>
   <div class="table-wrap auto"><table><thead><tr><th>{t('rag.colApproach')}</th><th>{t('rag.because')}</th><th>{t('rag.colIndexCost')}</th><th>{t('rag.colQueryCost')}</th></tr></thead><tbody>
    {#each result.picks as p (p.approach.id)}<tr><td><button class="link-btn strong" on:click={() => { selectedId = p.approach.id; go('approaches'); }}>{p.approach.name}</button></td><td><ul class="plain">{#each p.why as w}<li>{w}</li>{/each}</ul></td><td class="level">{level(p.approach.indexCost)}</td><td class="level">{level(p.approach.queryCost)}</td></tr>{/each}
   </tbody></table></div>
   {#if result.avoid.length}<h3>{t('rag.avoid')}</h3><ul class="plain">{#each result.avoid as a (a.approach.id)}<li><b>{a.approach.name}</b>: {a.why.join(' ')}</li>{/each}</ul>{/if}
   <p class="note">{t('rag.chooseNote')}</p>
  </section>
 </div>
{:else}
 <div class="arch-detail">
  <section class="card"><h2>{t('rag.metricsTitle')}</h2><p class="note flush">{t('rag.metricsIntro')}</p><MathBlock items={rag.metrics}/><p class="note">{t('architecture.source')}: <a href={rag.metricsSource.url} target="_blank" rel="noreferrer">{rag.metricsSource.title}</a></p></section>
  <div class="insight-grid">{#each rag.risks as r (r.title)}<section class="card insight fail"><h2>{r.title}</h2><p>{r.text}</p>{#if r.source}<p class="note">{t('architecture.source')}: <a href={r.source.url} target="_blank" rel="noreferrer">{r.source.title}</a></p>{/if}</section>{/each}</div>
  <section class="card"><h2>{t('ft.checklist')} <span class="status confirm">{t('common.positionOf', {position: checked.size, total: rag.checklist.length})}</span></h2>
   <div class="check-list">{#each rag.checklist as c, i}<label class="check"><input type="checkbox" checked={checked.has(i)} on:change={() => toggleCheck(i)}/> {c}</label>{/each}</div>
  </section>
 </div>
{/if}
