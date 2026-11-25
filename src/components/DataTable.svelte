<script lang="ts">
 import {onMount, tick} from 'svelte';
 import {t} from '../lib/content';
 import {compareValues, type Column} from '../lib/filters';
 export let rows: any[];
 export let columns: Column[];
 export let rowKey: (row: any) => string;
 export let searchable = false;
 export let sortKey = '';
 export let ascending = true;
 /** When set, the parent owns sorting and passes rows already sorted. */
 export let onSort: ((key: string, ascending: boolean) => void) | null = null;
 export let highlightKey = '';
 export let rowClass: (row: any) => string = () => '';
 export let size: 'tall' | 'short' | 'auto' = 'tall';
 export let empty = '';
 let query = '', wrap: HTMLDivElement;
 const cellText = (c: Column, row: any) => c.text ? c.text(row) : String(c.value(row) ?? '—');
 $: searched = query.trim() ? rows.filter(row => columns.some(c => !c.action && cellText(c, row).toLowerCase().includes(query.trim().toLowerCase()))) : rows;
 $: active = columns.find(c => c.key === sortKey);
 $: shown = onSort || !active ? searched : [...searched].sort((a, b) => compareValues(active!.value(a), active!.value(b), ascending));
 function sort(c: Column) {
  const next = sortKey === c.key ? !ascending : true;
  if (onSort) onSort(c.key, next); else { sortKey = c.key; ascending = next; }
 }
 onMount(async () => {
  await tick();
  const row = highlightKey ? wrap?.querySelector<HTMLElement>('tr.highlight') : null;
  if (row) wrap.scrollTop = row.offsetTop - wrap.clientHeight / 2;
 });
</script>
{#if searchable || $$slots.toolbar}
 <div class="table-toolbar">
  {#if searchable}<input type="search" placeholder={t('common.searchTable')} aria-label={t('common.searchTable')} bind:value={query}/>{/if}
  <slot name="toolbar"/>
  <span class="count">{t('common.shownOf', {shown: shown.length, total: rows.length})}</span>
 </div>
{/if}
<div class="table-wrap {size}" bind:this={wrap}><table>
 <thead><tr>
  {#each columns as c}
   <th class:num={c.numeric} aria-sort={sortKey === c.key ? (ascending ? 'ascending' : 'descending') : 'none'}>
    {#if c.sortable === false}{c.label}{:else}<button on:click={() => sort(c)}>{c.label}<span class="sort-mark" class:on={sortKey === c.key}>{sortKey === c.key ? (ascending ? '↑' : '↓') : '↕'}</span></button>{/if}
   </th>
  {/each}
 </tr></thead>
 <tbody>
  {#each shown as row (rowKey(row))}
   <tr class={rowClass(row)} class:highlight={highlightKey === rowKey(row)}>
    {#each columns as c}
     <td class={c.cellClass || ''} class:num={c.numeric}>
      {#if c.action}<button class="btn small" disabled={c.action.disabled(row)} on:click={() => c.action?.run(row)}>{cellText(c, row)}</button>
      {:else if c.tone}<span class={`status ${c.tone(row)}`}>{cellText(c, row)}</span>
      {:else if c.href?.(row)}<a href={c.href(row)}>{cellText(c, row)}</a>
      {:else}{cellText(c, row)}{/if}
      {#if c.sub}<small>{c.sub(row)}</small>{/if}
     </td>
    {/each}
   </tr>
  {:else}<tr><td class="empty-row" colspan={columns.length}>{empty || t('common.noMatches')}</td></tr>{/each}
 </tbody>
</table></div>
