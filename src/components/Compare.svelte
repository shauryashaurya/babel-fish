<script lang="ts">
 import CompareDiagram from './CompareDiagram.svelte';
 import CompareExplained from './CompareExplained.svelte';
 import BarChart, {type BarRow} from './BarChart.svelte';
 import MiniChart, {type ChartSeries} from './MiniChart.svelte';
 import {infrastructure} from '../lib/infrastructure';
 import {allArchs, cacheGiB, compareContent, DIMENSIONS, fmtGiB, fmtKiB, fmtParams, fmtTokens, longRangeKiB, MODEL_LETTERS, MODEL_TONES, verdict, weightGiB, type Arch} from '../lib/compare';
 import {compareList, MAX_COMPARE, moveCompare, setCompare, toggleCompare} from '../lib/compareList';
 import {t} from '../lib/content';
 import type {Model} from '../lib/types';
 export let models: Model[];
 export let route = '';
 export let routeIds = '';
 export let routeSpec = '';
 export let backHref = '#/catalog';
 export let backLabel = '';

 const sections = ['diagram', 'differences', 'memory', 'table', 'explained'];
 const all = allArchs(models);
 let section = sections.includes(route) ? route : 'diagram';
 $: if (route && sections.includes(route)) section = route;
 // A shared link carries the model list; it replaces the saved list once.
 let appliedIds = '';
 $: if (routeIds && routeIds !== appliedIds && section !== 'explained') { appliedIds = routeIds; setCompare(routeIds.split(',').filter(id => all.some(a => a.id === id))); }

 $: items = $compareList.map(id => all.find(a => a.id === id)).filter((a): a is Arch => !!a);
 $: tone = (a: Arch) => MODEL_TONES[items.indexOf(a)];
 $: letter = (a: Arch) => MODEL_LETTERS[items.indexOf(a)];
 $: shareHash = `#/compare/${section}/${$compareList.map(encodeURIComponent).join(',')}`;
 function go(s: string) { section = s; history.replaceState(null, '', s === 'explained' ? '#/compare/explained' : `#/compare/${s}/${$compareList.map(encodeURIComponent).join(',')}`); }
 let copied = false;
 async function copyLink() {
  try { await navigator.clipboard.writeText(location.href.split('#')[0] + shareHash); copied = true; setTimeout(() => copied = false, 1800); } catch { copied = false; }
 }

 // Picker
 let query = '', source: 'all' | 'gallery' | 'slm' = 'all', open = false;
 $: q = query.trim().toLowerCase();
 $: matches = all.filter(a => (source === 'all' || a.kind === source) && (!q || `${a.name} ${a.publisher} ${a.family ?? ''} ${a.attentionType ?? ''}`.toLowerCase().includes(q))).slice(0, 14);
 const pick = (a: Arch) => { toggleCompare(a.id); query = ''; };
 /** Suggestions that make a useful first comparison: models from the same publisher as the first pick. */
 $: suggestions = items.length && items.length < MAX_COMPARE
  ? all.filter(a => a.publisher === items[0].publisher && !$compareList.includes(a.id) && a.kind === items[0].kind).slice(0, 4) : [];

 // Differences
 let onlyDiff = false;
 $: groups = compareContent.groups.map(g => ({...g, dims: DIMENSIONS.filter(d => d.group === g.id).map(d => ({d, v: verdict(d, items)})).filter(x => !onlyDiff || x.v === 'different')})).filter(g => g.dims.length);
 $: diffCount = DIMENSIONS.filter(d => verdict(d, items) === 'different').length;
 const maxOf = (vals: (number | null)[]) => Math.max(...vals.map(v => v ?? 0), 1e-9);

 // Memory
 let weightPrecision = 'published', cacheBits = 'bit16', sessions = 1, contextLog = 15;
 $: contextTokens = 2 ** contextLog;
 const xs = Array.from({length: 41}, (_, i) => 10 + i * .25);
 $: memSeries = items.map(a => {
  const w = weightGiB(a, weightPrecision) ?? 0, top = a.context ? Math.log2(a.context) : 20;
  const points = xs.filter(x => x <= top + 1e-9).map(x => [x, w + (cacheGiB(a, 2 ** x, cacheBits === 'bit8' ? 1 : 2) ?? 0) * sessions] as [number, number]);
  return {id: a.id, label: `${letter(a)} · ${a.name}`, tone: tone(a), points} as ChartSeries;
 });
 $: memMax = Math.max(1, ...memSeries.flatMap(s => s.points.map(p => p[1])));
 $: memMin = Math.min(memMax, ...memSeries.flatMap(s => s.points.map(p => p[1])).filter(v => v > 0));
 // A log scale keeps small models readable next to very large ones; it is chosen automatically when sizes differ by more than 20 times.
 let logChoice: boolean | null = null;
 $: logScale = logChoice ?? memMax / Math.max(memMin, 1e-6) > 10;
 $: breakdown = items.map(a => {
  const w = weightGiB(a, weightPrecision), c = cacheGiB(a, contextTokens, cacheBits === 'bit8' ? 1 : 2);
  const over = a.context !== null && contextTokens > a.context;
  return {a, w, c: c === null ? null : c * sessions, over};
 });
 const tokenLabel = (x: number) => fmtTokens(2 ** Math.round(x)) ?? '';
 const gib = (v: number | null) => fmtGiB(v) ?? '—';

 // GPU memory of listed cloud instances, from data/infrastructure/cloud_instances.json, as reference lines and a fit check.
 $: refCloud = infrastructure.clouds.find(c => c.id === compareContent.memoryReferences?.cloud);
 $: fleet = (refCloud?.instances ?? []).filter(i => !i.fractional).sort((a, b) => a.gpuMemoryGiB - b.gpuMemoryGiB);
 $: refLines = fleet.filter(i => compareContent.memoryReferences?.instances.includes(i.name)).map(i => ({y: i.gpuMemoryGiB, label: t('compare.refInstance', {cloud: refCloud?.name ?? '', name: i.name, gpus: i.gpus, gpu: i.gpu, mem: i.gpuMemoryGiB})}));
 const fitOf = (total: number) => fleet.find(i => i.gpuMemoryGiB >= total) ?? null;
 // Linear scale: stretch the top to the next reference line when it is close, so the chart shows the headroom.
 $: nextRef = refLines.find(r => r.y >= memMax);
 $: linearTop = nextRef && nextRef.y <= memMax * 2.5 ? nextRef.y * 1.06 : memMax * 1.08;

 $: rowsMemory = breakdown.map(r => {
  const total = (r.w ?? 0) + (r.c ?? 0), fit = fitOf(total);
  return {id: r.a.id, badge: letter(r.a), label: r.a.name, href: r.a.href, tone: tone(r.a), value: gib(total),
   segments: [{value: r.w ?? 0, style: 'solid', label: t('compare.legendWeights'), text: gib(r.w)}, {value: r.c ?? 0, style: 'light', label: t('compare.legendCache'), text: gib(r.c)}],
   note: [t('compare.weightsPlusCache', {w: gib(r.w), c: gib(r.c)}), fit ? t('compare.fitsOn', {name: fit.name, gpus: fit.gpus, gpu: fit.gpu, mem: fit.gpuMemoryGiB}) : refCloud ? t('compare.fitsNone', {cloud: refCloud.name}) : '', r.over ? t('compare.beyondContext', {context: fmtTokens(r.a.context) ?? ''}) : ''].filter(Boolean).join(' · ')} as BarRow;
 });
 $: rowsParams = items.map(a => {
  const total = a.totalParams ?? 0, active = a.activeParams ?? total;
  return {id: a.id, badge: letter(a), label: a.name, href: a.href, tone: tone(a), value: fmtParams(a.totalParams) ?? t('compare.notStated'),
   segments: [{value: active, style: 'solid', label: t('compare.legendActive'), text: fmtParams(active) ?? '—'}, {value: Math.max(0, total - active), style: 'light', label: t('compare.legendIdle'), text: fmtParams(total - active) ?? '—'}],
   note: a.activeParams ? t('compare.totalActive', {total: fmtParams(a.totalParams) ?? '—', active: fmtParams(a.activeParams) ?? '—', pct: (100 * a.activeParams / (a.totalParams || 1)).toFixed(1)}) : t('compare.denseNote')} as BarRow;
 });
 $: rowsKv = items.map(a => {
  const all = a.kvKiB ?? 0, long = longRangeKiB(a), windowed = long !== null && a.kvKiB && long < a.kvKiB;
  return {id: a.id, badge: letter(a), label: a.name, href: a.href, tone: tone(a), value: fmtKiB(a.kvKiB) ?? t('compare.notStated'),
   segments: [{value: windowed ? long! : all, style: 'solid', label: t('compare.legendLongRange'), text: fmtKiB(windowed ? long : all) ?? '—'}, {value: windowed ? all - long! : 0, style: 'light', label: t('compare.legendWindowOnly'), text: fmtKiB(windowed ? all - long! : 0) ?? '—'}],
   note: windowed ? t('compare.kvLongRange', {kib: fmtKiB(long) ?? '', w: a.cache?.windowSize?.toLocaleString('en-US') ?? ''}) : undefined} as BarRow;
 });

 // Headline figures for the current settings.
 $: totals = breakdown.map(r => ({a: r.a, total: (r.w ?? 0) + (r.c ?? 0), cache: r.c ?? 0, w: r.w ?? 0})).filter(x => x.total > 0);
 $: low = totals.length ? totals.reduce((m, x) => x.total < m.total ? x : m) : null;
 $: high = totals.length ? totals.reduce((m, x) => x.total > m.total ? x : m) : null;
 $: cacheTop = totals.length ? totals.reduce((m, x) => x.cache / x.total > m.cache / m.total ? x : m) : null;
 $: highFit = high ? fitOf(high.total) : null;
