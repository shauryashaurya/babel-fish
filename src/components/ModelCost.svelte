<script lang="ts">
 /** Cost of one model under the cost planner's current workload: API list prices, or the cheapest self-hosted fit. */
 import {t} from '../lib/content';
 import {apiCost, apiModelOf, hostCost, planner, priceAt, providerOf, rateText, tokensText, upcomingChange, workloads} from '../lib/finops';
 import {infrastructure} from '../lib/infrastructure';
 import {safeUrl} from '../lib/selection';
 import type {Model} from '../lib/types';
 export let model: Model;
 const T = (k: string, v: Record<string, string | number> = {}) => t(`cost.${k}`, v);
 const today = new Date().toISOString().slice(0, 10);
 const usd = (v: number | null) => v === null ? '—' : v >= 1e6 ? `$${+(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `$${+(v / 1e3).toFixed(1)}K` : v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : v >= 1 ? `$${v.toFixed(2)}` : v > 0 ? `$${v.toPrecision(2)}` : '$0';
 const price = (v: number | undefined) => v === undefined ? '—' : `$${+v.toFixed(4)}`;
 $: s = $planner;
 $: api = model.access === 'api' ? apiModelOf(model.id) : null;
 $: prov = api ? providerOf(api.provider) : null;
 $: p = api ? priceAt(api, today) : null;
 $: next = api ? upcomingChange(api, today) : null;
 $: cost = api ? apiCost(api, s.workload, today) : null;
 $: host = api ? null : hostCost(model, s.workload, s.selfHost, s.instanceOverrides[model.id] ?? '');
 $: cloudName = infrastructure.clouds.find(c => c.id === s.selfHost.cloud)?.name ?? '';
 $: preset = workloads.presets.find(x => x.id === s.preset);
 $: planned = s.models.includes(model.id);
 function plan() { planner.update(x => x.models.includes(model.id) ? x : {...x, models: [...x.models, model.id].slice(-8)}); location.hash = '#/cost/plan'; }
</script>

<section class="card model-cost">
 <div class="card-title"><h2>{api ? T('cardApiTitle') : T('cardHostTitle')}</h2><button class="btn small primary" on:click={plan}>{planned ? T('openPlanner') : T('addToPlanner')}</button></div>
 <p class="note flush">{T('cardWorkload', {name: preset?.name ?? T('custom'), req: s.workload.requestsPerMonth.toLocaleString('en-US'), i: s.workload.inputTokens.toLocaleString('en-US'), o: s.workload.outputTokens.toLocaleString('en-US')})}</p>
 {#if api && p && cost}
  <div class="size-tiles three">
   <div><span>{T('monthly')}</span><strong>{usd(cost.monthly)}</strong><small>{T('perThousand', {v: usd(cost.perRequest * 1000)})}</small></div>
   <div><span>{T('colInput')} / {T('colOutput')}</span><strong>{price(p.input)} / {price(p.output)}</strong><small>{T('perMillionTokens')}</small></div>
   <div><span>{T('colCached')}</span><strong>{price(p.cachedInput)}</strong><small>{T('batchPair', {i: price(p.batchInput), o: price(p.batchOutput)})}</small></div>
  </div>
  {#if p.long}<p class="note">{T('longText', {above: tokensText(p.long.above), i: price(p.long.input), o: price(p.long.output)})}</p>{/if}
  {#if next}<p class="callout">{T('changeText', {date: next.from ?? '', i: price(next.input), o: price(next.output)})}</p>{/if}
  {#if prov}<p class="note">{prov.cacheNote} {prov.batchNote} <a href={safeUrl(prov.pricingUrl)} target="_blank" rel="noreferrer">{T('pricingPage')}</a></p>{/if}
 {:else if host}
  {#if host.option && host.monthly !== null}
   {@const o = host.option}
   <div class="size-tiles three">
    <div><span>{T('monthly')}</span><strong>{usd(host.monthly)}</strong><small>{T('perThousand', {v: usd((host.perRequest ?? 0) * 1000)})}</small></div>
    <div><span>{T('servedOn', {cloud: cloudName})}</span><strong>{o.replicas ?? '—'} × {o.nodes > 1 ? `${o.nodes} × ` : ''}{o.instance.name}</strong><small>{o.instance.gpus} × {o.instance.gpu} · {T('perHour', {v: usd(o.rate)})}</small></div>
    <div><span>{T('throughput')}</span><strong>{o.capacityRps === null ? '—' : T('rps', {v: rateText(o.capacityRps)})}</strong><small>{T('batchOf', {b: o.batch})}</small></div>
   </div>
   {#if o.flags.length}<p class="note">{o.flags.map(f => T(`flag_${f}`)).join(' · ')}</p>{/if}
  {:else}<p class="note">{host.flags.includes('noArch') ? T('flag_noArch') : T('noInstance')}</p>{/if}
  <p class="note">{T('cardHostNote')}</p>
 {/if}
</section>
