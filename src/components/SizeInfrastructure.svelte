<script lang="ts">
 import {list, t} from '../lib/content';
 import {infrastructure, minimumProfile, pickInstance, type CloudInstance, type InstancePick, type SizingProfile} from '../lib/infrastructure';
 import {formatGiB, formatParams, formatTokens, safeUrl} from '../lib/selection';
 import type {Model} from '../lib/types';
 export let members: Model[];
 export let model: Model;
 export let onSelect: (id: string) => void;
 type Metric = 'weights' | 'params' | 'context' | 'cache';
 const metrics: {id: Metric; label: string}[] = [{id: 'weights', label: 'infra.metricWeights'}, {id: 'params', label: 'infra.metricParams'}, {id: 'context', label: 'infra.metricContext'}, {id: 'cache', label: 'infra.metricCache'}];
 const valueOf = (m: Model, metric: Metric) => metric === 'weights' ? m.weightGiB : metric === 'params' ? m.totalParams : metric === 'context' ? m.context : m.kvKiBPerToken;
 const format = (v: number | null, metric: Metric) => v === null ? '—' : metric === 'weights' ? formatGiB(v) : metric === 'params' ? formatParams(v) : metric === 'context' ? formatTokens(v) : `${v} KiB`;
 let metric: Metric = 'weights', hover: {m: Model; x: number; y: number} | null = null, contextChoice = 0, sessions = infrastructure.profiles.recommended.sessions, headroom = infrastructure.profiles.recommended.headroomPct;
 const W = 800, BASE = 22, DOT = 11;

 $: metricLabel = t(metrics.find(x => x.id === metric)!.label);
 $: points = members.map(m => ({m, v: valueOf(m, metric)})).filter((x): x is {m: Model; v: number} => x.v !== null && x.v > 0).sort((a, b) => a.v - b.v);
 $: low = points[0]?.v ?? 1;
 $: high = points[points.length - 1]?.v ?? 1;
 $: median = points.length ? points[Math.floor((points.length - 1) / 2)].v : null;
 $: logMin = Math.floor(Math.log10(low));
 $: logMax = Math.max(logMin + 1, Math.ceil(Math.log10(high)));
 $: xOf = (v: number) => 34 + (W - 68) * (Math.log10(v) - logMin) / (logMax - logMin);
 $: ticks = Array.from({length: logMax - logMin + 1}, (_, i) => Math.pow(10, logMin + i));
 $: placed = (() => {
  const used = new Map<number, number>();
  return points.map(p => { const x = xOf(p.v), bin = Math.round(x / DOT), level = used.get(bin) ?? 0; used.set(bin, level + 1); return {...p, x, level}; });
 })();
 $: levels = Math.max(1, ...placed.map(p => p.level + 1));
 $: height = BASE + levels * DOT + 34;
 $: axisY = height - 26;

 $: fullContext = model.context ?? infrastructure.profiles.minimum.contextTokens;
 $: contextOptions = [32768, 131072, 262144, 524288].filter(x => x < fullContext);
 $: contextTokens = contextChoice && contextChoice < fullContext ? contextChoice : fullContext;
 $: minimum = minimumProfile(model);
 $: recommended = {sessions, contextTokens, headroomPct: headroom} as SizingProfile;
 $: rows = infrastructure.clouds.map(cloud => ({cloud, min: pickInstance(model, cloud, minimum, false), rec: pickInstance(model, cloud, recommended, true)}));
 $: referenceRec = rows.find(r => r.rec)?.rec;
 const spec = (i: CloudInstance) => t('infra.instanceSpec', {gpus: `${i.gpus} ×`, gpu: i.gpu, memory: formatGiB(i.gpuMemoryGiB), vcpus: i.vcpus, ram: formatGiB(i.ramGiB)});
 const name = (p: InstancePick) => p.count > 1 ? t('infra.instanceCount', {count: p.count, name: p.instance.name}) : p.instance.name;
