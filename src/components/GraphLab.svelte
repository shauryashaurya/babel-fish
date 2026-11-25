<script lang="ts">
 import BarList from './BarList.svelte';
 import {mechanisms} from '../lib/architecture';
 import {t} from '../lib/content';
 import {buildGraph, communities, rag, type GraphNode, type NodeKind} from '../lib/rag';
 import {commercialLabel} from '../lib/selection';
 import type {CommercialStatus, Model} from '../lib/types';
 export let models: Model[];
 const g = buildGraph(models);
 const kinds: NodeKind[] = ['model', 'publisher', 'family', 'mechanism', 'licence'];
 const kindColor: Record<NodeKind, string> = {model: 'var(--s1)', publisher: 'var(--s2)', family: 'var(--s3)', mechanism: 'var(--s4)', licence: 'var(--s7)'};
 const modes = ['local', 'multihop', 'global'] as const;
 let mode: typeof modes[number] = 'local';

 // Local search: an entity and its neighbourhood
 let centre = 'mechanism:mla', trail: string[] = [];
 $: node = g.nodes.get(centre)!;
 $: ring = [...g.adj.get(centre)!].map(id => g.nodes.get(id)!).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.label.localeCompare(b.label));
 $: shown = ring.slice(0, 40);
 $: secondHop = new Set(ring.flatMap(n => [...g.adj.get(n.id)!]).filter(id => id !== centre && !g.adj.get(centre)!.has(id)));
 $: byKind = kinds.map(k => ({k, n: ring.filter(x => x.kind === k).length})).filter(x => x.n);
 function focus(id: string) { if (id === centre) return; trail = [...trail, centre].slice(-6); centre = id; }
 const W = 640, H = 420, cx = W / 2, cy = H / 2;
 $: pos = (i: number) => { const a = -Math.PI / 2 + 2 * Math.PI * i / Math.max(shown.length, 1), r = shown.length > 20 ? 170 : 140; return [cx + r * Math.cos(a) * 1.35, cy + r * Math.sin(a)]; };
 let hover: GraphNode | null = null;
 const entities = [...g.nodes.values()].filter(n => n.kind !== 'model').sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.label.localeCompare(b.label));

 // Multi-hop: join several relations
 const mechIds = mechanisms.filter(m => g.nodes.has(`mechanism:${m.id}`)).map(m => m.id);
 const statuses: CommercialStatus[] = ['allowed', 'conditional', 'prohibited'];
 let mechA = 'moe', mechB = 'mla', commercial = 'allowed';
 $: hopModels = models.filter(m => {
  const n = g.adj.get(`model:${m.id}`)!;
  return n.has(`mechanism:${mechA}`) && (!mechB || n.has(`mechanism:${mechB}`)) && (!commercial || m.license.rule.commercial === commercial);
 });
 $: hopPublishers = [...hopModels.reduce((m, x) => m.set(x.publisher, [...(m.get(x.publisher) ?? []), x]), new Map<string, Model[]>())].sort((a, b) => b[1].length - a[1].length);
 const mechName = (id: string) => mechanisms.find(m => m.id === id)?.name ?? id;

 // Global: communities and summaries computed from them
 let threshold = 60;
 $: groups = communities(g, threshold / 100);
 $: big = groups.filter(c => c.ids.length > 1);
 $: singles = groups.length - big.length;
 let open = 0;
 const summary = (c: ReturnType<typeof communities>[number]) => t('rag.communitySummary', {
  n: c.ids.length, family: c.family[0]?.node.label ?? '—', familyN: c.family[0]?.count ?? 0,
  mechs: c.mechanism.slice(0, 3).map(m => `${m.node.label} (${m.count})`).join(', ') || '—',
  publishers: c.publisher.slice(0, 4).map(p => p.node.label).join(', ') + (c.publisher.length > 4 ? t('rag.andMore', {n: c.publisher.length - 4}) : ''),
 });
