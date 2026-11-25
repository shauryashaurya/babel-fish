<script lang="ts">
 import DataTable from './DataTable.svelte';
 import DpoDemo from './DpoDemo.svelte';
 import FtStages from './FtStages.svelte';
 import TuneLab from './TuneLab.svelte';
 import {t} from '../lib/content';
 import type {Column} from '../lib/filters';
 import {infrastructure, pickForMemory} from '../lib/infrastructure';
 import {fineTuning, slms, type Slm, type TuningMethod} from '../lib/learning';
 import {commercialLabel, commercialTone, formatGiB, formatParams, safeUrl} from '../lib/selection';
 import {planTraining} from '../lib/training';
 const f = fineTuning;
 const sections = ['understand', 'how', 'lab', 'preference', 'methods', 'plan', 'risks'];
 export let route = '';
 export let routeModel = '';
 let section = 'understand', ladder = 2, checked = new Set<number>();
 $: if (route && sections.includes(route)) section = route;
 const plannable = slms.filter((s): s is Slm & {hiddenSize: number; layers: number} => !!s.hiddenSize && !!s.layers);
 let slmId = plannable.find(s => s.license.rule.commercial === 'allowed')?.id ?? plannable[0]?.id, method = 'lora', rank = 16, batch = 8, sequence = 512, examples = 2000, epochs = 3, checkpointing = true;
 $: if (routeModel && plannable.some(s => s.id === routeModel)) slmId = routeModel;
 $: slm = plannable.find(s => s.id === slmId) ?? plannable[0];
 $: plan = planTraining({params: slm.params, hiddenSize: slm.hiddenSize, layers: slm.layers, method, rank, batch, sequence, examples, epochs, checkpointing});
 $: picks = infrastructure.clouds.map(cloud => ({cloud, pick: pickForMemory(cloud, plan.memoryGiB)}));
 const planMethods = ['prefix', 'lora', 'qlora', 'full', 'dpo'];
 const nameOf = (id: string) => f.methods.find(m => m.id === id)?.name ?? id;
 const size = (mib: number) => mib >= 1024 ? formatGiB(mib / 1024) : `${mib.toFixed(mib < 10 ? 1 : 0)} MiB`;
 const columns: Column[] = [
  {key: 'name', label: 'name', value: (m: TuningMethod) => m.name, sub: (m: TuningMethod) => m.what, cellClass: 'method-cell'},
  {key: 'best', label: 'best', value: (m: TuningMethod) => m.best},
  {key: 'data', label: 'data', value: (m: TuningMethod) => m.data},
  {key: 'strength', label: 'strength', value: (m: TuningMethod) => m.strength},
  {key: 'limit', label: 'limit', value: (m: TuningMethod) => m.limit},
  {key: 'source', label: 'source', sortable: false, value: (m: TuningMethod) => m.source.title, href: (m: TuningMethod) => safeUrl(m.source.url)},
 ];
 $: methodColumns = columns.map(c => ({...c, label: t(`ft.col_${c.label}`)}));
 function toggleCheck(i: number) { const next = new Set(checked); if (next.has(i)) next.delete(i); else next.add(i); checked = next; }
