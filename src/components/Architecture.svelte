<script lang="ts">
 import Concepts from './Concepts.svelte';
 import DataTable from './DataTable.svelte';
 import LayerStack from './LayerStack.svelte';
 import MathBlock from './MathBlock.svelte';
 import ModelDiagram from './ModelDiagram.svelte';
 import Network from './Network.svelte';
 import PlainEnglish from './PlainEnglish.svelte';
 import SizeInfrastructure from './SizeInfrastructure.svelte';
 import {details, families, familyAxes, FEED_FORWARD, hasMechanism, layerStack, mechanismGroups, mechanisms, mechanismsOf, type TechnicalDetail} from '../lib/architecture';
 import {fromModel, fromSlm} from '../lib/compare';
 import {t} from '../lib/content';
 import {explainers, slmAsModel, slms} from '../lib/learning';
 import type {Column} from '../lib/filters';
 import {commercialLabel, commercialTone, formatGiB, formatParams, formatTokens, safeUrl} from '../lib/selection';
 import {lastViewedModel, showInCatalog} from '../lib/state';
 import type {Model} from '../lib/types';
 export let models: Model[];
 export let kind = 'family';
 export let id = '';
 export let backHref: string | null = null;
 export let backLabel = '';
 export let exampleRoute = '';
 type Section = 'plain' | 'diagram' | 'network' | 'math' | 'engineering' | 'size' | 'models';
 const sections: {id: Section; label: string}[] = [{id: 'plain', label: 'architecture.tabPlain'}, {id: 'diagram', label: 'architecture.tabDiagram'}, {id: 'network', label: 'architecture.tabNetwork'}, {id: 'math', label: 'architecture.tabMath'}, {id: 'engineering', label: 'architecture.tabEngineering'}, {id: 'size', label: 'architecture.tabSize'}, {id: 'models', label: 'architecture.tabModels'}];
 const insightGroups: {key: keyof Omit<TechnicalDetail, 'math'>; label: string; tone: string}[] = [{key: 'strengths', label: 'architecture.strengths', tone: 'pass'}, {key: 'weaknesses', label: 'architecture.weaknesses', tone: 'fail'}, {key: 'limitations', label: 'architecture.limitations', tone: 'confirm'}, {key: 'caveats', label: 'architecture.caveats', tone: 'neutral'}];
 let section: Section = 'plain', exampleId = '', layer = 0, stage: 'sequence' | 'feedForward' = 'sequence', lastKey = '';
 $: tab = kind === 'mechanism' ? 'mechanism' : kind === 'concepts' ? 'concepts' : 'family';
 $: family = tab !== 'mechanism' ? families.find(f => f.id === id) || families[0] : null;
 $: mechanism = tab === 'mechanism' ? mechanisms.find(m => m.id === id) || mechanisms[0] : null;
 $: key = `${tab}:${family?.id || mechanism?.id}`;
 $: if (key !== lastKey) { lastKey = key; exampleId = exampleRoute; layer = 0; stage = 'sequence'; if (exampleRoute) { section = 'diagram'; revealDiagram(); } }
 let lastRoute = exampleRoute;
 $: if (exampleRoute !== lastRoute) { lastRoute = exampleRoute; if (exampleRoute) { exampleId = exampleRoute; section = 'diagram'; revealDiagram(); } }
 /** Arriving from a model's "Explore architecture" link: bring that model's diagram into view (after the app's own scroll to top). */
 function revealDiagram() { requestAnimationFrame(() => requestAnimationFrame(() => detailEl?.scrollIntoView({block: 'start'}))); }
 let detailEl: HTMLElement | undefined;
 $: detail = (family ? details.families[family.id] : details.mechanisms[mechanism!.id]) as TechnicalDetail;
 $: members = family ? models.filter(m => m.architecture.class === family!.name) : models.filter(m => hasMechanism(m, mechanism!.id));
 /** Small models not already in the gallery, offered as examples alongside the gallery members. */
 $: smallSlms = slms.filter(x => !x.galleryModelId && (family ? x.family === family.id : x.mechanisms.includes(mechanism!.id)));
 $: smallMembers = smallSlms.map(slmAsModel);
 $: example = [...members, ...smallMembers].find(m => m.id === exampleId) || members[0] || smallMembers[0];
 $: exampleSlm = example ? smallSlms.find(x => x.id === example!.id) ?? null : null;
 $: segments = exampleSlm ? fromSlm(exampleSlm).segments : example ? layerStack(example) : [];
 $: layerCells = segments.flatMap(s => Array.from({length: s.count}, () => s));
 $: segment = layerCells[Math.min(layer, Math.max(layerCells.length - 1, 0))];
 $: usesExperts = exampleSlm ? exampleSlm.mechanisms.includes('moe') : !!example && hasMechanism(example, 'moe');
 $: isFeedForwardLayer = !!segment && /\bFFN\b/i.test(segment.label);
 $: sequenceBlock = segment?.mechanism?.id ?? (isFeedForwardLayer ? FEED_FORWARD : family ? details.families[family.id].defaultBlock : '');
 $: blockId = !family ? mechanism!.id : stage === 'feedForward' ? (usesExperts ? 'moe' : FEED_FORWARD) : sequenceBlock;
 $: shownBlock = mechanisms.find(m => m.id === blockId);
 $: usedFallback = !!family && stage === 'sequence' && !!segment && !segment.mechanism && !isFeedForwardLayer;
 $: navItems = tab === 'family' ? families : tab === 'mechanism' ? mechanisms : [];
 $: plainItem = family ? explainers.families[family.id] : explainers.mechanisms[mechanism!.id];
 $: plainDemo = (family
  ? (usesExperts ? 'experts' : family.id === 'recurrent' ? null : 'kv')
  : mechanism!.id === 'moe' ? 'experts' : details.mechanisms[mechanism!.id].scene === 'attention' ? 'kv' : null) as 'kv' | 'experts' | null;
 const countFor = (itemId: string, currentTab: string) => currentTab === 'family'
  ? models.filter(m => m.architecture.class === families.find(f => f.id === itemId)?.name).length
  : models.filter(m => hasMechanism(m, itemId)).length;
 const labels = ['columns.model', 'model.layerMix', 'columns.parameters', 'columns.context', 'columns.weights', 'columns.commercial'];
 const baseColumns: Column[] = [
  {key: 'name', label: '', value: (m: Model) => m.name, href: (m: Model) => `#/model/${encodeURIComponent(m.id)}`, sub: (m: Model) => m.publisher},
  {key: 'mix', label: '', value: (m: Model) => m.architecture.layerMix, cellClass: 'reason'},
  {key: 'params', label: '', numeric: true, value: (m: Model) => m.totalParams, text: (m: Model) => formatParams(m.totalParams)},
  {key: 'context', label: '', numeric: true, value: (m: Model) => m.context, text: (m: Model) => formatTokens(m.context)},
  {key: 'weights', label: '', numeric: true, value: (m: Model) => m.weightGiB, text: (m: Model) => formatGiB(m.weightGiB)},
  {key: 'commercial', label: '', value: (m: Model) => commercialLabel(m.license.rule.commercial), tone: (m: Model) => commercialTone[m.license.rule.commercial]},
 ];
 $: tableColumns = baseColumns.map((c, i) => ({...c, label: t(labels[i])}));
 function openInCatalog() {
  lastViewedModel.set('');
  showInCatalog(family ? {family: [family.name]} : {mechanism: [mechanism!.id]});
 }
 function selectExample(modelId: string) {
  exampleId = modelId; layer = 0;
  if (family) history.replaceState(null, '', `#/architecture/family/${family.id}/${encodeURIComponent(modelId)}`);
 }
 $: diagramArch = exampleSlm ? fromSlm(exampleSlm) : example ? fromModel(example) : null;
 $: usedBlocks = exampleSlm ? exampleSlm.mechanisms.map(i => mechanisms.find(m => m.id === i)).filter((m): m is NonNullable<typeof m> => !!m) : example ? mechanismsOf(example) : [];
 const total = models.length;
 $: cellFamilies = (p: string, m: string) => families.filter(f => f.params === p && f.mixing === m);
 $: groupBlocks = (g: string) => mechanisms.filter(m => m.group === g);
