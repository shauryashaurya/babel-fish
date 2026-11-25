<script lang="ts" context="module">
 export interface BarSegment {value: number; style: 'solid' | 'light'; label: string; text: string;}
 export interface BarRow {id: string; badge?: string; label: string; href?: string; tone: number; segments: BarSegment[]; value: string; note?: string;}
</script>
<script lang="ts">
 /** Horizontal bars on one shared, zero-based axis. Colour follows the model; solid and light parts of a bar split one measure. */
 import {niceTicks} from './MiniChart.svelte';
 export let rows: BarRow[];
 export let format: (v: number) => string = v => String(v);
 export let legend: {style: 'solid' | 'light'; label: string}[] = [];
 export let aria = '';
 let hover: string | null = null;
 $: total = (r: BarRow) => r.segments.reduce((s, x) => s + Math.max(0, x.value), 0);
 $: top = Math.max(1e-9, ...rows.map(total));
 $: ticks = niceTicks(0, top, 4);
 $: domain = Math.max(top, ticks[ticks.length - 1] ?? top);
 $: shown = ticks.filter(v => v <= domain + 1e-9);
 const pct = (v: number) => `${100 * Math.max(0, v) / domain}%`;
 /** Room to the right of the longest bar for its value label. */
 $: room = 20 + 7.6 * Math.max(4, ...rows.map(r => r.value.length));
</script>
<div class="hbar" role="group" aria-label={aria} style={`--room:${room}px`}>
 {#each rows as r (r.id)}
  {@const sum = total(r)}
  <div class="hbar-row" role="group" aria-label={`${r.label}: ${r.value}`} class:dim={hover !== null && hover !== r.id} style={`--tone: var(--s${r.tone})`} on:pointerenter={() => hover = r.id} on:pointerleave={() => hover = null}>
   <div class="hbar-label">{#if r.badge}<b>{r.badge}</b>{/if}{#if r.href}<a href={r.href}>{r.label}</a>{:else}<span>{r.label}</span>{/if}</div>
   <div class="hbar-plot">
    {#each shown as tick}<i class="hbar-grid" style={`left:${pct(tick)}`}></i>{/each}
    <div class="hbar-bar" style={`width:${pct(sum)}`}>
     {#each r.segments.filter(s => s.value > 0) as s, i}<i class={`hbar-seg ${s.style}`} style={`flex-grow:${s.value}`} title={`${s.label}: ${s.text}`}></i>{/each}
    </div>
    <span class="hbar-value" style={`left:${pct(sum)}`}>{r.value}</span>
    {#if hover === r.id && r.segments.length > 1}
     <div class="hbar-tip" style={`left:min(${pct(sum)}, 70%)`}>{#each r.segments as s}<span><i class={`hbar-sw ${s.style}`}></i>{s.label}<em>{s.text}</em></span>{/each}</div>
    {/if}
   </div>
   {#if r.note}<small class="hbar-note">{r.note}</small>{/if}
  </div>
 {/each}
 <div class="hbar-row hbar-axis"><div></div><div class="hbar-plot">{#each shown as tick}<span style={`left:${pct(tick)}`}>{format(tick)}</span>{/each}</div></div>
</div>
{#if legend.length}<div class="chart-legend hbar-legend">{#each legend as l}<span><i class={`hbar-sw ${l.style}`}></i>{l.label}</span>{/each}</div>{/if}
