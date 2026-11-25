<script lang="ts">
 import {onDestroy} from 'svelte';
 import {blockDef, type ControlDef} from '../lib/architecture';
 import {t} from '../lib/content';
 import {SCENE_HEIGHT, SCENE_WIDTH, simulate, type Params, type SceneEdge, type SceneNode} from '../lib/neural';
 import type {Model} from '../lib/types';
 export let blockId: string;
 export let model: Model | null = null;
 let params: Params = {}, bounds: Record<string, number> = {}, key = '', selectedId = '', hoverId = '', playing = false;
 let timer: ReturnType<typeof setInterval> | undefined;

 function presets(m: Model | null): Params {
  const o = m?.official;
  if (!o) return {};
  const raw: Record<string, number | null | undefined> = {queryHeads: o.heads, kvHeads: o.kvHeads, latentRank: o.kvLatentRank, experts: o.experts, active: o.expertsActive, shared: o.sharedExperts, kernel: o.convKernel, horizon: o.mtpModules,
   headDim: o.hiddenSize && o.heads ? Math.round(o.hiddenSize / o.heads) : null};
  return Object.fromEntries(Object.entries(raw).filter((x): x is [string, number] => typeof x[1] === 'number' && x[1] > 0));
 }
 function reset() {
  const def = blockDef(blockId), preset = presets(model);
  const next: Params = {head: 0, hiddenSize: model?.official?.hiddenSize ?? 1024}, limits: Record<string, number> = {};
  for (const c of def.controls) {
   const value = preset[c.id] ?? c.value;
   next[c.id] = value;
   limits[c.id] = Math.max(c.max, value);
  }
  params = next; bounds = limits; selectedId = ''; hoverId = '';
 }
 function stop() { playing = false; if (timer) clearInterval(timer); timer = undefined; }
 $: nextKey = `${blockId}:${model?.id ?? ''}`;
 $: if (nextKey !== key) { key = nextKey; stop(); reset(); }
 $: def = blockDef(blockId);
 $: scene = simulate(def.scene, blockId, params);
 $: nodeById = new Map(scene.nodes.map(n => [n.id, n]));
 $: focusId = hoverId || selectedId;
 $: focusNode = nodeById.get(focusId);
 $: linked = focusId ? new Set(scene.edges.filter(e => e.from === focusId || e.to === focusId).flatMap(e => [e.from, e.to])) : null;

 const maxPosition = (p: Params) => Math.max(1, (p.tokens ?? 16) - 1 - (blockId === 'mtp' ? (p.horizon ?? 0) : 0));
 const limitOf = (c: ControlDef, p: Params) => {
  const base = bounds[c.id] ?? c.max;
  if (c.id === 'position') return maxPosition(p);
  if (c.id === 'window' || c.id === 'topK') return Math.max(1, (p.tokens ?? 16) - 1);
  if (c.id === 'kvHeads') return Math.min(base, p.queryHeads ?? base);
  if (c.id === 'active') return Math.min(base, p.experts ?? base);
  return base;
 };
 function setParam(id: string, value: number) {
  const next = {...params, [id]: value};
  next.position = Math.min(next.position ?? 1, maxPosition(next));
  if (next.window !== undefined) next.window = Math.min(next.window, Math.max(1, next.tokens - 1));
  if (next.topK !== undefined) next.topK = Math.min(next.topK, Math.max(1, next.tokens - 1));
  if (next.kvHeads !== undefined && next.queryHeads !== undefined) next.kvHeads = Math.min(next.kvHeads, next.queryHeads);
  if (next.active !== undefined && next.experts !== undefined) next.active = Math.min(next.active, next.experts);
  params = next;
 }
 const advance = () => { const limit = maxPosition(params); setParam('position', params.position >= limit ? 1 : params.position + 1); };
 function togglePlay() {
  if (playing) return stop();
  playing = true;
  timer = setInterval(advance, 700);
 }
 function activate(n: SceneNode) {
  selectedId = n.id;
  if (n.action) setParam(n.action.param, n.action.value);
 }
 function keyActivate(event: KeyboardEvent, n: SceneNode) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(n); }
 }
 const fill = (n: SceneNode) => {
  if (n.tone === 'future') return 'var(--net-empty)';
  if (n.tone === 'muted') return 'var(--net-muted)';
  if (n.tone === 'focus') return 'var(--net-focus)';
  const v = Math.max(0, Math.min(1, n.value)), a = [219, 232, 247], b = [24, 78, 150];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * v)).join(',')})`;
 };
 const labelInk = (n: SceneNode) => n.tone === 'focus' || (n.tone === 'value' && n.value > .5) ? 'net-label light' : 'net-label';
 function path(e: SceneEdge) {
  const a = nodeById.get(e.from), b = nodeById.get(e.to);
  if (!a || !b) return '';
  const y1 = a.y + a.h / 2, y2 = b.y - b.h / 2, mid = (y1 + y2) / 2;
  return `M ${a.x} ${y1} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${y2}`;
 }
 const edgeOpacity = (e: SceneEdge, focus: string) => focus ? (e.from === focus || e.to === focus ? Math.max(.65, e.weight) : .04) : .1 + e.weight * .75;
 onDestroy(stop);
</script>
<div class="net">
 <div class="net-controls">
  {#each def.controls as c (c.id)}
   {#if c.toggle}
    <label class="net-toggle"><input type="checkbox" checked={!!params[c.id]} on:change={e => setParam(c.id, e.currentTarget.checked ? 1 : 0)}/> {t(`net.control.${c.id}`)}</label>
   {:else}
    <label class="net-slider"><span>{t(`net.control.${c.id}`)}<b>{((params[c.id] ?? c.value) + (c.id === 'position' ? 1 : 0)).toLocaleString('en-US')}</b></span>
     <input type="range" min={c.min} max={limitOf(c, params)} step={c.step} value={params[c.id] ?? c.value} on:input={e => setParam(c.id, Number(e.currentTarget.value))}/>
    </label>
   {/if}
  {/each}
  <div class="net-buttons">
   <button class="btn small primary" on:click={togglePlay}>{t(playing ? 'net.pause' : 'net.play')}</button>
   <button class="btn small" on:click={advance}>{t('net.step')}</button>
   <button class="btn small" on:click={() => { stop(); reset(); }}>{t('net.reset')}</button>
  </div>
 </div>
 <div class="net-stage">
  <div class="net-canvas">
   <svg viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`} role="group" aria-label={t('net.diagram')}>
    {#each scene.lanes as lane (lane.label)}<text class="net-lane" x="4" y={lane.y + 4}>{lane.label}</text>{/each}
    <g class="net-edges">{#each scene.edges as e, i (`${e.from}-${e.to}-${i}`)}<path d={path(e)} stroke-width={.6 + e.weight * 2.2} opacity={edgeOpacity(e, focusId)} class:lit={!!focusId && (e.from === focusId || e.to === focusId)}/>{/each}</g>
    {#each scene.nodes as n (n.id)}
     <g class="net-node" class:clickable={!!n.action} class:picked={selectedId === n.id} class:faded={!!linked && !linked.has(n.id) && n.id !== focusId} role="button" tabindex={n.action ? 0 : -1} aria-label={n.info.title}
      on:click={() => activate(n)} on:keydown={e => keyActivate(e, n)} on:mouseenter={() => hoverId = n.id} on:mouseleave={() => hoverId = ''} on:focus={() => hoverId = n.id} on:blur={() => hoverId = ''}>
      {#if n.round}<circle cx={n.x} cy={n.y} r={n.w / 2} fill={fill(n)} class:dashed={n.tone === 'future'}/>
      {:else}<rect x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h} rx="3" fill={fill(n)} class:dashed={n.tone === 'future'}/>{/if}
      {#if n.label}<text class={labelInk(n)} x={n.x} y={n.y + 4}>{n.label}</text>{/if}
     </g>
    {/each}
   </svg>
   <div class="net-legend"><span>{t('net.legendLow')}</span><i></i><span>{t('net.legendHigh')}</span></div>
  </div>
  <aside class="net-inspector" aria-live="polite">
   <h3>{t('net.inspector')}</h3>
   {#if focusNode}
    <p class="net-title">{focusNode.info.title}</p>
    <p class="net-shape">{t('net.shapeLabel')}: <code>{focusNode.info.shape}</code></p>
    <p>{focusNode.info.detail}</p>
   {:else}<p class="net-hint">{t('net.hint')}</p>{/if}
   <h3>{t('net.liveValues')}</h3>
   <dl>{#each scene.readouts as r (r.label)}<div><dt>{r.label}</dt><dd>{r.value}</dd></div>{/each}</dl>
  </aside>
 </div>
 {#if scene.note}<p class="note flush">{scene.note}</p>{/if}
 <p class="note flush">{[model ? t('net.fromModel', {model: model.name}) : '', t('net.illustration')].filter(Boolean).join(' ')}</p>
</div>
