<script lang="ts">
 import {onDestroy} from 'svelte';
 import MiniChart from './MiniChart.svelte';
 import {t} from '../lib/content';
 import {baseTask, BASE_RANGE, FineTuner, targetTask, TARGET_RANGE, type TuneMethod} from '../lib/training';
 const LIMIT = 1500, methods: TuneMethod[] = ['head', 'lora', 'full'];
 let method: TuneMethod = 'lora', examples = 24, noise = 4, rate = 15, rank = 2, keep = 0, rehearsal = 0;
 const build = () => new FineTuner({method, examples, noise: noise / 100, learningRate: rate / 1000, rank, keepClose: keep / 1000, rehearsal});
 let tuner = build(), tick = 0, playing = false, timer: ReturnType<typeof setInterval> | undefined;
 const xs = Array.from({length: 121}, (_, i) => -1 + i / 60);
 function stop() { playing = false; if (timer) clearInterval(timer); timer = undefined; }
 function reset() { stop(); tuner = build(); tick++; }
 function advance(steps: number) { tuner.run(steps); tick++; if (tuner.stepCount >= LIMIT) stop(); }
 function toggle() {
  if (playing) return stop();
  if (tuner.stepCount >= LIMIT) reset();
  playing = true;
  timer = setInterval(() => advance(10), 50);
 }
 function preset(next: Partial<{method: TuneMethod; examples: number; noise: number; rank: number; keep: number; rehearsal: number}>) {
  ({method = 'lora', examples = 24, noise = 4, rank = 2, keep = 0, rehearsal = 0} = next);
  reset(); advance(next.examples === 5 ? 1400 : 700);
 }
 onDestroy(stop);
 $: view = (void tick, (() => {
  const last = tuner.history[tuner.history.length - 1], first = tuner.history[0];
  return {last, first, steps: tuner.stepCount, fit: xs.map(x => [x, tuner.predict(x)] as [number, number]), points: tuner.xs.map((x, i) => [x, tuner.ys[i]] as [number, number]),
   train: tuner.history.map(h => [h.step, Math.max(h.train, 1e-5)] as [number, number]), holdout: tuner.history.map(h => [h.step, Math.max(h.holdout, 1e-5)] as [number, number]), retained: tuner.history.map(h => [h.step, Math.max(h.retained, 1e-5)] as [number, number]),
   trainable: tuner.trainable, total: tuner.total};
 })());
 $: verdict = view.steps < 100 ? 'ready' : view.last.retained > .02 ? 'forgot' : view.last.holdout > .004 && view.last.holdout > view.last.train * 3 ? 'overfit' : view.last.holdout > .01 ? 'under' : 'good';
 $: maxStep = Math.max(200, view.steps);
 const sci = (v: number) => v >= .01 ? v.toFixed(2) : v.toExponential(0);
</script>
<section class="card">
 <h2>{t('ft.labTitle')}</h2>
 <p class="note flush">{t('ft.labIntro')}</p>
 <div class="preset-row"><span>{t('ft.tryScenario')}</span>
  <button class="btn small" on:click={() => preset({method: 'lora'})}>{t('ft.presetForget')}</button>
  <button class="btn small" on:click={() => preset({method: 'lora', rehearsal: 16})}>{t('ft.presetRehearse')}</button>
  <button class="btn small" on:click={() => preset({method: 'full', examples: 5, noise: 14})}>{t('ft.presetOverfit')}</button>
  <button class="btn small" on:click={() => preset({method: 'head', rehearsal: 16, keep: 400})}>{t('ft.presetUnder')}</button>
 </div>
 <div class="net-controls">
  <label class="field"><span>{t('ft.method')}</span><select bind:value={method} on:change={reset}>{#each methods as m}<option value={m}>{t(`ft.method_${m}`)}</option>{/each}</select></label>
  <label class="net-slider"><span>{t('ft.examples')}<b>{examples}</b></span><input type="range" min="4" max="48" bind:value={examples} on:input={reset}/></label>
  <label class="net-slider"><span>{t('ft.noise')}<b>{noise}</b></span><input type="range" min="0" max="20" bind:value={noise} on:input={reset}/></label>
  <label class="net-slider"><span>{t('ft.rate')}<b>{(rate / 1000).toFixed(3)}</b></span><input type="range" min="3" max="40" bind:value={rate} on:input={reset}/></label>
  {#if method === 'lora'}<label class="net-slider"><span>{t('ft.rank')}<b>{rank}</b></span><input type="range" min="1" max="4" bind:value={rank} on:input={reset}/></label>{/if}
  <label class="net-slider"><span>{t('ft.keep')}<b>{(keep / 1000).toFixed(2)}</b></span><input type="range" min="0" max="500" step="10" bind:value={keep} on:input={reset}/></label>
  <label class="net-slider"><span>{t('ft.rehearsal')}<b>{rehearsal}</b></span><input type="range" min="0" max="24" bind:value={rehearsal} on:input={reset}/></label>
  <div class="net-buttons">
   <button class="btn small primary" on:click={toggle}>{t(playing ? 'lab.pause' : 'lab.train')}</button>
   <button class="btn small" on:click={() => advance(100)}>{t('lab.step100')}</button>
   <button class="btn small" on:click={reset}>{t('net.reset')}</button>
  </div>
 </div>
 <p class={`callout verdict ${verdict}`}><b>{t(`ft.verdict.${verdict}.title`)}</b> {t(`ft.verdict.${verdict}.text`)}</p>
 <div class="size-tiles">
  <div><span>{t('ft.trainError')}</span><strong>{view.last.train.toExponential(1)}</strong></div>
  <div><span>{t('ft.newError')}</span><strong>{view.last.holdout.toExponential(1)}</strong></div>
  <div><span>{t('ft.oldError')}</span><strong>{view.last.retained.toExponential(1)}</strong></div>
  <div><span>{t('ft.trainableShare')}</span><strong>{view.trainable} / {view.total}</strong></div>
 </div>
 <div class="tune-grid">
  <div><h3>{t('ft.chartFit')}</h3>
   <MiniChart xMin={-1} xMax={1} yMin={-1} yMax={1.5} xLabel={t('lab.input')} yLabel={t('lab.output')} aria={t('ft.chartFit')}
    bands={[{x0: BASE_RANGE[0], x1: BASE_RANGE[1], tone: 1}, {x0: TARGET_RANGE[0], x1: TARGET_RANGE[1], tone: 2}]}
    series={[{id: 'old', label: t('ft.lineBase'), tone: 1, dashed: true, points: xs.map(x => [x, baseTask(x)])}, {id: 'new', label: t('ft.lineTarget'), tone: 0, points: xs.map(x => [x, targetTask(x)])}, {id: 'model', label: t('ft.lineModel'), tone: 2, points: view.fit}, {id: 'data', label: t('ft.linePoints'), tone: 7, dots: true, points: view.points}]}/>
  </div>
  <div><h3>{t('ft.chartLoss')}</h3>
   <MiniChart log xMin={0} xMax={maxStep} yMin={1e-5} yMax={1} xLabel={t('lab.steps')} yLabel={t('lab.error')} aria={t('ft.chartLoss')} format={sci}
    series={[{id: 'train', label: t('ft.trainError'), tone: 1, points: view.train}, {id: 'holdout', label: t('ft.newError'), tone: 2, points: view.holdout}, {id: 'retained', label: t('ft.oldError'), tone: 7, points: view.retained}]}/>
  </div>
 </div>
 <p class="note">{t('ft.labNote')}</p>
</section>
