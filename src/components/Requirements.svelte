<script lang="ts">
 import DataTable from './DataTable.svelte';
 import NumberField from './NumberField.svelte';
 import {t} from '../lib/content';
 import {familyHref, type Column} from '../lib/filters';
 import {assessModel, commercialLabel, commercialTone, formatGiB, MAX_CANDIDATES, regionLabel, REGIONS, statusLabel} from '../lib/selection';
 import {patchSelection, toggleCandidate} from '../lib/state';
 import {isSlmId} from '../lib/learning';
 import type {Assessment, CheckStatus, CommercialStatus, Model, Selection} from '../lib/types';
 export let models: Model[];
 export let selection: Selection;
 let resultFilter = '', licenceFilter = '', reasonFilter = '', source = '';
 const commercialStatuses: CommercialStatus[] = ['allowed', 'conditional', 'prohibited', 'unverified'];
 const resultStatuses: CheckStatus[] = ['pass', 'confirm'];
 $: pool = models.filter(m => !source || (source === 'slm') === isSlmId(m.id));
 $: assessed = pool.map(m => assessModel(m, selection));
 $: meets = assessed.filter(a => a.status === 'pass');
 $: confirm = assessed.filter(a => a.status === 'confirm');
 $: excluded = assessed.filter(a => a.status === 'fail');
 $: shortlist = [...meets, ...confirm].filter(a => (!resultFilter || a.status === resultFilter) && (!licenceFilter || a.model.license.rule.commercial === licenceFilter));
 $: reasons = [...new Map(excluded.flatMap(a => a.checks.filter(c => c.status === 'fail')).map(c => [c.id, c.label])).entries()];
 $: excludedRows = excluded.filter(a => !reasonFilter || a.checks.some(c => c.status === 'fail' && c.id === reasonFilter));
 $: publishers = [...new Set(models.map(m => m.publisher))].sort((a, b) => a.localeCompare(b));
 $: countries = [...new Set(models.map(m => m.country).filter((c): c is string => !!c))].sort();
 const toggled = <T,>(list: T[], item: T) => list.includes(item) ? list.filter(x => x !== item) : [...list, item];
 const nameColumn: Column = {key: 'name', label: '', value: (a: Assessment) => a.model.name, href: (a: Assessment) => `#/model/${encodeURIComponent(a.model.id)}`, sub: (a: Assessment) => isSlmId(a.model.id) ? `${a.model.publisher} · ${t('requirements.smallModel')}` : a.model.publisher};
 $: shortlistColumns = [
  {...nameColumn, label: t('columns.model')},
  {key: 'family', label: t('columns.architecture'), value: (a: Assessment) => a.model.architecture.class, href: (a: Assessment) => familyHref(a.model)},
  {key: 'result', label: t('columns.result'), value: (a: Assessment) => statusLabel(a.status), tone: (a: Assessment) => a.status},
  {key: 'license', label: t('columns.licence'), value: (a: Assessment) => a.model.license.rule.name, cellClass: 'license-cell'},
  {key: 'commercial', label: t('columns.commercial'), value: (a: Assessment) => commercialLabel(a.model.license.rule.commercial), tone: (a: Assessment) => commercialTone[a.model.license.rule.commercial]},
  {key: 'weights', label: t('columns.weights'), numeric: true, value: (a: Assessment) => a.footprint.weightGiB, text: (a: Assessment) => formatGiB(a.footprint.weightGiB)},
  {key: 'memory', label: t('columns.memory'), numeric: true, value: (a: Assessment) => a.footprint.memoryGiB, text: (a: Assessment) => formatGiB(a.footprint.memoryGiB)},
  {key: 'gpus', label: t('columns.gpus'), numeric: true, value: (a: Assessment) => a.footprint.gpusPerReplica},
  {key: 'confirm', label: t('columns.toConfirm'), cellClass: 'reason', value: (a: Assessment) => a.checks.filter(c => c.status === 'confirm').map(c => c.detail).join('; ') || null},
  {key: 'candidate', label: t('columns.candidate'), sortable: false, value: () => null, text: (a: Assessment) => t(selection.candidates.includes(a.model.id) ? 'common.remove' : 'common.add'), action: {disabled: (a: Assessment) => !selection.candidates.includes(a.model.id) && selection.candidates.length >= MAX_CANDIDATES, run: (a: Assessment) => toggleCandidate(a.model.id)}},
 ] as Column[];
 $: excludedColumns = [
  {...nameColumn, label: t('columns.model')},
  {key: 'reason', label: t('columns.reason'), cellClass: 'reason', value: (a: Assessment) => a.checks.filter(c => c.status === 'fail').map(c => t('requirements.reasonDetail', {label: c.label, detail: c.detail})).join('; ')},
 ] as Column[];
</script>
<header class="page-head"><div><p class="overline">{t('requirements.overline')}</p><h1>{t('requirements.title')}</h1><p>{t('requirements.intro')}</p></div></header>
<section class="card form-card"><h2>{t('requirements.useCaseSection')}</h2><div class="form-grid">
 <label class="field span-2"><span>{t('requirements.useCase')}</span><input value={selection.useCase} on:input={e => patchSelection({useCase: e.currentTarget.value})}/></label>
 <label class="field span-2"><span>{t('requirements.preparedBy')}</span><input value={selection.preparedBy} on:input={e => patchSelection({preparedBy: e.currentTarget.value})}/></label>
 <NumberField label={t('requirements.minContext')} value={selection.minContext} min={1} onChange={v => patchSelection({minContext: v})}/>
 <label class="check form-check"><input type="checkbox" checked={selection.needsVision} on:change={e => patchSelection({needsVision: e.currentTarget.checked})}/> {t('requirements.needsVision')}</label>
