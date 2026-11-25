<script lang="ts">
 import NumberField from './NumberField.svelte';
 import {t} from '../lib/content';
 import {facetKeys, facetOptions, filterChips, type FacetKey} from '../lib/filters';
 import {hasRequirements} from '../lib/selection';
 import {catalogView, clearFilters, patchFilters} from '../lib/state';
 import type {Model, Selection} from '../lib/types';
 export let models: Model[];
 export let selection: Selection;
 const openByDefault: FacetKey[] = ['family', 'commercial'];
 $: f = $catalogView.filters;
 $: keys = facetKeys.filter(k => k !== 'requirement' || hasRequirements(selection));
 $: groups = keys.map(key => ({key, options: facetOptions(models, selection, f, key)}));
 $: activeCount = filterChips(f).length;
 function toggle(key: FacetKey, value: string) {
  const current = f.facets[key];
  patchFilters({facets: {...f.facets, [key]: current.includes(value) ? current.filter(v => v !== value) : [...current, value]}});
 }
</script>
<aside class="rail filter-panel" aria-label={t('filters.title')}>
 <div class="rail-head">
  <div class="rail-title"><h2>{t('filters.title')}</h2>{#if activeCount}<button class="link-btn" on:click={clearFilters}>{t('common.clearAll')}</button>{/if}</div>
  <input type="search" placeholder={t('filters.searchPlaceholder')} aria-label={t('filters.searchPlaceholder')} value={f.search} on:input={e => patchFilters({search: e.currentTarget.value})}/>
  <label class="check"><input type="checkbox" checked={f.candidatesOnly} on:change={e => patchFilters({candidatesOnly: e.currentTarget.checked})}/> {t('filters.candidatesOnly')} ({selection.candidates.length})</label>
 </div>
 <div class="facets">
  {#each groups as g (g.key)}
   <details open={openByDefault.includes(g.key) || f.facets[g.key].length > 0}>
    <summary>{t(`filters.facet.${g.key}`)}{#if f.facets[g.key].length}<em>{f.facets[g.key].length}</em>{/if}</summary>
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
  <details>
   <summary>{t('filters.ranges')}</summary>
   <div class="range-grid">
    <NumberField label={t('filters.minParams')} value={f.minParamsB} onChange={v => patchFilters({minParamsB: v})}/>
    <NumberField label={t('filters.maxParams')} value={f.maxParamsB} onChange={v => patchFilters({maxParamsB: v})}/>
    <NumberField label={t('filters.minContext')} value={f.minContextK} onChange={v => patchFilters({minContextK: v})}/>
    <NumberField label={t('filters.maxWeights')} value={f.maxWeightGiB} onChange={v => patchFilters({maxWeightGiB: v})}/>
   </div>
  </details>
 </div>
</aside>
