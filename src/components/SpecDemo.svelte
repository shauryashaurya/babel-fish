<script lang="ts">
 import MiniChart, {type ChartSeries} from './MiniChart.svelte';
 import {fmtGiB, fmtInt, fmtTokens, type Arch} from '../lib/compare';
 import {t} from '../lib/content';
 export let demo: string;
 export let items: Arch[];
 export let all: Arch[];

 // Models to prefill from: the current comparison, or a few catalog examples when it is empty.
 $: pool = items.length ? items : all.filter(a => a.heads && a.kvHeads && a.headDim && a.layers).slice(0, 5);
 let fromId = '';
 $: if (!pool.some(a => a.id === fromId)) fromId = pool[0]?.id ?? '';
 $: from = pool.find(a => a.id === fromId) ?? pool[0];
 let lastFrom = '';
 $: if (from && from.id !== lastFrom) { lastFrom = from.id; load(from); }

 // Shared state, loaded from the chosen model and then free to change.
 let hq = 32, hkv = 8, dh = 128, layersFull = 32, layersWindow = 0, windowSize = 4096, bytes = 2, sessions = 1, latent = false, rank = 512, ropeDim = 64;
 let base = 10000, experts = 64, active = 8, expertWidth = 1024, hidden = 4096, cap = 30;
 function load(a: Arch) {
  hq = a.heads ?? 32; hkv = a.kvHeads ?? hq; dh = a.headDim ?? 128; latent = a.attentionType === 'MLA'; rank = a.latentRank ?? 512;
  layersFull = a.cache ? a.cache.full : a.layers ?? 32; layersWindow = a.cache ? a.cache.window : 0; windowSize = a.cache?.windowSize ?? 4096;
  base = a.rope?.theta ?? 10000; hidden = a.hidden ?? 4096;
  experts = a.experts ?? 64; active = a.expertsActive ?? 8; expertWidth = a.moeIntermediate ?? a.intermediate ?? 1024;
  cap = a.logitSoftcap ?? 30;
 }

 // Heads
 $: groupSize = Math.max(1, Math.round(hq / Math.max(1, hkv)));
 $: perLayerValues = latent ? rank + ropeDim : 2 * hkv * dh;
 $: mhaValues = 2 * hq * dh;

 // Mask
 const N = 20;
 let maskWindow = 5, maskMode: 'full' | 'window' = 'window', query = N - 1;
 $: maskOn = (i: number, j: number) => j <= i && (maskMode === 'full' || i - j < maskWindow);
 $: cached = maskMode === 'full' ? query + 1 : Math.min(query + 1, maskWindow);

 // RoPE
 let position = 12;
 $: pairs = Math.max(2, Math.floor(dh / 2));
 $: thetas = Array.from({length: pairs}, (_, i) => base ** (-2 * i / (2 * pairs)));
 $: dials = [0, Math.floor(pairs / 4), Math.floor(pairs / 2), pairs - 1].map(i => ({i, angle: position * thetas[i], wavelength: 2 * Math.PI / thetas[i]}));
 $: ropeSeries = [
  {id: 'model', label: t('compare.demo.ropeThisBase', {base: fmtInt(Math.round(base)) ?? ''}), tone: 1, points: thetas.map((th, i) => [i, 2 * Math.PI / th] as [number, number])},
  {id: 'ref', label: t('compare.demo.ropeRefBase'), tone: 8, dashed: true, points: Array.from({length: pairs}, (_, i) => [i, 2 * Math.PI / (10000 ** (-2 * i / (2 * pairs)))] as [number, number])},
 ] as ChartSeries[];
 $: ropeMax = Math.max(...ropeSeries.flatMap(s => s.points.map(p => p[1])));
 const dialPoint = (angle: number, r: number) => [Math.cos(angle) * r, -Math.sin(angle) * r];

 // Norm
 let vec = [2.0, -1.0, 0.5, 3.0, -0.5, 1.0];
 $: mean = vec.reduce((s, v) => s + v, 0) / vec.length;
 $: variance = vec.reduce((s, v) => s + (v - mean) ** 2, 0) / vec.length;
 $: rms = Math.sqrt(vec.reduce((s, v) => s + v * v, 0) / vec.length + 1e-6);
 $: ln = vec.map(v => (v - mean) / Math.sqrt(variance + 1e-6));
 $: rn = vec.map(v => v / rms);
 const barW = (v: number) => `${Math.min(50, Math.abs(v) / 4 * 50)}%`;

 // Activation
 const xsA = Array.from({length: 81}, (_, i) => -4 + i * .1);
 const gelu = (x: number) => .5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + .044715 * x ** 3)));
 const silu = (x: number) => x / (1 + Math.exp(-x));
 const actSeries: ChartSeries[] = [
  {id: 'relu', label: 'ReLU', tone: 8, dashed: true, points: xsA.map(x => [x, Math.max(0, x)])},
  {id: 'gelu', label: 'GELU', tone: 2, points: xsA.map(x => [x, gelu(x)])},
  {id: 'silu', label: t('compare.demo.silu'), tone: 1, points: xsA.map(x => [x, silu(x)])},
 ];
 $: activations = items.map(a => ({a, act: a.activation}));

 // Cache
 $: cachePerToken = latent ? (layersFull + layersWindow) * (rank + ropeDim) * bytes : (layersFull + layersWindow) * 2 * hkv * dh * bytes;
 $: cacheBytes = latent
  ? (layersFull * context + layersWindow * Math.min(context, windowSize)) * (rank + ropeDim) * bytes
  : (layersFull * context + layersWindow * Math.min(context, windowSize)) * 2 * hkv * dh * bytes;
 $: cacheGiBTotal = cacheBytes * sessions / 1024 ** 3;
 let ctxLog = 15;
 $: context = 2 ** ctxLog;

 // Soft-capping
 const xsS = Array.from({length: 101}, (_, i) => -100 + i * 2);
 $: capSeries = [
  {id: 'raw', label: t('compare.demo.rawLogit'), tone: 8, dashed: true, points: xsS.map(x => [x, x])},
  {id: 'cap', label: t('compare.demo.capped', {cap}), tone: 1, points: xsS.map(x => [x, cap * Math.tanh(x / cap)])},
 ] as ChartSeries[];

 // Experts (gated feed-forward: three d x w matrices per expert)
 $: perExpert = 3 * hidden * expertWidth;
 $: totalFfn = experts * perExpert;
 $: activeFfn = Math.min(active, experts) * perExpert;
 const big = (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toLocaleString('en-US');
</script>

{#if pool.length && ['heads', 'cache', 'rope', 'experts', 'softcap'].includes(demo)}
 <div class="card-title"><h2>{t('compare.demo.title')}</h2>
  <label class="field inline"><span>{t('compare.demo.loadFrom')}</span><select bind:value={fromId}>{#each pool as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select></label>
 </div>
{:else}<h2>{t('compare.demo.title')}</h2>{/if}

{#if demo === 'heads'}
 <div class="net-controls">
  <label class="net-slider"><span>{t('compare.demo.queryHeads')}<b>{hq}</b></span><input type="range" min="1" max="128" bind:value={hq}/></label>
  <label class="net-slider"><span>{t('compare.demo.kvHeads')}<b>{latent ? '—' : hkv}</b></span><input type="range" min="1" max={hq} bind:value={hkv} disabled={latent}/></label>
  <label class="net-slider"><span>{t('compare.demo.headSize')}<b>{dh}</b></span><input type="range" min="32" max="512" step="16" bind:value={dh}/></label>
  <label class="net-toggle"><input type="checkbox" bind:checked={latent}/> {t('compare.demo.latent')}</label>
 </div>
 <div class="heads-viz" aria-label={t('compare.demo.headsAria', {hq, hkv})}>
  <div class="heads-row"><span>{t('compare.demo.queries')}</span><div>{#each Array(hq) as _, i}<i class={`series-${latent ? 1 : (Math.floor(i / groupSize) % 7) + 1}`} title={t('compare.demo.queryHead', {n: i + 1})}></i>{/each}</div></div>
  <div class="heads-row"><span>{t(latent ? 'compare.demo.latentRow' : 'compare.demo.keysValues')}</span><div>{#if latent}<i class="latent-box" title={t('compare.demo.latentBox', {rank})}>{t('compare.demo.latentBox', {rank})}</i>{:else}{#each Array(Math.min(hkv, hq)) as _, i}<i class={`series-${(i % 7) + 1} kv`} title={t('compare.demo.kvHead', {n: i + 1, g: groupSize})}></i>{/each}{/if}</div></div>
 </div>
 <p class="callout">{latent ? t('compare.demo.latentResult', {values: perLayerValues.toLocaleString('en-US'), mha: mhaValues.toLocaleString('en-US'), ratio: (mhaValues / perLayerValues).toFixed(1)}) : t('compare.demo.headsResult', {g: groupSize, values: perLayerValues.toLocaleString('en-US'), mha: mhaValues.toLocaleString('en-US'), ratio: (mhaValues / perLayerValues).toFixed(1)})}</p>
{:else if demo === 'mask'}
 <div class="net-controls">
  <label class="field"><span>{t('compare.demo.layerKind')}</span><select bind:value={maskMode}><option value="full">{t('compare.demo.global')}</option><option value="window">{t('compare.demo.sliding')}</option></select></label>
  <label class="net-slider"><span>{t('compare.demo.window')}<b>{maskWindow}</b></span><input type="range" min="1" max={N} bind:value={maskWindow} disabled={maskMode === 'full'}/></label>
  <label class="net-slider"><span>{t('compare.demo.currentToken')}<b>{query + 1}</b></span><input type="range" min="0" max={N - 1} bind:value={query}/></label>
 </div>
 <div class="mask-wrap">
  <svg viewBox={`0 0 ${N * 14 + 30} ${N * 14 + 30}`} class="mask-svg" role="img" aria-label={t('compare.demo.maskAria')}>
   <text x="30" y="10" class="chart-tick">{t('compare.demo.earlierTokens')}</text>
   {#each Array(N) as _, i}{#each Array(N) as __, j}<rect x={30 + j * 14} y={16 + i * 14} width="12" height="12" rx="2" class:on={maskOn(i, j)} class:row={i === query} class="mask-cell"/>{/each}{/each}
  </svg>
  <p>{t('compare.demo.maskResult', {n: cached, pos: query + 1})}</p>
 </div>
{:else if demo === 'rope'}
 <div class="net-controls">
  <label class="net-slider"><span>{t('compare.demo.base')}<b>{fmtInt(Math.round(base))}</b></span><input type="range" min="3" max="8" step=".05" value={Math.log10(base)} on:input={e => base = 10 ** +e.currentTarget.value}/></label>
  <label class="net-slider"><span>{t('compare.demo.headSize')}<b>{dh}</b></span><input type="range" min="32" max="512" step="16" bind:value={dh}/></label>
  <label class="net-slider"><span>{t('compare.demo.position')}<b>{position}</b></span><input type="range" min="0" max="64" bind:value={position}/></label>
 </div>
 <div class="dials">
  {#each dials as d (d.i)}
   {@const [x, y] = dialPoint(d.angle, 30)}
   <figure><svg viewBox="-40 -40 80 80" role="img" aria-label={t('compare.demo.dialAria', {i: d.i})}><circle r="34" class="dial-ring"/><line x1="0" y1="0" x2="34" y2="0" class="dial-zero"/><line x1="0" y1="0" x2={x} y2={y} class="dial-hand"/><circle cx={x} cy={y} r="4" class="dial-tip"/></svg>
    <figcaption>{t('compare.demo.pair', {i: d.i})}<small>{t('compare.demo.wavelength', {n: d.wavelength < 1e6 ? Math.round(d.wavelength).toLocaleString('en-US') : d.wavelength.toExponential(1)})}</small></figcaption></figure>
  {/each}
 </div>
 <MiniChart series={ropeSeries} xMin={0} xMax={pairs - 1} yMin={1} yMax={ropeMax} log format={v => v >= 1e4 ? v.toExponential(0) : String(Math.round(v))} xLabel={t('compare.demo.pairIndex')} yLabel={t('compare.demo.wavelengthAxis')} aria={t('compare.demo.ropeAria')}/>
 <p class="note">{t('compare.demo.ropeNote')}</p>
{:else if demo === 'norm'}
 <div class="norm-grid">
  <div class="norm-col"><h3>{t('compare.demo.input')}</h3>{#each vec as v, i}<label class="norm-row"><input type="range" min="-4" max="4" step=".1" bind:value={vec[i]} aria-label={t('compare.demo.feature', {n: i + 1})}/><b>{v.toFixed(1)}</b></label>{/each}</div>
  <div class="norm-col"><h3>{t('compare.demo.layerNorm')}</h3>{#each ln as v}<div class="norm-bar"><i class:neg={v < 0} style={`width:${barW(v)}`}></i><b>{v.toFixed(2)}</b></div>{/each}<small>{t('compare.demo.meanStd', {mean: mean.toFixed(2), std: Math.sqrt(variance).toFixed(2)})}</small></div>
  <div class="norm-col"><h3>{t('compare.demo.rmsNorm')}</h3>{#each rn as v}<div class="norm-bar"><i class:neg={v < 0} style={`width:${barW(v)}`}></i><b>{v.toFixed(2)}</b></div>{/each}<small>{t('compare.demo.rms', {rms: rms.toFixed(2)})}</small></div>
 </div>
 <p class="note">{t('compare.demo.normNote')}</p>
{:else if demo === 'activation'}
 <MiniChart series={actSeries} xMin={-4} xMax={4} yMin={-1} yMax={4} format={v => v.toFixed(1)} xLabel={t('compare.demo.inputValue')} yLabel={t('compare.demo.outputValue')} aria={t('compare.demo.activationAria')}/>
 {#if activations.length}<p class="note">{#each activations as x, i}{i ? ' · ' : ''}<b>{x.a.name}</b>: {x.act ?? t('compare.notStated')}{/each}</p>{/if}
 <p class="note">{t('compare.demo.activationNote')}</p>
{:else if demo === 'cache'}
 <div class="net-controls">
  <label class="net-slider"><span>{t('compare.demo.fullLayers')}<b>{layersFull}</b></span><input type="range" min="0" max="128" bind:value={layersFull}/></label>
  <label class="net-slider"><span>{t('compare.demo.windowLayers')}<b>{layersWindow}</b></span><input type="range" min="0" max="128" bind:value={layersWindow}/></label>
  <label class="net-slider"><span>{t('compare.demo.window')}<b>{fmtInt(windowSize)}</b></span><input type="range" min="128" max="8192" step="128" bind:value={windowSize}/></label>
  {#if latent}<label class="net-slider"><span>{t('compare.demo.latentRank')}<b>{rank}</b></span><input type="range" min="64" max="1024" step="32" bind:value={rank}/></label>
  {:else}<label class="net-slider"><span>{t('compare.demo.kvHeads')}<b>{hkv}</b></span><input type="range" min="1" max="128" bind:value={hkv}/></label>
   <label class="net-slider"><span>{t('compare.demo.headSize')}<b>{dh}</b></span><input type="range" min="32" max="512" step="16" bind:value={dh}/></label>{/if}
  <label class="field"><span>{t('compare.cachePrecision')}</span><select bind:value={bytes}><option value={2}>{t('slm.precision.bit16')}</option><option value={1}>{t('slm.precision.bit8')}</option></select></label>
  <label class="net-slider"><span>{t('compare.contextUsed')}<b>{fmtTokens(context)}</b></span><input type="range" min="10" max="20" bind:value={ctxLog}/></label>
  <label class="net-slider"><span>{t('slm.sessions')}<b>{sessions}</b></span><input type="range" min="1" max="64" bind:value={sessions}/></label>
  <label class="net-toggle"><input type="checkbox" bind:checked={latent}/> {t('compare.demo.latent')}</label>
 </div>
 <div class="kpis compact">
  <div><span>{t('compare.demo.perToken')}</span><strong>{t('compare.demo.kib', {value: (cachePerToken / 1024).toFixed(1)})}</strong></div>
  <div><span>{t('compare.demo.perSession')}</span><strong>{fmtGiB(cacheBytes / 1024 ** 3)}</strong></div>
  <div><span>{t('compare.demo.allSessions', {n: sessions})}</span><strong>{fmtGiB(cacheGiBTotal)}</strong></div>
 </div>
 <p class="note">{t('compare.demo.cacheNote')}</p>
{:else if demo === 'softcap'}
 <div class="net-controls"><label class="net-slider"><span>{t('compare.demo.cap')}<b>{cap}</b></span><input type="range" min="5" max="100" bind:value={cap}/></label></div>
 <MiniChart series={capSeries} xMin={-100} xMax={100} yMin={-100} yMax={100} format={v => v.toFixed(0)} xLabel={t('compare.demo.rawLogit')} yLabel={t('compare.demo.cappedAxis')} aria={t('compare.demo.softcapAria')}/>
 <p class="note">{t('compare.demo.softcapNote')}</p>
{:else if demo === 'experts'}
 <div class="net-controls">
  <label class="net-slider"><span>{t('compare.demo.experts')}<b>{experts}</b></span><input type="range" min="1" max="512" bind:value={experts}/></label>
  <label class="net-slider"><span>{t('compare.demo.activeExperts')}<b>{Math.min(active, experts)}</b></span><input type="range" min="1" max={Math.max(1, Math.min(32, experts))} bind:value={active}/></label>
  <label class="net-slider"><span>{t('compare.demo.expertWidth')}<b>{fmtInt(expertWidth)}</b></span><input type="range" min="128" max="32768" step="128" bind:value={expertWidth}/></label>
  <label class="net-slider"><span>{t('compare.demo.hidden')}<b>{fmtInt(hidden)}</b></span><input type="range" min="256" max="16384" step="128" bind:value={hidden}/></label>
 </div>
 <div class="expert-grid" aria-label={t('compare.demo.expertAria', {k: Math.min(active, experts), e: experts})}>
  {#each Array(Math.min(experts, 256)) as _, i}<i class:on={i < Math.min(active, experts)}></i>{/each}
 </div>
 <div class="stack-bars">
  <div class="stack-bar-row"><span>{t('compare.legendTotal')}</span><div class="stack-bar"><i class="total" style="width:100%"><i class="active" style={`width:${100 * activeFfn / totalFfn}%`}></i></i></div><small>{t('compare.demo.ffnParams', {total: big(totalFfn), active: big(activeFfn), pct: (100 * activeFfn / totalFfn).toFixed(1)})}</small></div>
 </div>
 <p class="note">{t('compare.demo.expertsNote')} <a href="#/architecture/concepts">{t('compare.demo.expertLab')}</a></p>
{/if}