</div></section>
<section class="card form-card"><h2>{t('requirements.licenceSection')}</h2><div class="form-grid">
 <label class="check form-check"><input type="checkbox" checked={selection.commercialUse} on:change={e => patchSelection({commercialUse: e.currentTarget.checked, offersMaaS: e.currentTarget.checked && selection.offersMaaS})}/> {t('requirements.commercialUse')}</label>
 <label class="check form-check"><input type="checkbox" disabled={!selection.commercialUse} checked={selection.offersMaaS} on:change={e => patchSelection({offersMaaS: e.currentTarget.checked})}/> {t('requirements.maas')}</label>
 <NumberField label={t('requirements.revenue')} hint={t('requirements.revenueHint')} value={selection.annualRevenueUsd} onChange={v => patchSelection({annualRevenueUsd: v})}/>
 <NumberField label={t('requirements.users')} hint={t('requirements.usersHint')} value={selection.monthlyActiveUsers} onChange={v => patchSelection({monthlyActiveUsers: v})}/>
</div>
<fieldset class="inline-set"><legend>{t('requirements.operatingIn')}</legend>{#each REGIONS as r}<label class="check"><input type="checkbox" checked={selection.regions.includes(r)} on:change={() => patchSelection({regions: toggled(selection.regions, r)})}/> {regionLabel(r)}</label>{/each}</fieldset>
<p class="note">{t('requirements.regionsNote')}</p>
</section>
<section class="card form-card"><h2>{t('requirements.infrastructure')}</h2><div class="form-grid">
 <NumberField label={t('requirements.gpuMemory')} value={selection.gpuMemoryGiB} min={1} onChange={v => patchSelection({gpuMemoryGiB: v})}/>
 <NumberField label={t('requirements.gpuCount')} value={selection.gpuCount} min={1} onChange={v => patchSelection({gpuCount: v === null ? null : Math.floor(v)})}/>
 <NumberField label={t('requirements.sessions')} value={selection.concurrentSessions} min={1} onChange={v => patchSelection({concurrentSessions: Math.floor(v ?? 1)})}/>
 <NumberField label={t('requirements.headroom')} hint={t('requirements.headroomHint')} value={selection.headroomPct} onChange={v => patchSelection({headroomPct: v ?? 0})}/>
</div></section>
<section class="card form-card"><h2>{t('requirements.sourcing')}</h2>
 <details class="publisher-picker first"><summary>{t('requirements.excludedCountries', {count: selection.excludedCountries.length})}</summary><div class="check-grid">{#each countries as c}<label class="check"><input type="checkbox" checked={selection.excludedCountries.includes(c)} on:change={() => patchSelection({excludedCountries: toggled(selection.excludedCountries, c)})}/> {c}</label>{/each}</div></details>
 <details class="publisher-picker"><summary>{t('requirements.excludedPublishers', {count: selection.excludedPublishers.length})}</summary><div class="check-grid">{#each publishers as p}<label class="check"><input type="checkbox" checked={selection.excludedPublishers.includes(p)} on:change={() => patchSelection({excludedPublishers: toggled(selection.excludedPublishers, p)})}/> {p}</label>{/each}</div></details>
</section>
<div class="source-row"><label class="field"><span>{t('requirements.source')}</span><select bind:value={source}><option value="">{t('requirements.sourceAll', {count: models.length})}</option><option value="gallery">{t('requirements.sourceGallery')}</option><option value="slm">{t('requirements.sourceSlm')}</option></select></label><p class="note">{t('requirements.sourceNote')}</p></div>
<div class="kpis" aria-label={t('requirements.screening')}>
 <div><strong>{meets.length}</strong><span>{t('requirements.kpiMeets')}</span></div>
 <div><strong>{confirm.length}</strong><span>{t('requirements.kpiConfirm')}</span></div>
 <div><strong>{excluded.length}</strong><span>{t('requirements.kpiExcluded')}</span></div>
 <div><strong>{selection.candidates.length} / {MAX_CANDIDATES}</strong><span>{t('requirements.kpiCandidates')}</span></div>
</div>
<section class="section"><div class="section-head"><h2>{t('requirements.shortlist')}</h2><a class="btn primary" href="#/evaluation">{t('requirements.continue')}</a></div>
 <DataTable rows={shortlist} columns={shortlistColumns} rowKey={(a) => a.model.id} searchable sortKey="memory" size="short" empty={t('requirements.emptyShortlist')}>
  <svelte:fragment slot="toolbar">
   <select aria-label={t('requirements.resultFilter')} bind:value={resultFilter}><option value="">{t('requirements.allResults')}</option>{#each resultStatuses as s}<option value={s}>{statusLabel(s)}</option>{/each}</select>
   <select aria-label={t('requirements.licenceFilter')} bind:value={licenceFilter}><option value="">{t('requirements.allLicences')}</option>{#each commercialStatuses as s}<option value={s}>{commercialLabel(s)}</option>{/each}</select>
  </svelte:fragment>
 </DataTable>
</section>
{#if excluded.length}<details class="section excluded"><summary>{t('requirements.whyExcluded', {count: excluded.length})}</summary>
 <DataTable rows={excludedRows} columns={excludedColumns} rowKey={(a) => a.model.id} searchable sortKey="name" size="short">
  <svelte:fragment slot="toolbar"><select aria-label={t('requirements.reasonFilter')} bind:value={reasonFilter}><option value="">{t('requirements.allReasons')}</option>{#each reasons as r}<option value={r[0]}>{r[1]}</option>{/each}</select></svelte:fragment>
 </DataTable>
</details>{/if}
