<script lang="ts">
 import {onDestroy} from 'svelte';
 import MiniChart from './MiniChart.svelte';
 import {t} from '../lib/content';
 import {explainers} from '../lib/learning';
 import {expertTarget, ExpertTrainer} from '../lib/training';
 const facts = explainers.expertFacts, LIMIT = 1500;
 let experts = 4, active = 1, balance = true, trainer = new ExpertTrainer({experts, active, balance}), tick = 0, playing = false;
 let timer: ReturnType<typeof setInterval> | undefined;
 const xs = Array.from({length: 161}, (_, i) => -1 + i / 80);
 function stop() { playing = false; if (timer) clearInterval(timer); timer = undefined; }
 function reset() { stop(); trainer = new ExpertTrainer({experts, active: Math.min(active, experts), balance}); tick++; }
 function advance(steps: number) {
  trainer.run(steps); tick++;
  if (trainer.stepCount >= LIMIT) stop();
 }
 function toggle() {
  if (playing) return stop();
  if (trainer.stepCount >= LIMIT) reset();
  playing = true;
  timer = setInterval(() => advance(12), 50);
 }
 onDestroy(stop);
 $: view = (void tick, (() => {
  const bands: {x0: number; x1: number; tone: number}[] = [];
  let start = xs[0], route = trainer.routeOf(xs[0]);
  for (const x of xs) { const next = trainer.routeOf(x); if (next !== route) { bands.push({x0: start, x1: x, tone: route + 1}); start = x; route = next; } }
  bands.push({x0: start, x1: 1, tone: route + 1});
  return {bands, fit: xs.map(x => [x, trainer.predict(x)] as [number, number]), usage: trainer.usage(), error: trainer.error(), steps: trainer.stepCount};
 })());
 $: unused = view.usage.filter(u => u < .005).length;
</script>
<section class="card">
 <h2>{facts.title}</h2>
 <p class="lede flush">{facts.lead}</p>
 <ol class="step-list">{#each facts.steps as s, i}<li><b>{i + 1}</b><div><strong>{s.title}</strong><span>{s.text}</span></div></li>{/each}</ol>
</section>
<section class="card">
 <h2>{t('lab.expertTitle')}</h2>
 <p class="note flush">{facts.labIntro}</p>
 <div class="net-controls">
  <label class="net-slider"><span>{t('lab.experts')}<b>{experts}</b></span><input type="range" min="2" max="6" bind:value={experts} on:input={reset}/></label>
  <label class="net-slider"><span>{t('lab.activePerToken')}<b>{active}</b></span><input type="range" min="1" max="2" bind:value={active} on:input={reset}/></label>
  <label class="net-toggle"><input type="checkbox" bind:checked={balance} on:change={reset}/> {t('lab.balance')}</label>
  <div class="net-buttons">
   <button class="btn small primary" on:click={toggle}>{t(playing ? 'lab.pause' : 'lab.train')}</button>
   <button class="btn small" on:click={() => advance(100)}>{t('lab.step100')}</button>
   <button class="btn small" on:click={reset}>{t('net.reset')}</button>
  </div>
 </div>
 <div class="lab-grid">
  <MiniChart xMin={-1} xMax={1} yMin={-1} yMax={1} bands={view.bands} xLabel={t('lab.input')} yLabel={t('lab.output')} aria={t('lab.expertChart')}
   series={[{id: 'target', label: t('lab.targetLine'), tone: 0, points: xs.map(x => [x, expertTarget(x)])}, {id: 'fit', label: t('lab.modelLine'), tone: 2, dashed: true, points: view.fit}]}/>
  <div class="lab-side">
   <dl>
    <div><dt>{t('lab.steps')}</dt><dd>{view.steps}</dd></div>
    <div><dt>{t('lab.error')}</dt><dd>{view.error.toFixed(4)}</dd></div>
    <div><dt>{t('lab.unused')}</dt><dd>{unused}</dd></div>
   </dl>
   <h3>{t('lab.traffic')}</h3>
   {#each view.usage as u, e}<div class="usage-row"><span><i class={`series-${e + 1}`}></i>{t('lab.expertN', {n: e + 1})}</span><div class="bar"><i style={`width:${u * 100}%;background:var(--s${e + 1})`}></i></div><b>{(u * 100).toFixed(0)}%</b></div>{/each}
  </div>
 </div>
 {#if view.steps >= 300 && unused > 0}<p class="callout warn">{t('lab.deadNote', {count: unused})}</p>{/if}
 <p class="note">{facts.labNote}</p>
</section>
<section class="card">
 <h2>{facts.findingTitle}</h2>
 <p>{facts.finding}</p>
 <p class="callout">{facts.implication}</p>
 <p class="note">{t('architecture.source')}: <a href={facts.source.url} target="_blank" rel="noreferrer">{facts.source.title}</a></p>
</section>
