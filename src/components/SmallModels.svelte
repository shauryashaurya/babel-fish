<script lang="ts">
 import BarList from './BarList.svelte';
 import DataTable from './DataTable.svelte';
 import QuantLab from './QuantLab.svelte';
 import Scatter from './Scatter.svelte';
 import SlmCard from './SlmCard.svelte';
 import {mechanisms} from '../lib/architecture';
 import {exploreHref} from '../lib/explore';
 import {t} from '../lib/content';
 import type {Column} from '../lib/filters';
 import {decodeBound, deviceGiB, devices, FAMILY_NAMES, fineTuning, PRECISIONS, slmCacheGiB, slmMemory, slms, slmWeights, type Slm} from '../lib/learning';
 import {commercialLabel, commercialTone, formatGiB, formatParams, formatTokens} from '../lib/selection';
 import {facetLabel, filterSlms, fits, patchSlmFilters, slmView} from '../lib/slmView';
 import {compareList, MAX_COMPARE, toggleCompare} from '../lib/compareList';
 export let id = '';
 const guide = fineTuning.slmGuide, sections = ['candidates', 'landscape', 'deploy', 'quant', 'guide'];
 const contexts = [2048, 4096, 8192, 16384, 32768, 131072];
 const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
 const cid = (s: Slm) => s.galleryModelId ?? s.id;
 $: f = $slmView.filters;
 $: section = $slmView.section;
 const setSection = (s: string) => slmView.update(v => ({...v, section: s}));
 $: rows = filterSlms($slmView, $compareList);
 $: need = (s: Slm) => slmMemory(s, f.precision, f.context);
 $: fitCount = slms.filter(s => fits(s, f)).length;
 $: columns = [
  {key: 'compare', label: t('slm.colCompare'), sortable: false, value: () => null, text: (s: Slm) => t($compareList.includes(cid(s)) ? 'compare.inComparison' : 'compare.addToCompare'), action: {disabled: (s: Slm) => !$compareList.includes(cid(s)) && $compareList.length >= MAX_COMPARE, run: (s: Slm) => toggleCompare(cid(s))}},
  {key: 'rank', label: t('slm.colRank'), numeric: true, value: (s: Slm) => s.rank},
  {key: 'name', label: t('columns.model'), value: (s: Slm) => s.name, href: (s: Slm) => `#/slm/${encodeURIComponent(s.id)}`, sub: (s: Slm) => `${s.publisher} · ${t(`slm.purposes.${s.purpose}`)}`},
  {key: 'params', label: t('columns.parameters'), numeric: true, value: (s: Slm) => s.params, text: (s: Slm) => formatParams(s.params)},
  {key: 'family', label: t('slm.familyLabel'), value: (s: Slm) => s.family ? FAMILY_NAMES[s.family] : null, href: (s: Slm) => exploreHref(s.id), sub: (s: Slm) => s.architecture?.attention ?? ''},
  {key: 'memory', label: t('slm.colMemory'), numeric: true, value: (s: Slm) => need(s), text: (s: Slm) => formatGiB(need(s))},
  {key: 'fit', label: t('slm.colFits'), value: (s: Slm) => fits(s, f) ? 0 : 1, text: (s: Slm) => t(fits(s, f) ? 'slm.fits' : 'slm.tooLarge'), tone: (s: Slm) => fits(s, f) ? 'pass' : 'fail'},
  {key: 'context', label: t('columns.context'), numeric: true, value: (s: Slm) => s.context, text: (s: Slm) => formatTokens(s.context)},
  {key: 'cache', label: t('slm.colCache'), numeric: true, value: (s: Slm) => s.kvKiBPerToken, text: (s: Slm) => s.kvKiBPerToken === null ? '—' : `${s.kvKiBPerToken} KiB`},
  {key: 'license', label: t('columns.licence'), value: (s: Slm) => s.license.rule.name, cellClass: 'license-cell'},
  {key: 'commercial', label: t('columns.commercial'), value: (s: Slm) => commercialLabel(s.license.rule.commercial), tone: (s: Slm) => commercialTone[s.license.rule.commercial]},
  {key: 'downloads', label: t('slm.colDownloads'), numeric: true, value: (s: Slm) => s.downloads30d, text: (s: Slm) => compact(s.downloads30d)},
  {key: 'released', label: t('columns.released'), value: (s: Slm) => s.released, cellClass: 'nowrap'},
 ] as Column[];
 $: detail = id ? slms.find(s => s.id === id) : undefined;
 $: order = detail && rows.some(s => s.id === detail!.id) ? rows : slms;
 $: index = detail ? order.indexOf(detail) : -1;

 // Landscape
 let colorBy: 'family' | 'commercial' | 'purpose' = 'family';
 const palette = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'];
 const statusColor: Record<string, string> = {allowed: 'var(--pass)', conditional: 'var(--warn)', prohibited: 'var(--fail)', unverified: 'var(--s8)'};
 const groupOrder = {family: ['dense', 'sparse-moe', 'dense-hybrid', 'hybrid-moe', 'unknown'], commercial: ['allowed', 'conditional', 'prohibited', 'unverified'], purpose: ['instruct', 'base', 'reasoning', 'code', 'tools']};
 const groupKey = (s: Slm, by: typeof colorBy) => by === 'family' ? s.family ?? 'unknown' : by === 'commercial' ? s.license.rule.commercial : s.purpose;
 $: scatterGroups = groupOrder[colorBy].filter(g => rows.some(s => groupKey(s, colorBy) === g)).map(g => ({id: g, label: facetLabel(colorBy, g), color: colorBy === 'commercial' ? statusColor[g] : g === 'unknown' ? 'var(--s8)' : palette[groupOrder[colorBy].indexOf(g)]}));
 $: points = rows.map(s => ({id: s.id, x: s.params, y: Math.max(s.downloads30d, 1), group: groupKey(s, colorBy), label: s.name, detail: `${s.publisher} · ${formatParams(s.params)} · ${compact(s.downloads30d)} ${t('slm.downloadsShort')}`, href: `#/slm/${encodeURIComponent(s.id)}`}));
 const tally = (items: string[]) => [...items.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
 $: byPublisher = tally(rows.map(s => s.publisher)).slice(0, 12).map(([label, value]) => ({label, value}));
 $: byMechanism = tally(rows.flatMap(s => s.mechanisms)).map(([idm, value]) => ({label: mechanisms.find(m => m.id === idm)?.name ?? idm, value, href: `#/architecture/mechanism/${idm}`}));
 $: byYear = tally(rows.map(s => s.released?.slice(0, 4) ?? '—')).sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({label, value}));
 $: byContext = [[0, 4096, '≤ 4K'], [4097, 32768, '8K–32K'], [32769, 131072, '64K–128K'], [131073, 1e12, '> 128K']].map(([lo, hi, label]) => ({label: String(label), value: rows.filter(s => s.context !== null && s.context >= +lo && s.context <= +hi).length}))
  .concat([{label: t('slm.unknown'), value: rows.filter(s => s.context === null).length}]);
 $: byLicence = tally(rows.map(s => s.license.rule.name)).map(([label, value]) => ({label, value}));


 // Deployment
 let deviceId = devices.devices.find(d => d.id === 'macbook-pro-m6-32')?.id ?? devices.devices[0]?.id ?? 'custom', customMemory = 16, customBandwidth = 100, sessions = 1;
 $: device = deviceId === 'custom' ? {id: 'custom', name: t('slm.customDevice'), memoryGB: customMemory, bandwidthGBs: customBandwidth} : devices.devices.find(d => d.id === deviceId)!;
 $: deployRows = rows.map(s => ({s, need: slmMemory(s, f.precision, f.context, sessions), speed: decodeBound(s, f.precision, f.context, device)})).map(r => ({...r, fits: r.need <= deviceGiB(device)}));
 $: deployColumns = [
  {key: 'name', label: t('columns.model'), value: (r: typeof deployRows[number]) => r.s.name, href: (r: typeof deployRows[number]) => `#/slm/${encodeURIComponent(r.s.id)}`, sub: (r: typeof deployRows[number]) => `${r.s.publisher} · ${formatParams(r.s.params)}`},
  {key: 'need', label: t('slm.colMemory'), numeric: true, value: (r: typeof deployRows[number]) => r.need, text: (r: typeof deployRows[number]) => formatGiB(r.need)},
  {key: 'fit', label: t('slm.colFits'), value: (r: typeof deployRows[number]) => r.fits ? 0 : 1, text: (r: typeof deployRows[number]) => t(r.fits ? 'slm.fits' : 'slm.tooLarge'), tone: (r: typeof deployRows[number]) => r.fits ? 'pass' : 'fail'},
  {key: 'speed', label: t('slm.speedBound'), numeric: true, value: (r: typeof deployRows[number]) => r.fits ? r.speed : null, text: (r: typeof deployRows[number]) => r.fits ? t('slm.tokensPerSecond', {value: r.speed >= 100 ? r.speed.toFixed(0) : r.speed.toFixed(1)}) : '—'},
  {key: 'commercial', label: t('columns.commercial'), value: (r: typeof deployRows[number]) => commercialLabel(r.s.license.rule.commercial), tone: (r: typeof deployRows[number]) => commercialTone[r.s.license.rule.commercial]},
 ] as Column[];
 $: deployFit = deployRows.filter(r => r.fits).length;
