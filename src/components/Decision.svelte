<script lang="ts">
 import DataTable from './DataTable.svelte';
 import {t} from '../lib/content';
 import {downloadCSV, downloadMarkdown, downloadPdf, downloadXlsx} from '../lib/exports';
 import type {Column} from '../lib/filters';
 import {buildRecord} from '../lib/report';
 import {decide, formatGiB, formatMoney, formatPct, safeUrl} from '../lib/selection';
 import {patchSelection} from '../lib/state';
 import type {CandidateOutcome, CheckStatus, Model, Selection} from '../lib/types';
 export let models: Model[];
 export let selection: Selection;
 let error = '', statusFilter = '';
 $: decision = decide(selection, models);
 $: w = decision.winner;
 const tone: Record<CandidateOutcome['status'], CheckStatus> = {qualified: 'pass', rejected: 'fail', incomplete: 'confirm'};
 const statuses: CandidateOutcome['status'][] = ['qualified', 'rejected', 'incomplete'];
 $: rows = decision.rows.filter(r => !statusFilter || r.status === statusFilter);
 $: columns = [
  {key: 'name', label: t('columns.model'), value: (r: CandidateOutcome) => r.model.name, href: (r: CandidateOutcome) => `#/model/${encodeURIComponent(r.id)}`},
  {key: 'status', label: t('columns.result'), value: (r: CandidateOutcome) => t(`outcome.${r.status}`), tone: (r: CandidateOutcome) => tone[r.status]},
  {key: 'license', label: t('columns.licence'), value: (r: CandidateOutcome) => r.model.license.rule.name, cellClass: 'license-cell'},
  {key: 'pass', label: t('columns.passRate'), numeric: true, value: (r: CandidateOutcome) => r.passRate, text: (r: CandidateOutcome) => formatPct(r.passRate)},
  {key: 'lower', label: t('columns.lower'), numeric: true, value: (r: CandidateOutcome) => r.lower, text: (r: CandidateOutcome) => formatPct(r.lower)},
  {key: 'memory', label: t('columns.memory'), numeric: true, value: (r: CandidateOutcome) => r.footprint.memoryGiB, text: (r: CandidateOutcome) => formatGiB(r.footprint.memoryGiB)},
  {key: 'gpus', label: t('columns.gpus'), numeric: true, value: (r: CandidateOutcome) => r.totalGpus, text: (r: CandidateOutcome) => r.hosting === 'api' ? t('decision.hosted') : String(r.totalGpus ?? '—')},
  {key: 'monthly', label: t('columns.monthly'), numeric: true, value: (r: CandidateOutcome) => r.monthlyCost, text: (r: CandidateOutcome) => formatMoney(r.monthlyCost)},
  {key: 'perSuccess', label: t('columns.perSuccess'), numeric: true, value: (r: CandidateOutcome) => r.costPerSuccess, text: (r: CandidateOutcome) => formatMoney(r.costPerSuccess, 4)},
  {key: 'reason', label: t('columns.reason'), cellClass: 'reason', value: (r: CandidateOutcome) => r.reasons.join('; ') || null},
 ] as Column[];
 function exportAs(run: (r: ReturnType<typeof buildRecord>) => void) {
  try { error = ''; run(buildRecord(selection, models)); } catch (e) { error = e instanceof Error ? e.message : String(e); }
 }
