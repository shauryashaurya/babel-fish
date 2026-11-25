<script lang="ts">
 import MathBlock from './MathBlock.svelte';
 import MiniChart from './MiniChart.svelte';
 import {t} from '../lib/content';
 import {fineTuning} from '../lib/learning';
 const d = fineTuning.dpo;
 let chosen = 0, rejected = 0, beta = 10;
 $: b = beta / 100;
 $: margin = b * (chosen - rejected);
 $: loss = Math.log1p(Math.exp(-margin));
 $: weight = 1 / (1 + Math.exp(margin));
 const xs = Array.from({length: 121}, (_, i) => -6 + i / 10);
 $: read = weight > .6 ? 'ft.dpoReadWrong' : weight > .35 ? 'ft.dpoReadEven' : 'ft.dpoReadDone';
 const presets: [string, number, number][] = [['ft.dpoStart', 0, 0], ['ft.dpoGood', 1.5, -1.5], ['ft.dpoBad', -1, 1], ['ft.dpoBothDown', -2, -4]];
</script>
<section class="card">
 <h2>{t('ft.dpoTitle')}</h2>
 <p class="note flush">{d.intro}</p>
 <MathBlock items={[{label: t('ft.dpoFormula'), note: t('ft.dpoFormulaNote'), tex: '\\mathcal{L}_{\\text{DPO}} = -\\log \\sigma\\Big(\\beta\\big[\\underbrace{\\log \\tfrac{\\pi_\\theta(y_w\\mid x)}{\\pi_{\\text{ref}}(y_w\\mid x)}}_{\\Delta_{\\text{chosen}}} - \\underbrace{\\log \\tfrac{\\pi_\\theta(y_l\\mid x)}{\\pi_{\\text{ref}}(y_l\\mid x)}}_{\\Delta_{\\text{rejected}}}\\big]\\Big)'}]}/>
 <div class="preset-row"><span>{t('ft.tryScenario')}</span>{#each presets as [label, c, r]}<button class="btn small" on:click={() => { chosen = c; rejected = r; }}>{t(label)}</button>{/each}</div>
 <div class="net-controls">
  <label class="net-slider"><span>{t('ft.dpoChosen')}<b>{chosen.toFixed(1)}</b></span><input type="range" min="-5" max="5" step="0.1" bind:value={chosen}/></label>
  <label class="net-slider"><span>{t('ft.dpoRejected')}<b>{rejected.toFixed(1)}</b></span><input type="range" min="-5" max="5" step="0.1" bind:value={rejected}/></label>
  <label class="net-slider"><span>β<b>{b.toFixed(2)}</b></span><input type="range" min="1" max="100" bind:value={beta}/></label>
 </div>
 <div class="size-tiles">
  <div><span>{t('ft.dpoMargin')}</span><strong>{margin.toFixed(3)}</strong></div>
  <div><span>{t('ft.dpoLoss')}</span><strong>{loss.toFixed(3)}</strong></div>
  <div class="tile-selected"><span>{t('ft.dpoWeight')}</span><strong>{weight.toFixed(3)}</strong></div>
  <div><span>{t('ft.dpoProbRatio')}</span><strong>{Math.exp(chosen - rejected).toFixed(2)}×</strong></div>
 </div>
 <p class={`callout ${weight > .6 ? 'warn' : ''}`}>{t(read)}</p>
 <MiniChart xMin={-6} xMax={6} yMin={0} yMax={6} xLabel={t('ft.dpoMargin')} yLabel={t('ft.dpoLoss')} aria={t('ft.dpoTitle')}
  series={[{id: 'curve', label: t('ft.dpoLoss'), tone: 1, points: xs.map(x => [x, Math.log1p(Math.exp(-x))])}, {id: 'now', label: t('ft.dpoNow'), tone: 2, dots: true, points: [[Math.max(-6, Math.min(6, margin)), Math.min(6, loss)]]}]}/>
 <p class="note">{t('ft.dpoBeta')} {d.note} {t('architecture.source')}: <a href={d.source.url} target="_blank" rel="noreferrer">{d.source.title}</a></p>
</section>