</script>
{#if id}
 {#if detail}
  <SlmCard slm={detail} prevId={index > 0 ? order[index - 1].id : null} nextId={index >= 0 && index < order.length - 1 ? order[index + 1].id : null} position={index + 1} total={order.length}/>
 {:else}<div class="empty">{t('model.notFound')} <a href="#/slm">{t('slm.back')}</a></div>{/if}
{:else}
 <header class="page-head"><div><h1>{t('slm.title')}</h1><p>{guide.what}</p></div><div class="arch-actions"><strong class="result-count">{t('common.shownOf', {shown: rows.length, total: slms.length})}</strong>{#if $compareList.length}<a class="btn" href="#/compare/diagram">{t('compare.openCompare', {n: $compareList.length})}</a>{/if}</div></header>
 <div class="section-tabs page-tabs" role="tablist" aria-label={t('slm.title')}>
  {#each sections as s}<button role="tab" aria-selected={section === s} class:on={section === s} on:click={() => setSection(s)}>{t(`slm.tab_${s}`)}</button>{/each}
 </div>
 {#if section === 'candidates' || section === 'deploy'}
  <section class="card fit-card">
   <div class="net-controls">
    {#if section === 'candidates'}<label class="net-slider"><span>{t('slm.memory')}<b>{t('slm.memoryValue', {value: f.memory})}</b></span><input type="range" min="2" max="256" step="2" value={f.memory} on:input={e => patchSlmFilters({memory: +e.currentTarget.value})}/></label>{/if}
    {#if section === 'deploy'}
     <label class="field"><span>{t('slm.device')}</span><select bind:value={deviceId}>{#each devices.devices as d (d.id)}<option value={d.id}>{d.name}</option>{/each}<option value="custom">{t('slm.customDevice')}</option></select></label>
     {#if deviceId === 'custom'}
      <label class="net-slider"><span>{t('slm.deviceMemory')}<b>{t('slm.gbValue', {value: customMemory})}</b></span><input type="range" min="2" max="256" step="2" bind:value={customMemory}/></label>
      <label class="net-slider"><span>{t('slm.bandwidth')}<b>{t('slm.gbsValue', {value: customBandwidth})}</b></span><input type="range" min="10" max="5000" step="10" bind:value={customBandwidth}/></label>
     {/if}
     <label class="net-slider"><span>{t('slm.sessions')}<b>{sessions}</b></span><input type="range" min="1" max="32" bind:value={sessions}/></label>
    {/if}
    <label class="field"><span>{t('slm.contextControl')}</span><select value={f.context} on:change={e => patchSlmFilters({context: +e.currentTarget.value})}>{#each contexts as c}<option value={c}>{formatTokens(c)}</option>{/each}</select></label>
    <label class="field"><span>{t('slm.precisionControl')}</span><select value={f.precision} on:change={e => patchSlmFilters({precision: e.currentTarget.value})}>{#each PRECISIONS as p}<option value={p.id}>{t(`slm.precision.${p.id}`)}</option>{/each}</select></label>
    {#if section === 'candidates'}<label class="net-toggle"><input type="checkbox" checked={f.fitsOnly} on:change={e => patchSlmFilters({fitsOnly: e.currentTarget.checked})}/> {t('slm.fitsOnly')}</label>{/if}
   </div>
   {#if section === 'candidates'}<p class="note">{t('slm.fitCount', {count: fitCount, total: slms.length, memory: f.memory})} {guide.fitNote}</p>
   {:else if section === 'deploy'}<p class="note">{t('slm.deployCount', {count: deployFit, total: rows.length, device: device.name, memory: device.memoryGB, bandwidth: device.bandwidthGBs})} {guide.deployNote}</p>{/if}
  </section>
 {/if}
 {#if section === 'candidates'}
  <DataTable {rows} {columns} rowKey={(s) => s.id} searchable sortKey={$slmView.sortKey} ascending={$slmView.ascending} empty={t('catalog.noResults')}/>
  <p class="note">{guide.rankingNote}</p>
 {:else if section === 'landscape'}
  <div class="arch-detail">
   <section class="card"><h2>{t('slm.scatterTitle')}</h2>
    <div class="net-controls"><label class="field"><span>{t('slm.colorBy')}</span><select bind:value={colorBy}><option value="family">{t('slm.facet.family')}</option><option value="commercial">{t('slm.facet.commercial')}</option><option value="purpose">{t('slm.facet.purpose')}</option></select></label></div>
    <Scatter {points} groups={scatterGroups} xLabel={t('slm.axisParams')} yLabel={t('slm.axisDownloads')} aria={t('slm.scatterTitle')} format={v => v >= 1e9 ? `${v / 1e9}B` : v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}K` : String(v)}/>
    <p class="note">{t('slm.scatterNote')}</p>
   </section>
   <div class="card-grid">
    <section class="card"><h2>{t('slm.byPublisher')}</h2><BarList rows={byPublisher}/></section>
    <section class="card"><h2>{t('slm.byMechanism')}</h2><BarList rows={byMechanism}/></section>
    <section class="card"><h2>{t('slm.byContext')}</h2><BarList rows={byContext}/></section>
    <section class="card"><h2>{t('slm.byYear')}</h2><BarList rows={byYear}/></section>
    <section class="card wide"><h2>{t('slm.byLicence')}</h2><BarList rows={byLicence}/></section>
   </div>
   <p class="note">{t('slm.landscapeNote')}</p>
  </div>
 {:else if section === 'deploy'}
  <DataTable rows={deployRows} columns={deployColumns} rowKey={(r) => r.s.id} searchable sortKey="speed" ascending={false} empty={t('catalog.noResults')}/>
  <section class="card"><h2>{t('slm.speedHow')}</h2><p>{t('slm.speedExplain')}</p><p class="note">{t('slm.devicesSource', {date: devices.retrievedOn})} {devices.basis}</p></section>
 {:else if section === 'quant'}
  <div class="arch-detail"><QuantLab/></div>
 {:else}
  <section class="card plain-card"><p class="plain-analogy"><span>{t('plain.imagine')}</span> {guide.analogy}</p><p class="callout">{guide.pattern}</p><p class="note">{t('architecture.source')}: <a href={guide.source.url} target="_blank" rel="noreferrer">{guide.source.title}</a></p></section>
  <div class="insight-grid">
   <section class="card insight pass"><h2>{t('architecture.strengths')}</h2><ul class="plain">{#each guide.strengths as x}<li>{x}</li>{/each}</ul></section>
   <section class="card insight fail"><h2>{t('architecture.weaknesses')}</h2><ul class="plain">{#each guide.weaknesses as x}<li>{x}</li>{/each}</ul></section>
   <section class="card insight neutral"><h2>{t('slm.useWhen')}</h2><ul class="plain">{#each guide.useWhen as x}<li>{x}</li>{/each}</ul></section>
   <section class="card insight confirm"><h2>{t('slm.avoidWhen')}</h2><ul class="plain">{#each guide.avoidWhen as x}<li>{x}</li>{/each}</ul></section>
  </div>
  <section class="card"><h2>{t('slm.patternsTitle')}</h2><div class="concept-grid">{#each guide.patterns as p (p.title)}<div class="concept"><h3>{p.title}</h3><p>{p.text}</p></div>{/each}</div></section>
 {/if}
{/if}