</script>
<section class="card">
 <div class="card-title"><h2>{t('infra.title')}</h2>
  <label class="inline-select"><span>{t('infra.metric')}</span><select bind:value={metric}>{#each metrics as x}<option value={x.id}>{t(x.label)}</option>{/each}</select></label>
 </div>
 <div class="size-tiles">
  <div><span>{t('infra.smallest')}</span><strong>{format(points.length ? low : null, metric)}</strong></div>
  <div><span>{t('infra.median')}</span><strong>{format(median, metric)}</strong></div>
  <div><span>{t('infra.largest')}</span><strong>{format(points.length ? high : null, metric)}</strong></div>
  <div class="tile-selected"><span>{t('infra.selectedModel')}</span><strong>{format(valueOf(model, metric), metric)}</strong></div>
 </div>
 <h3>{t('infra.chartTitle', {metric: metricLabel, count: points.length})}</h3>
 <div class="strip-wrap">
  <svg viewBox={`0 0 ${W} ${height}`} role="group" aria-label={t('infra.chartAria', {metric: metricLabel})}>
   {#each ticks as tick}<line class="strip-grid" x1={xOf(tick)} x2={xOf(tick)} y1="6" y2={axisY}/><text class="strip-tick" x={xOf(tick)} y={height - 8}>{format(tick, metric)}</text>{/each}
   <line class="strip-axis" x1="34" x2={W - 34} y1={axisY} y2={axisY}/>
   {#each placed as p (p.m.id)}
    {@const y = axisY - 8 - p.level * DOT}
    <g class="strip-dot" class:selected={p.m.id === model.id} role="button" tabindex="0" aria-label={`${p.m.name}: ${format(p.v, metric)}`} on:click={() => onSelect(p.m.id)} on:keydown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.m.id); } }} on:mouseenter={() => hover = {m: p.m, x: p.x, y}} on:mouseleave={() => hover = null} on:focus={() => hover = {m: p.m, x: p.x, y}} on:blur={() => hover = null}>
     <circle class="hit" cx={p.x} cy={y} r="8"/><circle class="mark" cx={p.x} cy={y} r={p.m.id === model.id ? 6 : 4.5}/>
    </g>
   {/each}
  </svg>
  {#if hover}<div class="strip-tip" style={`left:${hover.x / W * 100}%;top:${hover.y / height * 100}%`}><b>{hover.m.name}</b><span>{format(valueOf(hover.m, metric), metric)}</span></div>{/if}
 </div>
 <p class="note flush">{t('infra.logNote')}</p>
</section>
<section class="card">
 <h2>{t('infra.sizingTitle', {model: model.name})}</h2>
 <div class="size-tiles three">
  <div><span>{t('infra.weights')}</span><strong>{formatGiB(model.weightGiB)}</strong></div>
  <div><span>{t('infra.precision')}</span><strong>{model.official?.storedPrecision || t('infra.notPublished')}</strong></div>
  <div><span>{t('infra.cache')}</span><strong>{model.kvKiBPerToken === null ? t('infra.notPublished') : `${model.kvKiBPerToken} KiB`}</strong></div>
 </div>
 <div class="infra-controls">
  <label class="field"><span>{t('infra.contextControl')}</span><select bind:value={contextChoice}><option value={0}>{t('infra.contextFull', {value: formatTokens(fullContext)})}</option>{#each contextOptions as c}<option value={c}>{formatTokens(c)}</option>{/each}</select></label>
  <label class="net-slider"><span>{t('infra.sessionsControl')}<b>{sessions}</b></span><input type="range" min="1" max="64" bind:value={sessions}/></label>
  <label class="net-slider"><span>{t('infra.headroomControl')}<b>{headroom}</b></span><input type="range" min="0" max="100" step="5" bind:value={headroom}/></label>
 </div>
 <p class="note">{t('infra.needMinimum', {context: formatTokens(minimum.contextTokens), headroom: minimum.headroomPct})}</p>
 {#if referenceRec}<p class="note flush">{t('infra.needRecommended', {memory: formatGiB(referenceRec.memoryGiB), sessions, context: formatTokens(contextTokens), headroom})}</p>{/if}
 {#if model.kvKiBPerToken === null}<p class="callout warn">{t('infra.cacheMissing')}</p>{/if}
 <div class="table-wrap auto infra-table"><table><thead><tr><th>{t('infra.cloud')}</th><th>{t('infra.minimum')}</th><th>{t('infra.recommended')}</th></tr></thead><tbody>
  {#each rows as r (r.cloud.id)}
   <tr><td><strong>{r.cloud.name}</strong></td>
    {#each [r.min, r.rec] as pick}
     <td>{#if pick}
      <div class="inst-name">{name(pick)}</div><small>{spec(pick.instance)}</small><small>{t('infra.needs', {memory: formatGiB(pick.memoryGiB)})}</small>
      {#if pick.count > 1}<span class="status confirm">{t('infra.multiNode')}</span>{/if}
      {#if pick.expanded}<span class="status confirm">{t('infra.expanded', {memory: formatGiB(pick.weightsGiB)})}</span>{/if}
     {:else}—{/if}</td>
    {/each}
   </tr>
  {/each}
 </tbody></table></div>
 <h3>{t('infra.method')}</h3>
 <ol class="plain">{#each list('infra.methodSteps') as step}<li>{step}</li>{/each}</ol>
 <p class="note">{infrastructure.basis}</p>
 <h3>{t('infra.sourcesTitle', {date: infrastructure.retrievedOn})}</h3>
 <div class="source-links">
  {#each [...infrastructure.clouds.flatMap(c => c.sources), ...infrastructure.formatSources] as s (s.url)}{#if safeUrl(s.url)}<a href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}</a>{/if}{/each}
 </div>
</section>
