<script lang="ts">
 import BarChart, {type BarRow} from './BarChart.svelte';
 import MiniChart, {type ChartSeries} from './MiniChart.svelte';
 import NumberField from './NumberField.svelte';
 import {apiModels} from '../lib/catalog';
 import {slmAsModel, slms} from '../lib/learning';
 import {t} from '../lib/content';
 import {exploreHref} from '../lib/explore';
 import {apiContent, apiCost, apiModelOf, defaultState, hostCost, MAX_PLANNED, months, planner, priceAt, priceContent, providerOf, upcomingChange, volumes, workloads, tokensText, rateText, type ApiCost, type HostCost, type HostFlag, type SelfHost, type Workload} from '../lib/finops';
 import {infrastructure} from '../lib/infrastructure';
 import {safeUrl} from '../lib/selection';
 import type {Model} from '../lib/types';
 export let models: Model[];
 export let route = '';
 const T = (k: string, v: Record<string, string | number> = {}) => t(`cost.${k}`, v);
 const sections = ['plan', 'forecast', 'breakeven', 'prices'];
 let section = sections.includes(route) ? route : 'plan';
 $: if (route && sections.includes(route)) section = route;
 function go(s: string) { section = s; history.replaceState(null, '', `#/cost/${s}`); }

 const today = new Date().toISOString().slice(0, 10);
 const TONES = [1, 2, 3, 7, 5, 4, 6, 8];
 const smallModels = slms.filter(x => !x.galleryModelId && x.kvKiBPerToken !== null).map(slmAsModel);
 const all = [...models, ...apiModels, ...smallModels];
 const byId = (id: string) => all.find(m => m.id === id);
 const usd = (v: number | null) => v === null ? '—' : v >= 1e9 ? `$${+(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${+(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `$${+(v / 1e3).toFixed(1)}K` : v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : v >= 1 ? `$${v.toFixed(2)}` : v > 0 ? `$${v.toPrecision(2)}` : '$0';
 const price = (v: number | undefined) => v === undefined ? '—' : `$${+v.toFixed(4)}`;
 const num = (v: number) => v >= 1e9 ? `${+(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : String(Math.round(v));

 $: s = $planner;
 $: w = s.workload;
 $: h = s.selfHost;
 $: chosen = s.models.map(byId).filter((m): m is Model => !!m);
 $: anyOpen = chosen.some(m => m.access !== 'api');
 const setW = (patch: Partial<Workload>) => planner.update(x => ({...x, workload: {...x.workload, ...patch}, preset: patch.requestsPerMonth !== undefined || patch.inputTokens !== undefined || patch.outputTokens !== undefined ? '' : x.preset}));
 const setH = (patch: Partial<SelfHost>) => planner.update(x => ({...x, selfHost: {...x.selfHost, ...patch}}));
 function usePreset(id: string) { const p = workloads.presets.find(x => x.id === id); if (p) planner.update(x => ({...x, preset: id, workload: {...x.workload, ...p.workload}})); }
 function add(id: string) { if (id) planner.update(x => x.models.includes(id) || x.models.length >= MAX_PLANNED ? x : {...x, models: [...x.models, id]}); }
 const remove = (id: string) => planner.update(x => ({...x, models: x.models.filter(m => m !== id)}));
 const setOverride = (id: string, name: string) => planner.update(x => ({...x, instanceOverrides: {...x.instanceOverrides, [id]: name}}));
 const setRate = (key: string, v: number | null) => planner.update(x => { const r = {...x.selfHost.customRates}; if (v && v > 0) r[key] = v; else delete r[key]; return {...x, selfHost: {...x.selfHost, customRates: r}}; });
 const reset = () => planner.set(defaultState());

 type Row = {m: Model; tone: number; cost: ApiCost | HostCost};
 const costOf = (m: Model, req: number, date: string): ApiCost | HostCost => m.access === 'api' ? apiCost(apiModelOf(m.id)!, w, date, req) : hostCost(m, w, h, s.instanceOverrides[m.id] ?? '', req);
 $: rows = chosen.map((m, i): Row => ({m, tone: TONES[i % TONES.length], cost: costOf(m, w.requestsPerMonth, today)})) as Row[];
 $: priced = rows.filter(r => r.cost.monthly !== null).sort((a, b) => a.cost.monthly! - b.cost.monthly!);
 $: low = priced[0];
 $: high = priced.at(-1);
 $: tokensMonth = w.requestsPerMonth * (w.inputTokens + w.outputTokens);
 $: bars = priced.map((r): BarRow => r.cost.kind === 'api'
  ? {id: r.m.id, label: r.m.name, href: `#/model/${encodeURIComponent(r.m.id)}`, tone: r.tone, value: usd(r.cost.monthly), segments: [
     {value: r.cost.parts.input + r.cost.parts.cached, style: 'solid', label: T('partInput'), text: usd(r.cost.parts.input + r.cost.parts.cached)},
     {value: r.cost.parts.output, style: 'light', label: T('partOutput'), text: usd(r.cost.parts.output)}]}
  : {id: r.m.id, label: r.m.name, href: `#/model/${encodeURIComponent(r.m.id)}`, tone: r.tone, value: usd(r.cost.monthly), segments: [{value: r.cost.monthly ?? 0, style: 'solid', label: T('partGpu'), text: usd(r.cost.monthly)}]});
 const flagText = (f: HostFlag) => T(`flag_${f}`);
 $: cloud = infrastructure.clouds.find(c => c.id === h.cloud);
 $: cloudPrices = priceContent.clouds[h.cloud];
 $: unpriced = cloud ? cloud.instances.filter(i => !i.fractional && cloudPrices?.prices[i.name] === undefined) : [];

 // Forecast
 $: monthList = months(today, 12);
 $: forecast = rows.map(r => ({r, points: monthList.map((d, i) => { const req = w.requestsPerMonth * (1 + w.growthPct / 100) ** i; return [i, costOf(r.m, req, d).monthly] as [number, number | null]; })}));
 $: fSeries = forecast.filter(f => f.points.every(p => p[1] !== null)).map(f => ({id: f.r.m.id, label: f.r.m.name, tone: f.r.tone, points: f.points as [number, number][], endLabel: f.r.m.name})) as ChartSeries[];
 $: fMax = Math.max(1, ...fSeries.flatMap(x => x.points.map(p => p[1])));
 $: changes = chosen.filter(m => m.access === 'api').map(m => ({m, next: upcomingChange(apiModelOf(m.id)!, today)})).filter(x => x.next && monthList.some(d => d >= x.next!.from!));
 $: changeMarkers = [...new Set(changes.map(c => c.next!.from!))].map(d => ({x: monthList.findIndex(m => m >= d), label: T('priceChange', {date: d})})).filter(x => x.x >= 0);
 const monthLabel = (i: number) => { const d = new Date(`${monthList[Math.round(i)] ?? today}T00:00:00Z`); return d.toLocaleString('en-GB', {month: 'short', year: '2-digit', timeZone: 'UTC'}); };

 // Break-even
 const vols = volumes(1e3, 1e9, 49);
 $: bSeries = rows.map(r => ({id: r.m.id, label: r.m.name, tone: r.tone, dashed: r.m.access !== 'api', points: vols.map(v => [Math.log10(v), costOf(r.m, v, today).monthly] as [number, number | null]).filter(p => p[1] !== null && p[1]! > 0) as [number, number][], endLabel: r.m.name})).filter(x => x.points.length > 1) as ChartSeries[];
 $: bMin = Math.max(1, Math.min(...bSeries.flatMap(x => x.points.map(p => p[1]))));
 $: bMax = Math.max(10, ...bSeries.flatMap(x => x.points.map(p => p[1])));
 $: crossings = (() => {
  const apis = rows.filter(r => r.m.access === 'api'), hosts = rows.filter(r => r.m.access !== 'api');
  return hosts.flatMap(hr => apis.map(ar => {
   const v = vols.find(x => { const a = costOf(ar.m, x, today).monthly, b = costOf(hr.m, x, today).monthly; return a !== null && b !== null && b <= a; });
   return {host: hr.m, api: ar.m, volume: v ?? null};
  }));
 })();
</script>

<header class="page-head"><div><h1>{T('title')}</h1><p>{T('intro')}</p></div><div class="arch-actions"><button class="btn small" on:click={reset}>{T('reset')}</button></div></header>
<div class="section-tabs page-tabs" role="tablist" aria-label={T('title')}>
 {#each sections as x}<button role="tab" aria-selected={section === x} class:on={section === x} on:click={() => go(x)}>{T(`tab_${x}`)}</button>{/each}
</div>

{#if section !== 'prices'}
 <div class="kpi-strip cost-kpis">
  <div><span>{T('kpiLowest')}</span><strong>{usd(low?.cost.monthly ?? null)}</strong><small style={low ? `--tone: var(--s${low.tone})` : ''}>{#if low}<i class="dot"></i>{low.m.name}{:else}{T('kpiNone')}{/if}</small></div>
  <div><span>{T('kpiHighest')}</span><strong>{usd(high?.cost.monthly ?? null)}</strong><small style={high ? `--tone: var(--s${high.tone})` : ''}>{#if high}<i class="dot"></i>{high.m.name}{:else}{T('kpiNone')}{/if}</small></div>
  <div><span>{T('kpiSpread')}</span><strong>{low && high && low.cost.monthly ? `${(high.cost.monthly! / low.cost.monthly).toFixed(1)}×` : '—'}</strong><small>{T('kpiSpreadNote')}</small></div>
  <div><span>{T('kpiVolume')}</span><strong>{num(tokensMonth)}</strong><small>{T('kpiVolumeNote', {req: num(w.requestsPerMonth)})}</small></div>
 </div>
{/if}

{#if section === 'plan'}
 <div class="card-grid cost-setup">
  <section class="card">
   <h2>{T('workloadTitle')}</h2>
   <label class="field"><span>{T('preset')}</span><select value={s.preset} on:change={e => usePreset(e.currentTarget.value)}><option value="">{T('custom')}</option>{#each workloads.presets as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
    {#if workloads.presets.find(p => p.id === s.preset)}<small>{workloads.presets.find(p => p.id === s.preset)?.text}</small>{/if}</label>
   <div class="form-grid">
    <NumberField label={T('requests')} value={w.requestsPerMonth} min={1} onChange={v => setW({requestsPerMonth: v ?? 1})}/>
    <NumberField label={T('inputTokens')} value={w.inputTokens} min={1} onChange={v => setW({inputTokens: v ?? 1})}/>
    <NumberField label={T('outputTokens')} value={w.outputTokens} min={1} onChange={v => setW({outputTokens: v ?? 1})}/>
    <NumberField label={T('peakFactor')} hint={T('peakHint')} value={w.peakFactor} min={1} onChange={v => setW({peakFactor: v ?? 1})}/>
   </div>
   <div class="net-controls cost-sliders">
    <label class="net-slider"><span>{T('cacheable')}<b>{w.cacheablePct}%</b></span><input type="range" min="0" max="100" bind:value={$planner.workload.cacheablePct}/></label>
    <label class="net-slider"><span>{T('cacheHit')}<b>{w.cacheHitPct}%</b></span><input type="range" min="0" max="100" bind:value={$planner.workload.cacheHitPct}/></label>
    <label class="net-slider"><span>{T('batch')}<b>{w.batchPct}%</b></span><input type="range" min="0" max="100" bind:value={$planner.workload.batchPct}/></label>
    <label class="net-slider"><span>{T('growth')}<b>{w.growthPct}%</b></span><input type="range" min="0" max="30" bind:value={$planner.workload.growthPct}/></label>
   </div>
   <label class="check"><input type="checkbox" bind:checked={$planner.workload.residency}/> {T('residency')}</label>
   <p class="note">{workloads.note}</p>
  </section>
  <section class="card">
   <h2>{T('modelsTitle')} <span class="status confirm">{T('modelCount', {n: chosen.length, max: MAX_PLANNED})}</span></h2>
   <div class="planned">{#each rows as r (r.m.id)}<span class="planned-chip" style={`--tone: var(--s${r.tone})`}><i class="dot"></i><a href={`#/model/${encodeURIComponent(r.m.id)}`}>{r.m.name}</a><small>{r.m.access === 'api' ? r.m.publisher : T('selfHosted')}</small><button aria-label={T('removeModel', {name: r.m.name})} on:click={() => remove(r.m.id)}>×</button></span>{/each}</div>
   <label class="field"><span>{T('addModel')}</span><select value="" disabled={chosen.length >= MAX_PLANNED} on:change={e => { add(e.currentTarget.value); e.currentTarget.value = ''; }}>
    <option value="">{T('choose')}</option>
    {#each apiContent.providers as p (p.id)}<optgroup label={T('groupApi', {provider: p.name})}>{#each apiModels.filter(m => m.api?.provider === p.id && !s.models.includes(m.id)) as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</optgroup>{/each}
    <optgroup label={T('groupSmall')}>{#each smallModels.filter(m => !s.models.includes(m.id)).sort((a, b) => a.name.localeCompare(b.name)) as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</optgroup>
    <optgroup label={T('groupOpen')}>{#each models.filter(m => !s.models.includes(m.id) && m.kvKiBPerToken !== null).sort((a, b) => a.name.localeCompare(b.name)) as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</optgroup>
   </select></label>
   <p class="note">{T('modelsNote')}</p>
  </section>
 </div>

 {#if anyOpen}
  <section class="card">
   <h2>{T('hostTitle')}</h2><p class="note flush">{T('hostIntro')}</p>
   <div class="net-controls">
    <label class="field"><span>{T('cloud')}</span><select value={h.cloud} on:change={e => setH({cloud: e.currentTarget.value})}>{#each infrastructure.clouds as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
    <label class="field"><span>{T('precision')}</span><select value={h.precision} on:change={e => setH({precision: e.currentTarget.value as SelfHost['precision']})}>{#each ['published', 'bit16', 'bit8', 'bit4'] as p}<option value={p}>{T(`prec_${p}`)}</option>{/each}</select></label>
    <label class="field"><span>{T('cacheBits')}</span><select value={h.cacheBits} on:change={e => setH({cacheBits: Number(e.currentTarget.value) as 16 | 8})}><option value={16}>{T('bits16')}</option><option value={8}>{T('bits8')}</option></select></label>
    <label class="net-slider"><span>{T('hours')}<b>{h.hoursPerMonth}</b></span><input type="range" min="40" max="730" step="10" bind:value={$planner.selfHost.hoursPerMonth}/></label>
    <label class="net-slider"><span>{T('utilisation')}<b>{h.utilisationPct}%</b></span><input type="range" min="20" max="95" step="5" bind:value={$planner.selfHost.utilisationPct}/></label>
    <label class="net-slider"><span>{T('commitment')}<b>{h.commitmentPct}%</b></span><input type="range" min="0" max="70" step="5" bind:value={$planner.selfHost.commitmentPct}/></label>
    <label class="net-slider"><span>{T('headroom')}<b>{h.headroomPct}%</b></span><input type="range" min="0" max="40" step="5" bind:value={$planner.selfHost.headroomPct}/></label>
    <label class="net-slider"><span>{T('bwEff')}<b>{h.bandwidthEffPct}%</b></span><input type="range" min="20" max="90" step="5" bind:value={$planner.selfHost.bandwidthEffPct}/></label>
    <label class="net-slider"><span>{T('mfu')}<b>{h.mfuPct}%</b></span><input type="range" min="10" max="70" step="5" bind:value={$planner.selfHost.mfuPct}/></label>
    <label class="net-slider"><span>{T('maxBatch')}<b>{h.maxBatch}</b></span><input type="range" min="1" max="256" bind:value={$planner.selfHost.maxBatch}/></label>
   </div>
   <p class="note">{T('hostNote')} {cloudPrices?.note ?? (cloudPrices ? T('pricesFrom', {region: cloudPrices.region ?? '', date: priceContent.retrievedOn}) : '')}</p>
   {#if unpriced.length}
    <details class="rate-box"><summary>{T('customRates', {n: unpriced.length})}</summary>
     <div class="form-grid">{#each unpriced as i (i.name)}<NumberField label={`${i.name} · ${i.gpus} × ${i.gpu}`} hint={cloudPrices?.missing[i.name] ?? ''} value={h.customRates[`${h.cloud}:${i.name}`] ?? null} onChange={v => setRate(`${h.cloud}:${i.name}`, v)}/>{/each}</div>
    </details>
   {/if}
  </section>
 {/if}

 {#if rows.length}
  <section class="card">
   <div class="chart-card-head"><div><h2>{T('monthlyTitle')}</h2><p>{T('monthlySub', {req: num(w.requestsPerMonth), i: num(w.inputTokens), o: num(w.outputTokens)})}</p></div></div>
   {#if bars.length}<BarChart rows={bars} format={v => usd(v)} legend={[{style: 'solid', label: T('legendInput')}, {style: 'light', label: T('partOutput')}]} aria={T('monthlyTitle')}/>{/if}
   <div class="table-wrap auto"><table class="trace-table cost-table stack-table"><thead><tr><th>{T('colModel')}</th><th>{T('colMonthly')}</th><th>{T('colPer1k')}</th><th>{T('colPer1m')}</th><th>{T('colHow')}</th><th>{T('colNotes')}</th></tr></thead>
    <tbody>{#each rows as r (r.m.id)}<tr>
     <th scope="row"><span class="tone-name" style={`--tone: var(--s${r.tone})`}><i class="dot"></i><a href={`#/model/${encodeURIComponent(r.m.id)}`}>{r.m.name}</a></span><small>{r.m.access === 'api' ? T('viaApi', {provider: r.m.publisher}) : T('selfHosted')}{#if r.m.access !== 'api' && exploreHref(r.m.id)} · <a href={exploreHref(r.m.id)}>{t('model.architectureLink')}</a>{/if}</small></th>
     <td class="num" data-label={T('colMonthly')}>{usd(r.cost.monthly)}</td><td class="num" data-label={T('colPer1k')}>{r.cost.perRequest === null ? '—' : usd(r.cost.perRequest * 1000)}</td><td class="num" data-label={T('colPer1m')}>{r.cost.perMillion === null ? '—' : usd(r.cost.perMillion)}</td>
     {#if r.cost.kind === 'api'}
      {@const p = r.cost.prices}
      <td data-label={T('colHow')}>{T('apiHow', {i: price(p.input), o: price(p.output), c: price(p.cachedInput)})}{#if r.cost.long}<span class="status confirm">{T('longTier')}</span>{/if}</td>
      <td data-label={T('colNotes')}>{#if r.cost.residencyApplied}{T('residencyOn')} {/if}{#if w.inputTokens > (r.m.context ?? Infinity)}<span class="status fail">{T('overContext')}</span>{/if}{#if r.m.api?.status === 'preview'}<span class="status confirm">{T('preview')}</span>{/if}</td>
     {:else}
      {@const o = r.cost.option}
      <td data-label={T('colHow')}>{#if o}
        <select class="inline" aria-label={T('instanceFor', {name: r.m.name})} value={s.instanceOverrides[r.m.id] ?? ''} on:change={e => setOverride(r.m.id, e.currentTarget.value)}><option value="">{T('cheapest')}</option>{#each r.cost.options as x (x.instance.name)}<option value={x.instance.name}>{x.instance.name} · {x.instance.gpus} × {x.instance.gpu}</option>{/each}</select>
        <small>{T('hostHow', {replicas: o.replicas ?? '—', nodes: o.nodes, inst: o.instance.name, rate: o.rate === null ? '—' : usd(o.rate), batch: o.batch, tps: o.decodeTokS === null ? '—' : num(o.decodeTokS), rps: o.capacityRps === null ? '—' : rateText(o.capacityRps)})}</small>
       {:else}<span class="missing">{T('noInstance')}</span>{/if}</td>
      <td data-label={T('colNotes')}>{#each r.cost.flags as f}<span class="status confirm" title={flagText(f)}>{flagText(f)}</span> {/each}{#if !r.cost.flags.length}{T('peakRps', {rps: r.cost.peakRps.toFixed(2)})}{/if}</td>
     {/if}
    </tr>{/each}</tbody></table></div>
   <p class="note">{T('tableNote')}</p>
  </section>
  <section class="card"><h2>{T('methodTitle')}</h2>
   <div class="card-grid flush-grid">
    <div><h3>{T('methodApi')}</h3><p class="formula">{T('formulaApi')}</p><p class="note">{T('methodApiNote')}</p></div>
    <div><h3>{T('methodHost')}</h3><p class="formula">{T('formulaHost')}</p><p class="note">{T('methodHostNote')}</p></div>
   </div>
  </section>
 {:else}<p class="empty">{T('noModels')}</p>{/if}

{:else if section === 'forecast'}
 <section class="card">
  <div class="chart-card-head"><div><h2>{T('forecastTitle')}</h2><p>{T('forecastSub', {g: w.growthPct})}</p></div></div>
  {#if fSeries.length}<MiniChart series={fSeries} xMin={0} xMax={11} yMin={0} yMax={fMax * 1.08} markers={changeMarkers} format={v => usd(v)} xFormat={monthLabel} xTicks={[0, 2, 4, 6, 8, 10]} xLabel={T('monthAxis')} yLabel={T('monthlyAxis')} aria={T('forecastTitle')} height={340}/>{:else}<p class="empty">{T('noModels')}</p>{/if}
  {#if changes.length}<p class="callout">{#each changes as c}<b>{c.m.name}</b>: {T('changeText', {date: c.next?.from ?? '', i: price(c.next?.input), o: price(c.next?.output)})} {/each}</p>{/if}
  <div class="table-wrap auto"><table class="trace-table cost-table"><thead><tr><th>{T('colModel')}</th>{#each monthList as d, i}<th class="num">{monthLabel(i)}</th>{/each}<th class="num">{T('colYear')}</th></tr></thead>
   <tbody>{#each forecast as f (f.r.m.id)}<tr><th scope="row"><span class="tone-name" style={`--tone: var(--s${f.r.tone})`}><i class="dot"></i>{f.r.m.name}</span></th>{#each f.points as p}<td class="num">{usd(p[1])}</td>{/each}<td class="num"><b>{f.points.every(p => p[1] !== null) ? usd(f.points.reduce((a, p) => a + (p[1] ?? 0), 0)) : '—'}</b></td></tr>{/each}</tbody></table></div>
  <p class="note">{T('forecastNote')}</p>
 </section>

{:else if section === 'breakeven'}
 <section class="card">
  <div class="chart-card-head"><div><h2>{T('beTitle')}</h2><p>{T('beSub')}</p></div></div>
  {#if bSeries.length}<MiniChart series={bSeries} xMin={3} xMax={9} yMin={bMin / 1.5} yMax={bMax * 1.5} log markers={[{x: Math.log10(w.requestsPerMonth), label: T('youAreHere')}]} format={v => usd(v)} xFormat={v => num(10 ** v)} xTicks={[3, 4, 5, 6, 7, 8, 9]} xLabel={T('volumeAxis')} yLabel={T('monthlyAxis')} aria={T('beTitle')} height={360}/>{/if}
  {#if crossings.length}
   <h3>{T('beTable')}</h3>
   <ul class="plain">{#each crossings as c}<li>{#if c.volume}{T('beAt', {host: c.host.name, api: c.api.name, v: num(c.volume)})}{:else}{T('beNever', {host: c.host.name, api: c.api.name})}{/if}</li>{/each}</ul>
  {:else}<p class="note">{T('beNeedBoth')}</p>{/if}
  <p class="note">{T('beNote')}</p>
 </section>

{:else}
 <section class="card">
  <h2>{T('apiPrices')}</h2><p class="note flush">{apiContent.basis} {T('retrieved', {date: apiContent.retrievedOn})}</p>
  <div class="table-wrap auto"><table class="trace-table cost-table"><thead><tr><th>{T('colModel')}</th><th>{T('colContext')}</th><th class="num">{T('colInput')}</th><th class="num">{T('colCached')}</th><th class="num">{T('colWrite')}</th><th class="num">{T('colOutput')}</th><th class="num">{T('colBatch')}</th><th>{T('colLong')}</th><th>{T('colChange')}</th></tr></thead>
   <tbody>{#each apiContent.models as m (m.id)}{@const p = priceAt(m, today)}{@const nx = upcomingChange(m, today)}<tr>
    <th scope="row"><a href={`#/model/${encodeURIComponent(m.id)}`}>{m.name}</a><small>{providerOf(m.provider)?.name} · <code>{m.apiId}</code>{#if m.status === 'preview'} · {T('preview')}{/if}</small></th>
    <td>{tokensText(m.context)}</td><td class="num">{price(p.input)}</td><td class="num">{price(p.cachedInput)}</td><td class="num">{price(p.cacheWrite ?? p.input)}</td><td class="num">{price(p.output)}</td><td class="num">{price(p.batchInput)} / {price(p.batchOutput)}</td>
    <td>{#if p.long}{T('longText', {above: tokensText(p.long.above), i: price(p.long.input), o: price(p.long.output)})}{:else}—{/if}</td>
    <td>{#if nx}{T('changeText', {date: nx.from ?? '', i: price(nx.input), o: price(nx.output)})}{:else}—{/if} <a href={safeUrl(m.source)} target="_blank" rel="noreferrer">{T('source')}</a></td>
   </tr>{/each}</tbody></table></div>
  <div class="concept-grid">{#each apiContent.providers as p (p.id)}<div class="concept"><h3>{p.name}</h3><p>{p.cacheNote} {p.batchNote} {p.residency?.text ?? ''}</p><p class="note"><a href={safeUrl(p.pricingUrl)} target="_blank" rel="noreferrer">{T('pricingPage')}</a> · <a href={safeUrl(p.terms.url)} target="_blank" rel="noreferrer">{p.terms.title}</a></p></div>{/each}</div>
 </section>
 <section class="card">
  <h2>{T('gpuPrices')}</h2><p class="note flush">{priceContent.basis} {T('retrieved', {date: priceContent.retrievedOn})}</p>
  {#each infrastructure.clouds as c (c.id)}{@const cp = priceContent.clouds[c.id]}
   <h3>{c.name}{#if cp?.region} · {cp.region}{/if}</h3>
   {#if cp?.note}<p class="note">{cp.note}</p>{/if}
   <div class="table-wrap auto"><table class="trace-table cost-table"><thead><tr><th>{T('colInstance')}</th><th>{T('colGpus')}</th><th class="num">{T('colGpuMem')}</th><th class="num">{T('colHour')}</th><th class="num">{T('colMonth')}</th><th>{T('colSpec')}</th></tr></thead>
    <tbody>{#each c.instances as i (i.name)}{@const rate = cp?.prices[i.name]}<tr><th scope="row"><code>{i.name}</code></th><td>{i.gpus} × {i.gpu}</td><td class="num">{T('gib', {v: i.gpuMemoryGiB})}</td><td class="num">{rate === undefined ? '—' : price(rate)}</td><td class="num">{rate === undefined ? '—' : usd(rate * 730)}</td><td><small>{rate === undefined ? cp?.missing[i.name] ?? '' : cp?.otherRegion?.[i.name] ?? ''}</small></td></tr>{/each}</tbody></table></div>
   {#if cp}<p class="note"><a href={safeUrl(cp.source.url)} target="_blank" rel="noreferrer">{cp.source.title}</a></p>{/if}
  {/each}
  <h3>{T('gpuSpecs')}</h3><p class="note flush">{priceContent.gpus.basis}</p>
  <div class="table-wrap auto"><table class="trace-table cost-table"><thead><tr><th>{T('colGpu')}</th><th class="num">{T('colBandwidth')}</th><th class="num">{T('colTflops')}</th><th>{T('colNotes')}</th></tr></thead>
   <tbody>{#each priceContent.gpus.specs as g (g.id)}<tr><th scope="row">{g.id}</th><td class="num">{g.bandwidthGBs === null ? '—' : T('gbs', {v: g.bandwidthGBs.toLocaleString('en-US')})}</td><td class="num">{g.bf16Tflops === null ? '—' : g.bf16Tflops.toLocaleString('en-US')}</td><td><small>{g.note} <a href={safeUrl(g.source)} target="_blank" rel="noreferrer">{T('source')}</a></small></td></tr>{/each}</tbody></table></div>
 </section>
{/if}