</script>
<section class="card">
 <h2>{t('rag.graphTitle')}</h2>
 <p class="note flush">{t('rag.graphIntro', {nodes: g.nodes.size, models: models.length, edges: [...g.adj.values()].reduce((s, x) => s + x.size, 0) / 2})}</p>
 <div class="section-tabs inner-tabs" role="tablist">
  {#each modes as m}<button role="tab" aria-selected={mode === m} class:on={mode === m} on:click={() => mode = m}>{t(`rag.g_${m}`)}</button>{/each}
 </div>
 {#if mode === 'local'}
  <p class="note">{t('rag.localIntro')}</p>
  <div class="net-controls">
   <label class="field"><span>{t('rag.entity')}</span><select bind:value={centre}>{#each entities as e (e.id)}<option value={e.id}>{t(`rag.kind_${e.kind}`)}: {e.label}</option>{/each}{#if node.kind === 'model'}<option value={centre}>{t('rag.kind_model')}: {node.label}</option>{/if}</select></label>
   {#if trail.length}<button class="btn small back-btn" on:click={() => { centre = trail[trail.length - 1]; trail = trail.slice(0, -1); }}>{t('rag.backTo', {name: g.nodes.get(trail[trail.length - 1])?.label ?? ''})}</button>{/if}
  </div>
  <div class="chart-legend">{#each kinds as k}<span><i class="dot" style={`--tone:${kindColor[k]}`}></i>{t(`rag.kind_${k}`)}</span>{/each}</div>
  <div class="graph-wrap">
   <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('rag.graphTitle')}>
    {#each shown as n, i (n.id)}<line x1={cx} y1={cy} x2={pos(i)[0]} y2={pos(i)[1]} class="edge" class:hot={hover?.id === n.id}/>{/each}
    {#each shown as n, i (n.id)}
     <g class="gnode" role="button" tabindex="0" on:click={() => focus(n.id)} on:keydown={e => e.key === 'Enter' && focus(n.id)} on:pointerenter={() => hover = n} on:pointerleave={() => hover = null}>
      <circle cx={pos(i)[0]} cy={pos(i)[1]} r="9" fill={kindColor[n.kind]} stroke="#fcfcfb" stroke-width="2"/>
      <circle cx={pos(i)[0]} cy={pos(i)[1]} r="16" fill="transparent"/>
      {#if shown.length <= 24 || hover?.id === n.id}<text x={pos(i)[0]} y={pos(i)[1] + (pos(i)[1] > cy ? 22 : -14)} class="glabel">{n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}</text>{/if}
     </g>
    {/each}
    <circle cx={cx} cy={cy} r="16" fill={kindColor[node.kind]} stroke="#172033" stroke-width="2"/>
    <text x={cx} y={cy + 32} class="glabel strong">{node.label}</text>
   </svg>
   {#if hover}<div class="chart-tip" style="left:50%;top:4px">{t(`rag.kind_${hover.kind}`)}: <b>{hover.label}</b> · {t('rag.links', {n: g.adj.get(hover.id)?.size ?? 0})}</div>{/if}
  </div>
  <p class="callout">{t('rag.localRead', {name: node.label, n: ring.length, hop2: secondHop.size})} {byKind.map(x => t('rag.kindCount', {kind: t(`rag.kind_${x.k}`), n: x.n})).join('; ')}.{#if ring.length > shown.length} {t('rag.capped', {shown: shown.length})}{/if}
   {#if node.href} <a href={node.href}>{t('rag.openEntity')}</a>{/if}</p>
 {:else if mode === 'multihop'}
  <p class="note">{t('rag.multiIntro')}</p>
  <div class="net-controls">
   <label class="field"><span>{t('rag.usesBlock')}</span><select bind:value={mechA}>{#each mechIds as m}<option value={m}>{mechName(m)}</option>{/each}</select></label>
   <label class="field"><span>{t('rag.andBlock')}</span><select bind:value={mechB}><option value="">{t('rag.anyBlock')}</option>{#each mechIds.filter(m => m !== mechA) as m}<option value={m}>{mechName(m)}</option>{/each}</select></label>
   <label class="field"><span>{t('columns.commercial')}</span><select bind:value={commercial}><option value="">{t('rag.anyLicence')}</option>{#each statuses as c}<option value={c}>{commercialLabel(c)}</option>{/each}</select></label>
  </div>
  <p class="hop-path"><span class="tag" style="--tone:var(--s4)">{mechName(mechA)}</span>{#if mechB} ∩ <span class="tag" style="--tone:var(--s4)">{mechName(mechB)}</span>{/if} → <span class="tag" style="--tone:var(--s1)">{t('rag.kind_model')}</span> → <span class="tag" style="--tone:var(--s7)">{commercial ? commercialLabel(commercial as CommercialStatus) : t('rag.anyLicence')}</span> → <span class="tag" style="--tone:var(--s2)">{t('rag.kind_publisher')}</span></p>
  <div class="size-tiles three"><div><span>{t('rag.matchModels')}</span><strong>{hopModels.length}</strong></div><div><span>{t('rag.matchPublishers')}</span><strong>{hopPublishers.length}</strong></div><div><span>{t('rag.hops')}</span><strong>{mechB ? 4 : 3}</strong></div></div>
  {#if hopPublishers.length}<div class="table-wrap auto"><table><thead><tr><th>{t('rag.kind_publisher')}</th><th>{t('rag.kind_model')}</th></tr></thead><tbody>
   {#each hopPublishers as [p, list] (p)}<tr><td><b>{p}</b></td><td>{#each list as m, i}{i ? ', ' : ''}<a href={`#/model/${encodeURIComponent(m.id)}`}>{m.name}</a>{/each}</td></tr>{/each}
  </tbody></table></div>{:else}<p class="empty">{t('rag.noPath')}</p>{/if}
  <p class="callout">{t('rag.multiRead')}</p>
 {:else}
  <p class="note">{t('rag.globalIntro')}</p>
  <div class="net-controls"><label class="net-slider"><span>{t('rag.similarity')}<b>{threshold}%</b></span><input type="range" min="30" max="100" step="5" bind:value={threshold}/></label></div>
  <div class="size-tiles three"><div><span>{t('rag.communities')}</span><strong>{big.length}</strong></div><div><span>{t('rag.singletons')}</span><strong>{singles}</strong></div><div><span>{t('rag.largest')}</span><strong>{groups[0]?.ids.length ?? 0}</strong></div></div>
  <BarList rows={big.slice(0, 12).map((c, i) => ({label: t('rag.communityN', {n: i + 1, family: c.family[0]?.node.label ?? '—'}), value: c.ids.length}))}/>
  <div class="community-list">
   {#each big.slice(0, 12) as c, i}
    <details open={i === open}><summary on:click|preventDefault={() => open = open === i ? -1 : i}><b>{t('rag.communityN', {n: i + 1, family: c.family[0]?.node.label ?? '—'})}</b> · {c.ids.length}</summary>
     <p>{summary(c)}</p>
     <p class="note">{#each c.models.slice(0, 30) as m, j}{j ? ', ' : ''}<a href={m.href}>{m.label}</a>{/each}{#if c.models.length > 30} …{/if}</p>
    </details>
   {/each}
  </div>
  <p class="callout">{t('rag.globalRead')}</p>
 {/if}
 <p class="note">{rag.graphNote} {#each rag.graphSources as s, i}{i ? ' · ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{/each}</p>
</section>
