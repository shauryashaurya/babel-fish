<script lang="ts">
 import MiniChart from './MiniChart.svelte';
 import {t} from '../lib/content';
 import {fineTuning, slms, type Slm} from '../lib/learning';
 import {formatParams, wilson} from '../lib/selection';
 const f = fineTuning, ex = f.example;
 let stage = 0;
 $: s = f.stages[stage];

 // 1. Data split
 let total = 1200, valPct = 10, testPct = 15, expectedPct = 90;
 $: testN = Math.round(total * testPct / 100);
 $: valN = Math.round(total * valPct / 100);
 $: trainN = total - testN - valN;
 $: band = testN ? wilson(Math.round(testN * expectedPct / 100), testN) : [0, 0];

 // 2–3. Template and loss mask
 let trainPrompt = false;
 const split = (text: string) => text.match(/[\w']+|[^\s\w]/g) ?? [];
 $: pieces = [
  {text: '<|im_start|>', role: 'marker'}, {text: 'system', role: 'marker'}, ...split(ex.system).map(text => ({text, role: 'system'})), {text: '<|im_end|>', role: 'marker'},
  {text: '<|im_start|>', role: 'marker'}, {text: 'user', role: 'marker'}, ...split(ex.user).map(text => ({text, role: 'user'})), {text: '<|im_end|>', role: 'marker'},
  {text: '<|im_start|>', role: 'marker'}, {text: 'assistant', role: 'marker'}, ...split(ex.assistant).map(text => ({text, role: 'assistant'})), {text: '<|im_end|>', role: 'end'},
 ];
 // A token is counted when its next-token label is part of the reply (or the prompt, when that is switched on).
 $: tokens = pieces.map((p, i) => {
  const next = pieces[i + 1];
  const teaches = !!next && (next.role === 'assistant' || next.role === 'end' || (trainPrompt && next.role !== 'end'));
  return {...p, next: next?.text ?? null, teaches};
 });
 $: counted = tokens.filter(x => x.teaches).length;

 // 4. Loss
 $: targets = tokens.filter((_, i) => pieces[i + 1]?.role === 'assistant' || pieces[i + 1]?.role === 'end').map(x => x.next ?? '');
 let probs: number[] = [];
 $: if (probs.length !== targets.length) probs = targets.map((_, i) => [.05, .6, .3, .9, .8, .5][i % 6]);
 $: losses = probs.map(p => -Math.log(p));
 $: meanLoss = losses.reduce((a, b) => a + b, 0) / Math.max(losses.length, 1);

 // 5. LoRA sizes from a real configuration
 const plannable = slms.filter((x): x is Slm & {hiddenSize: number; layers: number; heads: number; kvHeads: number} => !!x.hiddenSize && !!x.layers && !!x.heads && !!x.kvHeads && !!x.architecture?.intermediate);
 let slmId = plannable.find(x => /Qwen3-1.7B/.test(x.name))?.id ?? plannable[0]?.id, rank = 16, targetsOn = {attention: true, mlp: false};
 $: m = plannable.find(x => x.id === slmId) ?? plannable[0];
 $: hd = m.architecture?.headDim ?? Math.floor(m.hiddenSize / m.heads);
 $: ff = m.architecture?.intermediate ?? 0;
 $: mats = [
  ...(targetsOn.attention ? [['q', m.hiddenSize, m.heads * hd], ['k', m.hiddenSize, m.kvHeads * hd], ['v', m.hiddenSize, m.kvHeads * hd], ['o', m.heads * hd, m.hiddenSize]] : []),
  ...(targetsOn.mlp ? [['gate', m.hiddenSize, ff], ['up', m.hiddenSize, ff], ['down', ff, m.hiddenSize]] : []),
 ] as [string, number, number][];
 $: perLayer = mats.reduce((sum, [, i, o]) => sum + rank * (i + o), 0);
 $: frozenPerLayer = mats.reduce((sum, [, i, o]) => sum + i * o, 0);
 $: adapter = perLayer * m.layers;
 let trained = true;
 const N = 12;
 const rnd = (i: number, j: number, k: number) => Math.sin(i * 12.9898 + j * 78.233 + k * 37.719) * 43758.5453 % 1;
 $: A = Array.from({length: rank > 8 ? 8 : rank}, (_, r) => Array.from({length: N}, (_, j) => rnd(r, j, 1)));
 $: B = Array.from({length: N}, (_, i) => Array.from({length: A.length}, (_, r) => trained ? rnd(i, r, 2) : 0));
 $: dW = Array.from({length: N}, (_, i) => Array.from({length: N}, (_, j) => B[i].reduce((sum, b, r) => sum + b * A[r][j], 0)));
 $: dMax = Math.max(1e-9, ...dW.flat().map(Math.abs));
 const cell = (v: number, max: number) => v >= 0 ? `rgba(42,120,214,${Math.min(1, Math.abs(v) / max)})` : `rgba(235,104,52,${Math.min(1, Math.abs(v) / max)})`;

 // 6. Learning-rate schedule
 let steps = 1000, warmup = 5, peak = 20, decay: 'cosine' | 'linear' | 'constant' = 'cosine';
 $: lr = (x: number) => {
  const w = steps * warmup / 100;
  if (x < w) return peak * x / Math.max(w, 1);
  const p = (x - w) / Math.max(steps - w, 1);
  return decay === 'constant' ? peak : decay === 'linear' ? peak * (1 - p) : peak * .5 * (1 + Math.cos(Math.PI * p));
 };
 $: lrPoints = Array.from({length: 101}, (_, i) => [i * steps / 100, lr(i * steps / 100)] as [number, number]);
</script>
<section class="card">
 <h2>{t('ft.howTitle')}</h2>
 <p class="note flush">{t('ft.howIntro')}</p>
 <div class="ladder stages" role="group" aria-label={t('ft.howTitle')}>{#each f.stages as x, i (x.id)}<button class:on={i === stage} class:past={i < stage} on:click={() => stage = i}><b>{i + 1}</b>{x.title}</button>{/each}</div>
 <div class="stage-body">
  <div class="stage-text">
   <h3>{s.title}</h3>
   <p class="lede flush">{s.summary}</p>
   <ul class="plain">{#each s.detail as d}<li>{d}</li>{/each}</ul>
   <p class="callout warn"><b>{t('ft.watch')}</b> {s.watch}</p>
   {#if s.source}<p class="note">{t('architecture.source')}: <a href={s.source.url} target="_blank" rel="noreferrer">{s.source.title}</a></p>{/if}
  </div>
  <div class="stage-widget">
   {#if s.id === 'data'}
    <h4>{t('ft.splitTitle')}</h4>
    <div class="net-controls">
     <label class="net-slider"><span>{t('ft.totalExamples')}<b>{total.toLocaleString('en-US')}</b></span><input type="range" min="100" max="20000" step="100" bind:value={total}/></label>
     <label class="net-slider"><span>{t('ft.valShare')}<b>{valPct}%</b></span><input type="range" min="0" max="30" bind:value={valPct}/></label>
     <label class="net-slider"><span>{t('ft.testShare')}<b>{testPct}%</b></span><input type="range" min="5" max="40" bind:value={testPct}/></label>
     <label class="net-slider"><span>{t('ft.expectedPass')}<b>{expectedPct}%</b></span><input type="range" min="50" max="99" bind:value={expectedPct}/></label>
    </div>
    <div class="split-bar" role="img" aria-label={t('ft.splitTitle')}><i style={`flex:${trainN};background:var(--s1)`}></i><i style={`flex:${valN};background:var(--s4)`}></i><i style={`flex:${testN};background:var(--s3)`}></i></div>
    <div class="chart-legend"><span><i class="dot" style="--tone:var(--s1)"></i>{t('ft.trainSet')} {trainN.toLocaleString('en-US')}</span><span><i class="dot" style="--tone:var(--s4)"></i>{t('ft.valSet')} {valN.toLocaleString('en-US')}</span><span><i class="dot" style="--tone:var(--s3)"></i>{t('ft.testSet')} {testN.toLocaleString('en-US')}</span></div>
    <p class="callout">{t('ft.splitRead', {n: testN, pass: expectedPct, low: (band[0] * 100).toFixed(1), high: (band[1] * 100).toFixed(1)})}</p>
   {:else if s.id === 'template' || s.id === 'mask'}
    <h4>{t(s.id === 'template' ? 'ft.templateTitle' : 'ft.maskTitle')}</h4>
    {#if s.id === 'mask'}<label class="net-toggle"><input type="checkbox" bind:checked={trainPrompt}/> {t('ft.trainPrompt')}</label>{/if}
    <div class="token-strip">
     {#each tokens as x, i}<span class={`tok ${x.role}`} class:teaches={s.id === 'mask' && x.teaches} class:ignored={s.id === 'mask' && !x.teaches} title={s.id === 'mask' ? (x.teaches ? t('ft.labelIs', {next: x.next ?? ''}) : t('ft.labelIgnored')) : x.role}>{x.text}{#if s.id === 'mask'}<small>{x.teaches ? x.next : '-100'}</small>{/if}</span>{/each}
    </div>
    {#if s.id === 'template'}<div class="chart-legend"><span><i class="dot" style="--tone:var(--s8)"></i>{t('ft.roleMarker')}</span><span><i class="dot" style="--tone:var(--s4)"></i>{t('ft.roleSystem')}</span><span><i class="dot" style="--tone:var(--s2)"></i>{t('ft.roleUser')}</span><span><i class="dot" style="--tone:var(--s1)"></i>{t('ft.roleAssistant')}</span></div>
    {:else}<p class="callout">{t('ft.maskRead', {counted, total: tokens.length})}</p>{/if}
    <p class="note">{ex.templateNote}</p>
   {:else if s.id === 'loss'}
    <h4>{t('ft.lossTitle')}</h4>
    <table class="compact loss-table"><thead><tr><th>{t('ft.targetToken')}</th><th>{t('ft.probability')}</th><th class="num">{t('ft.tokenLoss')}</th></tr></thead><tbody>
     {#each targets as target, i}<tr><td class="mono">{target}</td><td><input type="range" min="0.01" max="0.99" step="0.01" bind:value={probs[i]} aria-label={t('ft.probability')}/> <b>{probs[i].toFixed(2)}</b></td><td class="num">{losses[i].toFixed(2)}</td></tr>{/each}
    </tbody></table>
    <div class="size-tiles three"><div><span>{t('ft.meanLoss')}</span><strong>{meanLoss.toFixed(3)}</strong></div><div><span>{t('ft.perplexity')}</span><strong>{Math.exp(meanLoss).toFixed(2)}</strong></div><div><span>{t('ft.counted')}</span><strong>{targets.length}</strong></div></div>
    <p class="note">{t('ft.lossNote')}</p>
   {:else if s.id === 'backward' || s.id === 'serve'}
    <h4>{t('ft.loraTitle')}</h4>
    <p class="note flush">{f.lora.intro}</p>
    <div class="net-controls">
     <label class="field"><span>{t('ft.baseModel')}</span><select bind:value={slmId}>{#each plannable as x (x.id)}<option value={x.id}>{x.name} ({formatParams(x.params)})</option>{/each}</select></label>
     <label class="net-slider"><span>{t('ft.rank')}<b>{rank}</b></span><input type="range" min="1" max="64" bind:value={rank}/></label>
     <label class="net-toggle"><input type="checkbox" bind:checked={targetsOn.attention}/> {t('ft.targetAttention')}</label>
     <label class="net-toggle"><input type="checkbox" bind:checked={targetsOn.mlp}/> {t('ft.targetMlp')}</label>
     <label class="net-toggle"><input type="checkbox" bind:checked={trained}/> {t('ft.afterTraining')}</label>
    </div>
    <div class="lora-grid">
     <div><span>W ({t('ft.frozen')})</span><div class="mat" style={`--n:${N}`}>{#each Array(N * N) as _, k}<i style={`background:${cell(rnd(Math.floor(k / N), k % N, 3) - .5, .5)}`}></i>{/each}</div></div>
     <b>+</b>
     <div><span>B ({N}×{A.length})</span><div class="mat" style={`--n:${A.length}`}>{#each B.flat() as v}<i style={`background:${cell(v, 1)}`}></i>{/each}</div></div>
     <b>×</b>
     <div><span>A ({A.length}×{N})</span><div class="mat" style={`--n:${N}`}>{#each A.flat() as v}<i style={`background:${cell(v, 1)}`}></i>{/each}</div></div>
     <b>=</b>
     <div><span>ΔW ({t('ft.rankAtMost', {rank: A.length})})</span><div class="mat" style={`--n:${N}`}>{#each dW.flat() as v}<i style={`background:${trained ? cell(v, dMax) : '#fff'}`}></i>{/each}</div></div>
    </div>
    <div class="size-tiles">
     <div><span>{t('ft.matricesPerLayer')}</span><strong>{mats.map(x => x[0]).join(', ') || '—'}</strong></div>
     <div><span>{t('ft.adapterParams')}</span><strong>{formatParams(adapter)}</strong></div>
     <div><span>{t('ft.shareOfTargeted')}</span><strong>{frozenPerLayer ? `${(perLayer / frozenPerLayer * 100).toFixed(2)}%` : '—'}</strong></div>
     <div><span>{t('ft.adapterFile')}</span><strong>{t('ft.mibValue', {value: (adapter * 2 / 1024 ** 2).toFixed(1)})}</strong></div>
    </div>
    <p class="note">{t('ft.loraFormula')} {f.lora.note} {#if s.id === 'serve'}{t('ft.mergeNote')}{/if}</p>
   {:else if s.id === 'update'}
    <h4>{t('ft.scheduleTitle')}</h4>
    <p class="note flush">{f.schedule.intro}</p>
    <div class="net-controls">
     <label class="net-slider"><span>{t('ft.totalSteps')}<b>{steps}</b></span><input type="range" min="100" max="5000" step="100" bind:value={steps}/></label>
     <label class="net-slider"><span>{t('ft.warmup')}<b>{warmup}%</b></span><input type="range" min="0" max="30" bind:value={warmup}/></label>
     <label class="net-slider"><span>{t('ft.peakRate')}<b>{(peak / 1e5).toExponential(0)}</b></span><input type="range" min="1" max="50" bind:value={peak}/></label>
     <label class="field"><span>{t('ft.decay')}</span><select bind:value={decay}><option value="cosine">{t('ft.decayCosine')}</option><option value="linear">{t('ft.decayLinear')}</option><option value="constant">{t('ft.decayConstant')}</option></select></label>
    </div>
    <MiniChart xMin={0} xMax={steps} yMin={0} yMax={50} xLabel={t('lab.steps')} yLabel={t('ft.rate')} aria={t('ft.scheduleTitle')} format={v => (v / 1e5).toExponential(0)}
     series={[{id: 'lr', label: t('ft.rate'), tone: 1, points: lrPoints}]}/>
    <p class="note">{f.schedule.note} <a href={f.schedule.source.url} target="_blank" rel="noreferrer">{f.schedule.source.title}</a></p>
   {:else}
    <h4>{t('ft.evalTitle')}</h4>
    <p>{t('ft.evalText')}</p>
    <a class="btn" href="#/finetuning/lab">{t('ft.openLab')}</a>
   {/if}
  </div>
 </div>
 <div class="stage-nav"><button class="btn small" disabled={stage === 0} on:click={() => stage--}>{t('common.previous')}</button><span>{t('common.positionOf', {position: stage + 1, total: f.stages.length})}</span><button class="btn small primary" disabled={stage === f.stages.length - 1} on:click={() => stage++}>{t('common.next')}</button></div>
</section>