</script>
{#if backHref}<nav class="page-nav" aria-label={t('architecture.title')}><a class="back-link" href={backHref}><span aria-hidden="true">←</span> {t('common.backTo', {target: backLabel})}</a></nav>{/if}
<header class="page-head"><div><h1>{t('architecture.title')}</h1><p>{t('architecture.intro')}</p></div></header>
<div class="section-tabs page-tabs arch-modes" role="tablist" aria-label={t('architecture.title')}>
 <a role="tab" aria-selected={tab === 'family'} class:on={tab === 'family'} href="#/architecture/family/dense">{t('architecture.families')}<small>{families.length}</small></a>
 <a role="tab" aria-selected={tab === 'mechanism'} class:on={tab === 'mechanism'} href={`#/architecture/mechanism/${mechanisms[0]?.id}`}>{t('architecture.blocks')}<small>{mechanisms.length}</small></a>
 <a role="tab" aria-selected={tab === 'concepts'} class:on={tab === 'concepts'} href="#/architecture/concepts">{t('architecture.concepts')}</a>
</div>
{#if tab === 'family'}
 <section class="family-map" aria-label={t('architecture.mapAria')}>
  <p class="map-question">{familyAxes.question}</p>
  <div class="fm-grid" style={`--cols: ${familyAxes.mixing.length}`}>
   <div class="fm-corner"><span>{t('architecture.axisParams')} ↓</span><span>{t('architecture.axisMixing')} →</span></div>
   {#each familyAxes.mixing as col (col.id)}<div class="fm-col-head"><b>{col.name}</b><small>{col.text}</small></div>{/each}
   {#each familyAxes.params as row (row.id)}
    <div class="fm-row-head"><b>{row.name}</b><small>{row.text}</small></div>
    {#each familyAxes.mixing as col (col.id)}
     <div class="fm-cell" data-label={`${row.name} · ${col.name}`}>
      {#each cellFamilies(row.id, col.id) as f (f.id)}{@const c = countFor(f.id, 'family')}<a class="fm-family" class:current={f.id === family?.id} aria-current={f.id === family?.id ? 'page' : undefined} href={`#/architecture/family/${f.id}`}><span>{f.name}</span><b>{c}</b><i style={`width: ${Math.max(2, 100 * c / Math.max(1, total))}%`}></i></a>{:else}<span class="fm-empty">{t('architecture.noFamily')}</span>{/each}
     </div>
    {/each}
   {/each}
  </div>
  <p class="note">{t('architecture.mapNote', {total})}</p>
 </section>
{:else if tab === 'mechanism'}
 <section class="block-map" aria-label={t('architecture.blocks')}>
  {#each mechanismGroups as g (g.id)}
   <div class="bm-group"><h3>{g.name}</h3><small>{g.text}</small>
    <div class="bm-list">{#each groupBlocks(g.id) as m (m.id)}<a class="fm-family" class:current={m.id === mechanism?.id} aria-current={m.id === mechanism?.id ? 'page' : undefined} href={`#/architecture/mechanism/${m.id}`}><span>{m.name}</span><b>{countFor(m.id, 'mechanism')}</b></a>{/each}</div>
   </div>
  {/each}
 </section>
{/if}
<div class="arch-detail" bind:this={detailEl}>
 {#if tab === 'concepts'}<Concepts/>{:else}
 <div class="arch-head">
  <div><p class="overline">{t(family ? 'architecture.selectedFamily' : 'architecture.selectedBlock')}</p><h2 class="arch-title">{family?.name || mechanism?.name}</h2><p>{family?.summary || mechanism?.summary}</p></div>
  <div class="arch-actions">
   {#if example}<label class="inline-select"><span>{t('architecture.exampleModel')}</span><select value={example.id} on:change={e => selectExample(e.currentTarget.value)}>{#if members.length}<optgroup label={t('architecture.galleryGroup', {n: members.length})}>{#each members as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</optgroup>{/if}{#if smallMembers.length}<optgroup label={t('architecture.smallGroup', {n: smallMembers.length})}>{#each smallMembers as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</optgroup>{/if}</select></label>{/if}
   <a class="btn small" href="#/catalog" on:click={openInCatalog}>{t('architecture.showInCatalog', {count: members.length})}</a>
  </div>
 </div>
 <div class="section-tabs" role="tablist" aria-label={t('architecture.sections')}>
  {#each sections as s (s.id)}<button role="tab" aria-selected={section === s.id} class:on={section === s.id} on:click={() => section = s.id}>{t(s.label)}</button>{/each}
 </div>
 {#if section === 'plain'}
  {#key key}<PlainEnglish item={plainItem} demo={plainDemo}/>{/key}
 {:else if section === 'diagram'}
  <section class="card">
   {#if diagramArch}<div class="card-title"><h2>{t('diagram.title', {name: diagramArch.name})}{#if exampleSlm} <span class="status confirm">{t('architecture.smallTag')}</span>{/if}</h2><a class="btn small" href={diagramArch.href}>{t('architecture.openCard')}</a></div><p class="note flush">{t('diagram.intro')}</p>{#key diagramArch.id}<ModelDiagram arch={diagramArch}/>{/key}{:else}<p class="empty">{t('architecture.noDiagram')}</p>{/if}
  </section>
 {:else if section === 'network'}
  <section class="card">
   {#if family && segments.length}
    <LayerStack {segments} bind:layer/>
    <div class="stage-bar">
     <div class="segmented" role="group" aria-label={t('architecture.stage')}>
      <button class:on={stage === 'sequence'} on:click={() => stage = 'sequence'}>{t('architecture.stageAttention')}</button>
      <button class:on={stage === 'feedForward'} on:click={() => stage = 'feedForward'}>{t('architecture.stageFeedForward')}</button>
     </div>
     <h3 class="block-name">{shownBlock?.name || t('architecture.feedForwardName')}</h3>
     {#if shownBlock}<a class="btn small" href={`#/architecture/mechanism/${shownBlock.id}`}>{t('architecture.openBlock', {name: shownBlock.name})}</a>{/if}
    </div>
    {#if usedFallback}<p class="note flush">{t('architecture.stackFallback')}</p>{/if}
   {:else if family}<p class="note flush">{t('architecture.noStack', {mix: example?.architecture.layerMix || '—'})}</p>{/if}
   {#if blockId}<Network {blockId} model={example ?? null}/>{/if}
   {#if example}<h3>{t('architecture.usedBlocks')}</h3>
    <div class="chips flush">{#each usedBlocks as b (b.id)}<a class="chip link" href={`#/architecture/mechanism/${b.id}`}>{b.name}</a>{/each}</div>{/if}
  </section>
 {:else if section === 'math'}
  <section class="card"><h2>{t('architecture.tabMath')}</h2><MathBlock items={detail.math}/></section>
 {:else if section === 'engineering'}
  <section class="card">
   <div class="fact-grid">
    <div><h3>{t('architecture.how')}</h3><p>{family?.how || mechanism?.how}</p></div>
    <div><h3>{t(family ? 'architecture.why' : 'architecture.helps')}</h3><p>{family?.why || mechanism?.helps}</p></div>
    <div><h3>{t('architecture.watch')}</h3><p>{family?.watch || mechanism?.watch}</p></div>
    {#if mechanism}<div><h3>{t('architecture.footprint')}</h3><p>{mechanism.footprint}</p></div>{/if}
   </div>
   {#if mechanism && safeUrl(mechanism.source.url)}<p class="note">{t('architecture.source')}: <a href={safeUrl(mechanism.source.url)} target="_blank" rel="noreferrer">{mechanism.source.title}</a></p>{/if}
  </section>
  <div class="insight-grid">
   {#each insightGroups as g (g.key)}<section class={`card insight ${g.tone}`}><h2>{t(g.label)}</h2><ul class="plain">{#each detail[g.key] as x}<li>{x}</li>{/each}</ul></section>{/each}
  </div>
 {:else if section === 'size' && example}
  <SizeInfrastructure {members} model={example} onSelect={selectExample}/>
 {:else if section === 'models'}
  <section class="section"><h2>{t('architecture.models')}</h2>
   {#key key}<DataTable rows={members} columns={tableColumns} rowKey={(m) => m.id} searchable sortKey="name" size="tall"/>{/key}
  </section>
 {/if}
 {/if}
</div>