</script>
<header class="page-head"><div><p class="overline">{t('decision.overline')}</p><h1>{t('decision.title')}</h1><p>{t('decision.intro')}</p></div></header>
{#if decision.state === 'selected' && w}
 <section class="outcome selected"><p class="overline">{t('decision.selected')}</p><h2><a href={`#/model/${encodeURIComponent(w.id)}`}>{w.model.name}</a></h2>
  <div class="outcome-stats"><div><span>{t('decision.costPerSuccess')}</span><strong>{formatMoney(w.costPerSuccess, 4)}</strong></div><div><span>{t('decision.monthly')}</span><strong>{formatMoney(w.monthlyCost)}</strong></div><div><span>{t('decision.passRate')}</span><strong>{formatPct(w.passRate)}</strong></div><div><span>{t('decision.interval')}</span><strong>{t('decision.intervalValue', {lower: formatPct(w.lower), upper: formatPct(w.upper)})}</strong></div></div>
 </section>
 {#each decision.tradeoffs as x}<p class="callout spaced">{t('decision.tradeoff', {model: x.model, extra: formatMoney(x.extraMonthly)})}</p>{/each}
 <div class="card-grid decision-grid">
  <section class="card"><h2>{t('decision.infrastructure')}</h2><dl>
   <div><dt>{t('decision.hosting')}</dt><dd>{t(w.hosting === 'self' ? 'decision.selfHosted' : 'decision.hostedEndpoint')}</dd></div>
   <div><dt>{t('decision.weights')}</dt><dd>{w.model.weightSource === 'estimate' ? t('decision.estimate', {value: formatGiB(w.footprint.weightGiB)}) : formatGiB(w.footprint.weightGiB)}</dd></div>
   <div><dt>{t('decision.precision')}</dt><dd>{w.model.official?.storedPrecision || t('decision.notPublished')}</dd></div>
   <div><dt>{t('decision.memory')}</dt><dd>{formatGiB(w.footprint.memoryGiB)}</dd></div>
   {#if w.hosting === 'self'}<div><dt>{t('decision.replicas')}</dt><dd>{w.replicas}</dd></div><div><dt>{t('decision.gpusPerReplica')}</dt><dd>{w.footprint.gpusPerReplica}</dd></div><div><dt>{t('decision.totalGpus')}</dt><dd>{w.totalGpus}</dd></div>{/if}
  </dl></section>
  <section class="card"><h2>{t('decision.licence')} {#if w.licenseStatus === 'confirm'}<span class="status confirm">{t('decision.legalNeeded')}</span>{/if}</h2>
   <p class="license-name">{#if safeUrl(w.model.license.url)}<a href={safeUrl(w.model.license.url)} target="_blank" rel="noreferrer">{w.model.license.rule.name}</a>{:else}{w.model.license.rule.name}{/if}</p>
   <p>{w.model.license.rule.summary}</p>
   {#if w.model.license.rule.obligations.length}<h3>{t('decision.obligations')}</h3><ul class="plain">{#each w.model.license.rule.obligations as x}<li>{x}</li>{/each}</ul>{/if}
   {#if w.model.license.rule.restrictions?.length}<h3>{t('decision.restrictions')}</h3><ul class="plain">{#each w.model.license.rule.restrictions as x}<li>{x}</li>{/each}</ul>{/if}
  </section>
 </div>
{:else if decision.state === 'none'}
 <section class="outcome none"><h2>{t('decision.noneTitle')}</h2><p>{t('decision.noneBody')}</p></section>
{:else if decision.state === 'incomplete'}
 <section class="outcome pending"><h2>{t('decision.pendingTitle')}</h2><p>{decision.setupMissing.length ? t('decision.stillNeeded', {items: decision.setupMissing.join(', ')}) : t('decision.enterResults')} <a href="#/evaluation">{t('decision.goEvaluation')}</a></p></section>
{:else}
 <section class="outcome pending"><h2>{t('decision.emptyTitle')}</h2><p><a href="#/requirements">{t('decision.emptyLink')}</a></p></section>
{/if}
{#if decision.rows.length}<section class="section"><h2>{t('decision.comparison')}</h2>
 <DataTable {rows} {columns} rowKey={(r) => r.id} sortKey="perSuccess" size="auto" rowClass={(r) => w?.id === r.id ? 'winner' : ''}>
  <svelte:fragment slot="toolbar"><select aria-label={t('decision.resultFilter')} bind:value={statusFilter}><option value="">{t('decision.allResults')}</option>{#each statuses as s}<option value={s}>{t(`outcome.${s}`)}</option>{/each}</select></svelte:fragment>
 </DataTable>
</section>{/if}
<section class="card form-card"><h2>{t('decision.record')}</h2>
 <label class="field"><span>{t('decision.notes')}</span><textarea rows="3" value={selection.notes} on:input={e => patchSelection({notes: e.currentTarget.value})}></textarea></label>
 <div class="actions"><button class="btn primary" on:click={() => exportAs(downloadPdf)}>{t('decision.exportPdf')}</button><button class="btn" on:click={() => exportAs(downloadXlsx)}>{t('decision.exportExcel')}</button><button class="btn" on:click={() => exportAs(downloadCSV)}>{t('decision.exportCsv')}</button><button class="btn" on:click={() => exportAs(downloadMarkdown)}>{t('decision.exportMarkdown')}</button></div>
 {#if error}<p class="callout warn">{t('decision.exportFailed', {error})}</p>{/if}
</section>