</script>

<nav class="page-nav" aria-label={t('compare.title')}>
 <a class="back-link" href={backHref}><span aria-hidden="true">←</span> {t('common.backTo', {target: backLabel})}</a>
 <div class="pager"><a class="btn small" href="#/catalog">{t('compare.browseCatalog')}</a><a class="btn small" href="#/slm">{t('compare.browseSmall')}</a><a class="btn small" href="#/architecture">{t('compare.browseArchitecture')}</a></div>
</nav>
<header class="page-head"><div><h1>{t('compare.title')}</h1><p>{compareContent.intro}</p></div>{#if items.length}<strong class="result-count">{t('compare.selectedCount', {n: items.length, max: MAX_COMPARE})}</strong>{/if}</header>
<div class="section-tabs page-tabs" role="tablist" aria-label={t('compare.title')}>
 {#each sections as s}<button role="tab" aria-selected={section === s} class:on={section === s} on:click={() => go(s)}>{t(`compare.tab_${s}`)}{s === 'differences' && items.length > 1 ? ` (${diffCount})` : ''}</button>{/each}
</div>

{#if section === 'explained'}
 <CompareExplained {all} {items} spec={routeSpec}/>
{:else}
 <section class="card compare-picker">
  <div class="cmp-chips">
   {#each items as a, i (a.id)}
    <div class="cmp-chip" style={`--tone: var(--s${tone(a)})`}>
     <b class="cmp-letter">{letter(a)}</b>
     <span><a href={a.href}>{a.name}</a><small>{a.publisher} · {t(a.kind === 'gallery' ? 'compare.kindGallery' : 'compare.kindSlm')}</small></span>
     <span class="cmp-chip-actions">
      <button class="icon-btn" disabled={i === 0} aria-label={t('compare.moveLeft', {name: a.name})} title={t('compare.moveLeft', {name: a.name})} on:click={() => moveCompare(a.id, -1)}>‹</button>
      <button class="icon-btn" disabled={i === items.length - 1} aria-label={t('compare.moveRight', {name: a.name})} title={t('compare.moveRight', {name: a.name})} on:click={() => moveCompare(a.id, 1)}>›</button>
      <button class="icon-btn" aria-label={t('compare.removeModel', {name: a.name})} title={t('compare.removeModel', {name: a.name})} on:click={() => toggleCompare(a.id)}>×</button>
     </span>
    </div>
   {/each}
   {#if items.length < MAX_COMPARE}<div class="cmp-chip empty-slot"><b class="cmp-letter">{MODEL_LETTERS[items.length]}</b><span>{t('compare.emptySlot')}</span></div>{/if}
  </div>
  <div class="cmp-search">
   <label class="field"><span>{t('compare.addModel')}</span>
    <input type="search" placeholder={t('compare.searchPlaceholder')} bind:value={query} disabled={items.length >= MAX_COMPARE} on:focus={() => open = true} on:input={() => open = true} on:keydown={e => { if (e.key === 'Escape') open = false; }} on:blur={() => setTimeout(() => open = false, 150)}/>
   </label>
   <label class="field"><span>{t('requirements.source')}</span>
    <select bind:value={source}><option value="all">{t('requirements.sourceAll', {count: all.length})}</option><option value="gallery">{t('requirements.sourceGallery')}</option><option value="slm">{t('requirements.sourceSlm')}</option></select>
   </label>
   <div class="cmp-actions">
    <button class="btn" disabled={!items.length} on:click={copyLink}>{t(copied ? 'compare.copied' : 'compare.copyLink')}</button>
    <button class="btn" disabled={!items.length} on:click={() => setCompare([])}>{t('compare.clear')}</button>
   </div>
   {#if open && items.length < MAX_COMPARE}
    <ul class="cmp-results" role="listbox" aria-label={t('compare.addModel')}>
     {#each matches as a (a.id)}
      {@const on = $compareList.includes(a.id)}
      <li><button role="option" aria-selected={on} class:on on:mousedown|preventDefault={() => pick(a)}>
       <span>{a.name}<small>{a.publisher} · {fmtParams(a.totalParams) ?? '—'} · {a.family ?? t('compare.notStated')}</small></span>
       <em>{t(a.kind === 'gallery' ? 'compare.kindGallery' : 'compare.kindSlm')}</em>
      </button></li>
     {:else}<li class="cmp-none">{t('common.noMatches')}</li>{/each}
    </ul>
   {/if}
  </div>
  {#if suggestions.length}
   <p class="cmp-suggest">{t('compare.suggest', {publisher: items[0].publisher})} {#each suggestions as s}<button class="chip" on:click={() => toggleCompare(s.id)}>+ {s.name}</button>{/each}</p>
  {/if}
 </section>

 {#if items.length < 1}
  <div class="empty">{t('compare.empty', {max: MAX_COMPARE})}</div>
 {:else if section === 'diagram'}
  <CompareDiagram {items}/>
 {:else if section === 'differences'}
  <div class="cmp-toolbar">
   <label class="net-toggle"><input type="checkbox" bind:checked={onlyDiff}/> {t('compare.onlyDifferences')}</label>
   <span class="note flush">{t('compare.diffSummary', {diff: diffCount, total: DIMENSIONS.length})}</span>
  </div>
  {#each groups as g (g.id)}
   <h2 class="cmp-group">{g.name}</h2>
   <div class="diff-grid" style={`--n: ${items.length}`}>
    {#each g.dims as {d, v} (d.id)}
     {@const values = items.map(a => d.num ? d.num(a) : null)}
     {@const top = maxOf(values)}
     <article class="diff-card">
      <header><h3>{t(d.label)}</h3><span class={`diff-badge ${v}`}>{t(`compare.verdict.${v}`)}</span></header>
      <div class="diff-values" style={`--cols: ${items.length}`}>
       {#each items as a, i (a.id)}
        {@const text = d.text(a)}
        <div class="diff-value" class:differs={v === 'different'} style={`--tone: var(--s${tone(a)})`}>
         <span class="diff-model"><b>{letter(a)}</b> {a.name}</span>
         {#if text !== null}<strong>{text}</strong>{:else}<span class="missing">{t('compare.notStated')}</span>{/if}
         {#if d.num && values[i] !== null}<i class="diff-bar"><i style={`width:${Math.max(2, 100 * (values[i] ?? 0) / top)}%`}></i></i>{/if}
         {#if d.note && d.note(a)}<small>{d.note(a)}</small>{/if}
        </div>
       {/each}
      </div>
      <a class="diff-explain" href={`#/compare/explained/${d.spec}`}>{t('compare.whatIsThis')}</a>
     </article>
    {/each}
   </div>
  {/each}
  <p class="note">{compareContent.tableNote}</p>
 {:else if section === 'memory'}
  <section class="card fit-card">
   <div class="net-controls">
    <label class="field"><span>{t('compare.weightPrecision')}</span><select bind:value={weightPrecision}><option value="published">{t('slm.precision.published')}</option><option value="bit16">{t('slm.precision.bit16')}</option><option value="bit8">{t('slm.precision.bit8')}</option><option value="bit4">{t('slm.precision.bit4')}</option></select></label>
    <label class="field"><span>{t('compare.cachePrecision')}</span><select bind:value={cacheBits}><option value="bit16">{t('slm.precision.bit16')}</option><option value="bit8">{t('slm.precision.bit8')}</option></select></label>
    <label class="net-slider"><span>{t('slm.sessions')}<b>{sessions}</b></span><input type="range" min="1" max="64" bind:value={sessions}/></label>
    <label class="net-slider"><span>{t('compare.contextUsed')}<b>{fmtTokens(contextTokens)}</b></span><input type="range" min="10" max="20" step="1" bind:value={contextLog}/></label>
   </div>
  </section>
  {#if low && high}
   <div class="kpi-strip" aria-label={t('compare.kpiAria', {context: fmtTokens(contextTokens) ?? '', sessions})}>
    {#if items.length > 1}
     <div><span>{t('compare.kpiLowest')}</span><strong>{gib(low.total)}</strong><small style={`--tone: var(--s${tone(low.a)})`}><b>{letter(low.a)}</b>{low.a.name}</small></div>
     <div><span>{t('compare.kpiHighest')}</span><strong>{gib(high.total)}</strong><small style={`--tone: var(--s${tone(high.a)})`}><b>{letter(high.a)}</b>{high.a.name}</small></div>
     <div><span>{t('compare.kpiSpread')}</span><strong>{(high.total / low.total).toFixed(1)}×</strong><small>{t('compare.kpiSpreadNote', {high: letter(high.a), low: letter(low.a)})}</small></div>
    {:else}
     <div><span>{t('compare.kpiTotal')}</span><strong>{gib(high.total)}</strong><small style={`--tone: var(--s${tone(high.a)})`}><b>{letter(high.a)}</b>{high.a.name}</small></div>
     <div><span>{t('compare.legendWeights')}</span><strong>{gib(high.w)}</strong><small>{t('compare.kpiShare', {pct: Math.round(100 * high.w / high.total)})}</small></div>
     <div><span>{t('compare.legendCache')}</span><strong>{gib(high.cache)}</strong><small>{t('compare.kpiShare', {pct: Math.round(100 * high.cache / high.total)})}</small></div>
    {/if}
    {#if items.length > 1 && cacheTop}
     <div><span>{t('compare.kpiCache')}</span><strong>{Math.round(100 * cacheTop.cache / cacheTop.total)}%</strong><small style={`--tone: var(--s${tone(cacheTop.a)})`}><b>{letter(cacheTop.a)}</b>{t('compare.kpiCacheNote', {name: cacheTop.a.name})}</small></div>
    {:else}
     <div><span>{t('compare.kpiFit')}</span><strong>{highFit ? highFit.gpuMemoryGiB + ' GiB' : '—'}</strong><small>{highFit ? t('compare.kpiFitNote', {name: highFit.name, gpus: highFit.gpus, gpu: highFit.gpu}) : t('compare.fitsNone', {cloud: refCloud?.name ?? ''})}</small></div>
    {/if}
   </div>
  {/if}
  <section class="card">
   <div class="chart-card-head">
    <div><h2>{t('compare.memoryCurve')}</h2><p>{t('compare.memorySub', {sessions, cloud: refCloud?.name ?? ''})}</p></div>
    <label class="net-toggle"><input type="checkbox" checked={logScale} on:change={e => logChoice = e.currentTarget.checked}/> {t('compare.logScale')}</label>
   </div>
   <MiniChart series={memSeries} height={340} xMin={10} xMax={20} yMin={logScale ? memMin / 1.5 : 0} yMax={logScale ? Math.max(memMax, nextRef && nextRef.y <= memMax * 2.5 ? nextRef.y : 0) * 1.3 : linearTop} log={logScale} xTicks={[10, 12, 14, 16, 18, 20]} xFormat={tokenLabel} format={v => fmtGiB(v) ?? ''} xLabel={t('compare.axisContext')} aria={t('compare.memoryCurve')} refs={refLines} markers={[{x: contextLog, label: t('compare.markerContext', {context: fmtTokens(contextTokens) ?? ''})}]}/>
   <p class="note">{compareContent.memoryNote}</p>
  </section>
  <div class="card-grid">
   <section class="card wide">
    <div class="chart-card-head"><div><h2>{t('compare.atContext', {context: fmtTokens(contextTokens) ?? '', sessions})}</h2><p>{t('compare.atContextSub')}</p></div></div>
    <BarChart rows={rowsMemory} format={v => v ? fmtGiB(v) ?? '' : '0'} legend={[{style: 'solid', label: t('compare.legendWeights')}, {style: 'light', label: t('compare.legendCache')}]} aria={t('compare.atContext', {context: fmtTokens(contextTokens) ?? '', sessions})}/>
    {#if refCloud}<p class="note">{t('compare.fitBasis', {cloud: refCloud.name})}</p>{/if}
   </section>
   <section class="card">
    <div class="chart-card-head"><div><h2>{t('compare.paramsTitle')}</h2><p>{t('compare.paramsSub')}</p></div></div>
    <BarChart rows={rowsParams} format={v => v ? fmtParams(v) ?? '' : '0'} legend={[{style: 'solid', label: t('compare.legendActive')}, {style: 'light', label: t('compare.legendIdle')}]} aria={t('compare.paramsTitle')}/>
   </section>
   <section class="card">
    <div class="chart-card-head"><div><h2>{t('compare.kvTitle')}</h2><p>{t('compare.kvSub')}</p></div></div>
    <BarChart rows={rowsKv} format={v => v ? fmtKiB(v) ?? '' : '0'} legend={[{style: 'solid', label: t('compare.legendLongRange')}, {style: 'light', label: t('compare.legendWindowOnly')}]} aria={t('compare.kvTitle')}/>
    <p class="note">{compareContent.cacheNote} <a href="#/compare/explained/cache">{t('compare.whatIsThis')}</a></p>
   </section>
  </div>
 {:else if section === 'table'}
  <div class="cmp-toolbar"><label class="net-toggle"><input type="checkbox" bind:checked={onlyDiff}/> {t('compare.onlyDifferences')}</label></div>
  <div class="table-wrap auto compare-table">
   <table>
    <thead><tr><th scope="col">{t('compare.spec')}</th>{#each items as a (a.id)}<th scope="col" style={`--tone: var(--s${tone(a)})`} class="cmp-th"><b>{letter(a)}</b> <a href={a.href}>{a.name}</a></th>{/each}</tr></thead>
    <tbody>
     {#each DIMENSIONS.filter(d => !onlyDiff || verdict(d, items) === 'different') as d (d.id)}
      {@const v = verdict(d, items)}
      <tr class:differs={v === 'different'}><th scope="row"><a href={`#/compare/explained/${d.spec}`}>{t(d.label)}</a></th>{#each items as a (a.id)}{@const text = d.text(a)}<td>{#if text !== null}{text}{#if d.note && d.note(a)}<small>{d.note(a)}</small>{/if}{:else}<span class="missing">{t('compare.notStated')}</span>{/if}</td>{/each}</tr>
     {/each}
     <tr><th scope="row">{t('compare.sources')}</th>{#each items as a (a.id)}<td><a href={a.sourceUrl} target="_blank" rel="noreferrer">{t(a.kind === 'gallery' ? 'compare.galleryPage' : 'compare.modelCard')}</a>{#if a.configUrl} · <a href={a.configUrl} target="_blank" rel="noreferrer">{t('compare.configFile')}</a>{/if}</td>{/each}</tr>
    </tbody>
   </table>
  </div>
  <p class="note">{compareContent.tableNote}</p>
 {/if}
{/if}