</script>
<header class="page-head"><div><h1>{t('ft.title')}</h1><p>{f.intro.what}</p></div></header>
<div class="section-tabs page-tabs" role="tablist" aria-label={t('ft.title')}>
 {#each sections as s}<button role="tab" aria-selected={section === s} class:on={section === s} on:click={() => { section = s; history.replaceState(null, '', `#/finetuning/${s}`); }}>{t(`ft.tab_${s}`)}</button>{/each}
</div>
{#if section === 'understand'}
 <div class="arch-detail">
  <section class="card plain-card"><p class="plain-analogy"><span>{t('plain.imagine')}</span> {f.intro.analogy}</p></section>
  <section class="card"><h2>{f.ladder.title}</h2><p class="note flush">{f.ladder.note}</p>
   <div class="ladder" role="group" aria-label={f.ladder.title}>{#each f.ladder.steps as s, i}<button class:on={i === ladder} class:past={i < ladder} on:click={() => ladder = i}><b>{i + 1}</b>{s.name}</button>{/each}</div>
   <p class="callout">{f.ladder.steps[ladder].text}</p>
  </section>
  <div class="insight-grid">
   <section class="card insight pass"><h2>{t('ft.goodFor')}</h2><ul class="plain">{#each f.intro.goodFor as x}<li>{x}</li>{/each}</ul></section>
   <section class="card insight fail"><h2>{t('ft.badFor')}</h2><ul class="plain">{#each f.intro.badFor as x}<li>{x}</li>{/each}</ul></section>
   <section class="card insight neutral"><h2>{t('ft.benefits')}</h2><ul class="plain">{#each f.benefits as x}<li>{x}</li>{/each}</ul></section>
   <section class="card insight confirm"><h2>{t('architecture.limitations')}</h2><ul class="plain">{#each f.limitations as x}<li>{x}</li>{/each}</ul></section>
  </div>
 </div>
{:else if section === 'how'}
 <div class="arch-detail"><FtStages/></div>
{:else if section === 'lab'}
 <div class="arch-detail"><TuneLab/></div>
{:else if section === 'preference'}
 <div class="arch-detail"><DpoDemo/></div>
{:else if section === 'methods'}
 <DataTable rows={f.methods} columns={methodColumns} rowKey={(m) => m.id} searchable size="auto"/>
{:else if section === 'plan'}
 <div class="arch-detail">
  <section class="card"><h2>{t('ft.planTitle')}</h2><p class="note flush">{t('ft.planIntro')}</p>
   <div class="net-controls">
    <label class="field"><span>{t('ft.baseModel')}</span><select bind:value={slmId}>{#each plannable as s (s.id)}<option value={s.id}>{s.name} ({formatParams(s.params)})</option>{/each}</select></label>
    <label class="field"><span>{t('ft.method')}</span><select bind:value={method}>{#each planMethods as m}<option value={m}>{nameOf(m)}</option>{/each}</select></label>
    {#if method === 'lora' || method === 'qlora'}<label class="net-slider"><span>{t('ft.rank')}<b>{rank}</b></span><input type="range" min="4" max="64" step="4" bind:value={rank}/></label>{/if}
    <label class="net-slider"><span>{t('ft.batch')}<b>{batch}</b></span><input type="range" min="1" max="64" bind:value={batch}/></label>
    <label class="net-slider"><span>{t('ft.sequence')}<b>{sequence}</b></span><input type="range" min="128" max="4096" step="128" bind:value={sequence}/></label>
    <label class="net-slider"><span>{t('ft.planExamples')}<b>{examples.toLocaleString('en-US')}</b></span><input type="range" min="100" max="50000" step="100" bind:value={examples}/></label>
    <label class="net-slider"><span>{t('ft.epochs')}<b>{epochs}</b></span><input type="range" min="1" max="20" bind:value={epochs}/></label>
    <label class="net-toggle"><input type="checkbox" bind:checked={checkpointing}/> {t('ft.checkpointing')}</label>
   </div>
   <div class="size-tiles plan-tiles">
    <div><span>{t('ft.trainable')}</span><strong>{formatParams(plan.trainable)}</strong></div>
    <div><span>{t('ft.share')}</span><strong>{(plan.share * 100).toFixed(plan.share < .01 ? 3 : 1)}%</strong></div>
    <div><span>{t('ft.artifact')}</span><strong>{size(plan.adapterMiB)}</strong></div>
    <div class="tile-selected"><span>{t('ft.memory')}</span><strong>{formatGiB(plan.memoryGiB)}</strong></div>
   </div>
   <div class="card-grid">
    <section><h3>{t('ft.memoryBreakdown')}</h3><dl>
     <div><dt>{t('ft.baseWeights')}</dt><dd>{formatGiB(plan.baseGiB)}</dd></div>
     <div><dt>{t('ft.optimizer')}</dt><dd>{formatGiB(plan.optimizerGiB)}</dd></div>
     <div><dt>{t('ft.activations')}</dt><dd>{formatGiB(plan.activationGiB)}</dd></div>
     <div><dt>{t('ft.steps')}</dt><dd>{plan.steps.toLocaleString('en-US')}</dd></div>
     <div><dt>{t('ft.tokens')}</dt><dd>{plan.tokens.toLocaleString('en-US')}</dd></div>
    </dl></section>
    <section><h3>{t('ft.instances')}</h3><dl>{#each picks as p (p.cloud.id)}<div><dt>{p.cloud.name}</dt><dd>{#if p.pick}{p.pick.name}<small class="block-small">{p.pick.gpus} × {p.pick.gpu}, {formatGiB(p.pick.gpuMemoryGiB)}</small>{:else}{t('ft.noInstance')}{/if}</dd></div>{/each}</dl>
     <p class="note">{t('model.licence')}: <span class={`status ${commercialTone[slm.license.rule.commercial]}`}>{commercialLabel(slm.license.rule.commercial)}</span> {slm.license.rule.name} · <a href={`#/slm/${encodeURIComponent(slm.id)}`}>{t('ft.openModel')}</a></p>
    </section>
   </div>
   <p class="note">{t('ft.planFormula')}</p>
  </section>
 </div>
{:else}
 <div class="arch-detail">
  <div class="insight-grid">{#each f.risks as r (r.title)}<section class="card insight fail"><h2>{r.title}</h2><p>{r.text}</p>{#if r.source}<p class="note">{t('architecture.source')}: <a href={r.source.url} target="_blank" rel="noreferrer">{r.source.title}</a></p>{/if}</section>{/each}</div>
  <section class="card"><h2>{t('ft.checklist')} <span class="status confirm">{t('common.positionOf', {position: checked.size, total: f.checklist.length})}</span></h2>
   <div class="check-list">{#each f.checklist as c, i}<label class="check"><input type="checkbox" checked={checked.has(i)} on:change={() => toggleCheck(i)}/> {c}</label>{/each}</div>
  </section>
 </div>
{/if}
