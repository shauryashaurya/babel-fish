<script lang="ts">
 import {compareList} from '../lib/compareList';
 import {t} from '../lib/content';
 import {slms} from '../lib/learning';
 import {formatParams, formatTokens} from '../lib/selection';
 import {activeFilterCount, filterSlms, patchSlmFilters, slmView} from '../lib/slmView';
 export let activeId = '';
 $: visible = filterSlms($slmView, $compareList);
 $: count = activeFilterCount($slmView.filters);
</script>
<aside class="rail" aria-label={t('slm.railTitle')}>
 <div class="rail-head">
  <div class="rail-title"><h2>{t('slm.railTitle')}</h2><span>{t('common.shownOf', {shown: visible.length, total: slms.length})}</span></div>
  <input type="search" placeholder={t('slm.searchPlaceholder')} aria-label={t('slm.searchPlaceholder')} value={$slmView.filters.search} on:input={e => patchSlmFilters({search: e.currentTarget.value})}/>
  <div class="rail-controls"><a class="btn" href="#/slm">{count ? t('filters.adjustActive', {count}) : t('filters.adjust')}</a></div>
 </div>
 <ul class="rail-list">
  {#each visible as s (s.id)}
   <li><a class:current={activeId === s.id} href={`#/slm/${encodeURIComponent(s.id)}`}>
    <span class="rail-name">{s.name}{#if $compareList.includes(s.galleryModelId ?? s.id)}<em>{t('slm.comparing')}</em>{/if}</span>
    <span class="rail-meta">#{s.rank} · {s.publisher} · {formatParams(s.params)} · {formatTokens(s.context)}</span>
   </a></li>
  {:else}<li class="rail-empty">{t('catalog.noResults')}</li>{/each}
 </ul>
</aside>
