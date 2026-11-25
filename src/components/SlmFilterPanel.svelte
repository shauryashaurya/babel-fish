<script lang="ts">
 import {compareList} from '../lib/compareList';
 import {t} from '../lib/content';
 import {slms} from '../lib/learning';
 import {activeFilterCount, clearSlmFilters, filterSlms, patchSlmFilters, slmFacetKeys, slmFacetOptions, slmView, type SlmFacet} from '../lib/slmView';
 const openByDefault: SlmFacet[] = ['tier', 'commercial', 'purpose'];
 $: f = $slmView.filters;
 $: groups = slmFacetKeys.map(key => ({key, options: slmFacetOptions($slmView, key, $compareList)}));
 $: shown = filterSlms($slmView, $compareList).length;
 function toggle(key: SlmFacet, value: string) {
  const current = f.facets[key];
  patchSlmFilters({facets: {...f.facets, [key]: current.includes(value) ? current.filter(v => v !== value) : [...current, value]}});
 }
</script>
<aside class="rail filter-panel" aria-label={t('filters.title')}>
 <div class="rail-head">
  <div class="rail-title"><h2>{t('filters.title')}</h2>{#if activeFilterCount(f)}<button class="link-btn" on:click={clearSlmFilters}>{t('common.clearAll')}</button>{:else}<span>{t('common.shownOf', {shown, total: slms.length})}</span>{/if}</div>
  <input type="search" placeholder={t('slm.searchPlaceholder')} aria-label={t('slm.searchPlaceholder')} value={f.search} on:input={e => patchSlmFilters({search: e.currentTarget.value})}/>
  <label class="check"><input type="checkbox" checked={f.compareOnly} on:change={e => patchSlmFilters({compareOnly: e.currentTarget.checked})}/> {t('slm.compareOnly')} ({$compareList.length})</label>
  <label class="check"><input type="checkbox" checked={f.fitsOnly} on:change={e => patchSlmFilters({fitsOnly: e.currentTarget.checked})}/> {t('slm.fitsOnlyShort', {memory: f.memory})}</label>
 </div>
 <div class="facets">
  {#each groups as g (g.key)}
   <details open={openByDefault.includes(g.key) || f.facets[g.key].length > 0}>
    <summary>{t(`slm.facet.${g.key}`)}{#if f.facets[g.key].length}<em>{f.facets[g.key].length}</em>{/if}</summary>
    <div class="facet-options">
     {#each g.options as o (o.value)}
      <label class="facet-option" class:dim={o.count === 0 && !f.facets[g.key].includes(o.value)}>
       <input type="checkbox" checked={f.facets[g.key].includes(o.value)} on:change={() => toggle(g.key, o.value)}/>
       <span>{o.label}</span><small>{o.count}</small>
      </label>
     {/each}
    </div>
   </details>
  {/each}
 </div>
</aside>
