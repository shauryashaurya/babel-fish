<script lang="ts">
 import {onDestroy} from 'svelte';
 import {segmentSeries, type Segment} from '../lib/architecture';
 import {t} from '../lib/content';
 export let segments: Segment[];
 export let layer = 0;
 let playing = false, timer: ReturnType<typeof setInterval> | undefined;
 $: cells = segments.flatMap((segment, index) => Array.from({length: segment.count}, () => ({segment, index})));
 $: total = cells.length;
 $: current = cells[Math.min(layer, total - 1)];
 const startOf = (index: number) => segments.slice(0, index).reduce((sum, s) => sum + s.count, 0);
 function stop() { playing = false; if (timer) clearInterval(timer); timer = undefined; }
 function toggle() {
  if (playing) return stop();
  playing = true;
  timer = setInterval(() => { layer = layer >= total - 1 ? 0 : layer + 1; }, Math.max(90, 2600 / Math.max(total, 1)));
 }
 onDestroy(stop);
</script>
<div class="layer-stack">
 <div class="card-title">
  <h3 class="block-name">{t('architecture.stackTitle')}</h3>
  <button class="btn small" on:click={toggle}>{t(playing ? 'architecture.pauseStack' : 'architecture.playStack')}</button>
 </div>
 <p class="note flush">{t('architecture.stackHint')}</p>
 <div class="stack-rail">
  <span class="stack-end">{t('architecture.input')}</span>
  <div class="stack-cells">
   {#each cells as c, i}<button class={`stack-cell series-${segmentSeries(c.segment)}`} class:on={i === layer} tabindex="-1" aria-label={t('architecture.selectedLayer', {layer: i + 1, total, label: c.segment.label})} title={t('architecture.selectedLayer', {layer: i + 1, total, label: c.segment.label})} on:click={() => { stop(); layer = i; }}></button>{/each}
  </div>
  <span class="stack-end">{t('architecture.output')}</span>
 </div>
 <label class="net-slider stack-slider"><span>{t('architecture.layerSlider')}<b>{layer + 1} / {total}</b></span><input type="range" min="0" max={Math.max(0, total - 1)} value={layer} on:input={e => { stop(); layer = Number(e.currentTarget.value); }}/></label>
 <div class="stack-legend">
  {#each segments as s, i}<button class:on={current?.index === i} on:click={() => { stop(); layer = startOf(i); }}><i class={`series-${segmentSeries(s)}`}></i><b>{s.count}</b> {s.label}</button>{/each}
 </div>
</div>
