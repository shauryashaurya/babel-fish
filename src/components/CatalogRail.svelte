<script lang="ts">
 import {t} from '../lib/content';
 import {filterChips, sortOptions, visibleModels, type SortKey} from '../lib/filters';
 import {formatParams, formatTokens, hasRequirements, statusLabel} from '../lib/selection';
 import {catalogView, patchFilters} from '../lib/state';
 import type {Model, Selection} from '../lib/types';
 import {tokensText} from '../lib/finops';
 export let models: Model[];
 export let selection: Selection;
 export let activeId = '';
 $: active = hasRequirements(selection);
 $: visible = visibleModels(models, selection, $catalogView);
 $: filterCount = filterChips($catalogView.filters).filter(c => c.label !== t('filters.chipSearch', {value: $catalogView.filters.search.trim()})).length;
 $: sortValue = `${$catalogView.sortKey}:${$catalogView.ascending ? 'asc' : 'desc'}`;
 function setSort(value: string) {
  const [sortKey, direction] = value.split(':');
  catalogView.update(v => ({...v, sortKey: sortKey as SortKey, ascending: direction === 'asc'}));
 }
</script>
<aside class="rail" aria-label={t('catalog.railTitle')}>
 <div class="rail-head">
  <div class="rail-title"><h2>{t('catalog.railTitle')}</h2><span>{t('common.shownOf', {shown: visible.length, total: models.length})}</span></div>
  <input type="search" placeholder={t('filters.searchPlaceholder')} aria-label={t('filters.searchPlaceholder')} value={$catalogView.filters.search} on:input={e => patchFilters({search: e.currentTarget.value})}/>
  <div class="rail-controls">
   <select aria-label={t('filters.sortBy')} value={sortValue} on:change={e => setSort(e.currentTarget.value)}>
    {#if !sortOptions.includes(sortValue)}<option value={sortValue}>{t('filters.sortBy')}</option>{/if}
    {#each sortOptions as o}<option value={o}>{t(`sort.${o}`)}</option>{/each}
   </select>
   <a class="btn" href="#/catalog">{filterCount ? t('filters.adjustActive', {count: filterCount}) : t('filters.adjust')}</a>
  </div>
 </div>
 <ul class="rail-list">
  {#each visible as a (a.model.id)}
   <li><a class:current={activeId === a.model.id} href={`#/model/${encodeURIComponent(a.model.id)}`}>
    <span class="rail-name">{a.model.name}{#if selection.candidates.includes(a.model.id)}<em>{t('columns.candidate')}</em>{/if}</span>
    <span class="rail-meta">{a.model.publisher} · {#if a.model.access === 'api'}<b class="api-tag">{t('api.tag')}</b>{:else}{formatParams(a.model.totalParams)}{/if} · {a.model.access === 'api' && a.model.context ? tokensText(a.model.context) : formatTokens(a.model.context)}</span>
    {#if active}<span class={`status ${a.status}`}>{statusLabel(a.status)}</span>{/if}
   </a></li>
  {:else}<li class="rail-empty">{t('catalog.noResults')}</li>{/each}
 </ul>
</aside>
