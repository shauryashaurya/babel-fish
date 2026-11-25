<script lang="ts">
 import MiniChart from './MiniChart.svelte';
 import {t} from '../lib/content';
 import {fineTuning, slms, slmWeights} from '../lib/learning';
 import {formatGiB} from '../lib/selection';
 import {bitsPerWeight, errorStats, quantize, sampleWeights} from '../lib/quantize';
 const COUNT = 4096, groups = [0, 256, 128, 64, 32];
 let bits = 4, group = 128, outliers = true, start = 0, slmId = slms.find(s => s.params > 3e9 && s.params < 4.5e9)?.id ?? slms[0]?.id;
 $: weights = sampleWeights(COUNT, outliers);
 $: q = quantize(weights, bits, group);
 $: stats = errorStats(weights, q);
 $: window = Array.from({length: 64}, (_, i) => start + i);
 $: curve = (g: number) => [2, 3, 4, 5, 6, 8].map(b => [b, Math.max(errorStats(weights, quantize(weights, b, g)).relative, 1e-4)] as [number, number]);
 $: slm = slms.find(s => s.id === slmId) ?? slms[0];
 $: perWeight = bitsPerWeight(bits, group, COUNT);
 const groupLabel = (g: number) => g ? t('quant.groupOf', {size: g}) : t('quant.perTensor');
 const pct = (v: number) => `${(v * 100).toFixed(v < .01 ? 2 : 1)}%`;
 $: outlierIndex = weights.findIndex(w => Math.abs(w) > .2);
</script>
<section class="card">
 <h2>{t('quant.title')}</h2>
 <p class="note flush">{t('quant.intro')}</p>
 <div class="net-controls">
  <label class="net-slider"><span>{t('quant.bits')}<b>{bits}</b></span><input type="range" min="2" max="8" bind:value={bits}/></label>
  <label class="field"><span>{t('quant.group')}</span><select bind:value={group}>{#each groups as g}<option value={g}>{groupLabel(g)}</option>{/each}</select></label>
  <label class="net-toggle"><input type="checkbox" bind:checked={outliers}/> {t('quant.outliers')}</label>
  <label class="net-slider"><span>{t('quant.window')}<b>{start}–{start + 63}</b></span><input type="range" min="0" max={COUNT - 64} step="64" bind:value={start}/></label>
  {#if outliers && outlierIndex >= 0}<button class="btn small" on:click={() => start = Math.floor(outlierIndex / 64) * 64}>{t('quant.jumpOutlier')}</button>{/if}
 </div>
 <div class="size-tiles">
  <div><span>{t('quant.levels')}</span><strong>{2 ** bits - 1}</strong></div>
  <div><span>{t('quant.storedBits')}</span><strong>{perWeight.toFixed(2)}</strong></div>
  <div><span>{t('quant.error')}</span><strong>{pct(stats.relative)}</strong></div>
  <div><span>{t('quant.zeroed')}</span><strong>{pct(stats.zeroed)}</strong></div>
 </div>
 <div class="tune-grid">
  <div><h3>{t('quant.chartWeights')}</h3>
   <MiniChart xMin={start} xMax={start + 63} yMin={outliers && window.some(i => Math.abs(weights[i]) > .2) ? -.4 : -.08} yMax={outliers && window.some(i => Math.abs(weights[i]) > .2) ? .4 : .08} xLabel={t('quant.index')} yLabel={t('quant.value')} aria={t('quant.chartWeights')} format={v => v.toFixed(2)}
    series={[{id: 'q', label: t('quant.quantized'), tone: 2, points: window.map(i => [i, q[i]])}, {id: 'w', label: t('quant.original'), tone: 1, dots: true, points: window.map(i => [i, weights[i]])}]}/>
  </div>
  <div><h3>{t('quant.chartError')}</h3>
   <MiniChart log xMin={2} xMax={8} yMin={1e-3} yMax={1} xLabel={t('quant.bits')} yLabel={t('quant.error')} aria={t('quant.chartError')} format={v => v >= .01 ? `${(v * 100).toFixed(0)}%` : `${(v * 100).toFixed(1)}%`}
    series={[{id: 'tensor', label: t('quant.perTensor'), tone: 2, points: curve(0)}, {id: 'g128', label: t('quant.groupOf', {size: 128}), tone: 1, points: curve(128)}, {id: 'g32', label: t('quant.groupOf', {size: 32}), tone: 3, points: curve(32)}]}/>
  </div>
 </div>
 <p class="callout">{t(outliers && group === 0 && bits <= 4 ? 'quant.readTensor' : bits <= 3 ? 'quant.readLow' : 'quant.readOk')}</p>
 <h3>{t('quant.onModel')}</h3>
 <div class="net-controls">
  <label class="field"><span>{t('ft.baseModel')}</span><select bind:value={slmId}>{#each slms as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select></label>
 </div>
 <div class="size-tiles">
  <div><span>{t('slm.precision.bit16')}</span><strong>{formatGiB(slmWeights(slm, 'bit16'))}</strong></div>
  <div><span>{t('slm.precision.bit8')}</span><strong>{formatGiB(slmWeights(slm, 'bit8'))}</strong></div>
  <div><span>{t('slm.precision.bit4')}</span><strong>{formatGiB(slmWeights(slm, 'bit4'))}</strong></div>
  <div class="tile-selected"><span>{t('quant.thisSetting', {bits: perWeight.toFixed(2)})}</span><strong>{formatGiB(slm.params * perWeight / 8 / 1024 ** 3)}</strong></div>
 </div>
 <p class="note">{fineTuning.slmGuide.quantNote}</p>
</section>
