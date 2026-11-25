<script lang="ts">
 import DataTable from './DataTable.svelte';
 import {compareList, MAX_COMPARE, toggleCompare} from '../lib/compareList';
 import {t} from '../lib/content';
 import {familyHref, filterChips, sortValue, visibleModels, type Column, type SortKey} from '../lib/filters';
 import {commercialTone, formatGiB, formatParams, formatTokens, hasRequirements, MAX_CANDIDATES, statusLabel} from '../lib/selection';
 import {catalogView, clearFilters, lastViewedModel, setFilters, toggleCandidate} from '../lib/state';
 import type {Assessment, Model, Selection} from '../lib/types';
 import {planner, tokensText} from '../lib/finops';
 function planCost(id: string) { planner.update(s => s.models.includes(id) ? s : {...s, models: [...s.models, id]}); location.hash = '#/cost'; }
 export let models: Model[];
 export let selection: Selection;
 $: rows = visibleModels(models, selection, $catalogView);
 $: chips = filterChips($catalogView.filters);
 const by = (key: SortKey) => (a: Assessment) => sortValue(a, key);
 $: columns = [
  {key: 'name', label: t('columns.model'), value: by('name'), href: (a: Assessment) => `#/model/${encodeURIComponent(a.model.id)}`},
  {key: 'publisher', label: t('columns.publisher'), value: by('publisher')},
  {key: 'released', label: t('columns.released'), value: by('released'), cellClass: 'nowrap'},
  {key: 'family', label: t('columns.architecture'), value: by('family'), text: (a: Assessment) => a.model.access === 'api' ? t('api.familyCell') : a.model.architecture.class ?? '', href: (a: Assessment) => familyHref(a.model), cellClass: 'family-cell'},
  {key: 'params', label: t('columns.parameters'), numeric: true, value: by('params'), text: (a: Assessment) => formatParams(a.model.totalParams)},
  {key: 'context', label: t('columns.context'), numeric: true, value: by('context'), text: (a: Assessment) => a.model.access === 'api' && a.model.context ? tokensText(a.model.context) : formatTokens(a.model.context)},
  {key: 'weights', label: t('columns.weights'), numeric: true, value: by('weights'), text: (a: Assessment) => formatGiB(a.model.weightGiB)},
  {key: 'license', label: t('columns.licence'), value: by('license'), cellClass: 'license-cell'},
  {key: 'commercial', label: t('columns.commercial'), value: by('commercial'), tone: (a: Assessment) => commercialTone[a.model.license.rule.commercial]},
  ...(hasRequirements(selection) ? [{key: 'requirement', label: t('columns.requirements'), sortable: false, value: (a: Assessment) => statusLabel(a.status), tone: (a: Assessment) => a.status}] : []),
  {key: 'compare', label: t('slm.colCompare'), sortable: false, value: () => null, text: (a: Assessment) => a.model.access === 'api' ? t('api.noArchitecture') : t($compareList.includes(a.model.id) ? 'compare.inComparison' : 'compare.addToCompare'), action: {disabled: (a: Assessment) => a.model.access === 'api' || !$compareList.includes(a.model.id) && $compareList.length >= MAX_COMPARE, run: (a: Assessment) => toggleCompare(a.model.id)}},
  {key: 'candidate', label: t('columns.candidate'), sortable: false, value: () => null, text: (a: Assessment) => a.model.access === 'api' ? t('api.planCost') : t(selection.candidates.includes(a.model.id) ? 'common.remove' : 'common.add'), action: {disabled: (a: Assessment) => a.model.access !== 'api' && !selection.candidates.includes(a.model.id) && selection.candidates.length >= MAX_CANDIDATES, run: (a: Assessment) => a.model.access === 'api' ? planCost(a.model.id) : toggleCandidate(a.model.id)}},
 ] as Column[];

 const onSort = (key: string, ascending: boolean) => catalogView.update(v => ({...v, sortKey: key as SortKey, ascending}));
</script>
<header class="page-head"><div><h1>{t('catalog.title')}</h1><p>{t('catalog.intro', {total: models.length, gallery: models.filter(m => m.access !== 'api').length, api: models.filter(m => m.access === 'api').length})}</p></div><div class="arch-actions"><strong class="result-count">{t('common.shownOf', {shown: rows.length, total: models.length})}</strong>{#if $compareList.length}<a class="btn" href="#/compare/diagram">{t('compare.openCompare', {n: $compareList.length})}</a>{/if}</div></header>
{#if chips.length}
 <div class="chips">
  {#each chips as c (c.label)}<button class="chip" aria-label={t('common.removeFilter', {label: c.label})} on:click={() => setFilters(c.clear($catalogView.filters))}>{c.label}<span aria-hidden="true">×</span></button>{/each}
  <button class="link-btn" on:click={clearFilters}>{t('common.clearAll')}</button>
 </div>
{/if}
<DataTable {rows} {columns} rowKey={(a) => a.model.id} sortKey={$catalogView.sortKey} ascending={$catalogView.ascending} {onSort} highlightKey={$lastViewedModel} empty={t('catalog.noResults')}/>
