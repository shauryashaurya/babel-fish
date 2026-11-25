<script lang="ts">
 /** Horizontal bars with the value written beside each bar; one hue, since the bars share one measure. */
 export let rows: {label: string; value: number; href?: string; note?: string}[];
 export let format: (v: number) => string = v => String(v);
 export let color = 'var(--s1)';
 $: max = Math.max(1, ...rows.map(r => r.value));
</script>
<div class="bar-list">
 {#each rows as r (r.label)}
  <div class="bar-row" title={r.note ?? `${r.label}: ${format(r.value)}`}>
   <span class="bar-label">{#if r.href}<a href={r.href}>{r.label}</a>{:else}{r.label}{/if}</span>
   <span class="bar-track"><i style={`width:${Math.max(r.value / max * 100, r.value ? 1.5 : 0)}%;background:${color}`}></i></span>
   <b>{format(r.value)}</b>
  </div>
 {/each}
</div>
