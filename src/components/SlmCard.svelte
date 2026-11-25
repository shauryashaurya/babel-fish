<script lang="ts">
 import ModelCost from './ModelCost.svelte';
 import ModelDiagram from './ModelDiagram.svelte';
 import {families, mechanisms} from '../lib/architecture';
 import {fromSlm} from '../lib/compare';
 import {exploreHref} from '../lib/explore';
 import {t} from '../lib/content';
 import {infrastructure, pickInstance} from '../lib/infrastructure';
 import {decodeBound, deviceGiB, devices, FAMILY_NAMES, PRECISIONS, slmAsModel, slmCacheGiB, slmMemory, slms, slmWeights, type Slm} from '../lib/learning';
 import {commercialLabel, commercialTone, formatGiB, formatParams, formatTokens, MAX_CANDIDATES, safeUrl} from '../lib/selection';
 import {compareList, MAX_COMPARE, toggleCompare} from '../lib/compareList';
 import {selection, toggleCandidate} from '../lib/state';
 export let slm: Slm;
 export let prevId: string | null = null;
 export let nextId: string | null = null;
 export let position = 0;
 export let total = 0;
 const na = () => t('model.notPublished');
 const count = (v: number | null | undefined) => v === null || v === undefined ? na() : v.toLocaleString('en-US');
 let precision = 'published', context = 8192, sessions = 1;
 $: a = slm.architecture;
 $: layout = a?.layout;
 $: family = slm.family ? families.find(f => f.id === slm.family) : null;
 $: blocks = slm.mechanisms.map(id => mechanisms.find(m => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
 $: maxContext = slm.context ?? 131072;
 $: contexts = [2048, 8192, 32768, 131072, 262144].filter(c => c <= maxContext).concat(maxContext < 2048 ? [maxContext] : []);
 $: if (context > maxContext) context = Math.max(...contexts);
 $: cache = slmCacheGiB(slm, context);
 $: need = slmMemory(slm, precision, context, sessions);
 $: deviceRows = devices.devices.map(d => ({d, fits: need <= deviceGiB(d), speed: decodeBound(slm, precision, context, d)}));
 $: sizing = infrastructure.clouds.map(cloud => {
  const m = {...slmAsModel(slm), weightGiB: slmWeights(slm, precision)}, full = Math.min(slm.context ?? 8192, 131072);
  return {cloud, min: pickInstance(m, cloud, {sessions: 1, contextTokens: Math.min(8192, full), headroomPct: 10}, false), rec: pickInstance(m, cloud, {sessions: 4, contextTokens: full, headroomPct: 25}, true)};
 });
 $: arch = fromSlm(slm);
 $: hasDiagram = arch.layers !== null || arch.hidden !== null;
 $: explainHref = exploreHref(slm.id);
 $: asModel = slmAsModel(slm);
 $: base = slm.baseModel ? slms.find(s => s.repo.toLowerCase() === slm.baseModel!.toLowerCase()) : null;
 $: derived = slms.filter(s => s.baseModel?.toLowerCase() === slm.repo.toLowerCase());
 $: siblings = slms.filter(s => s.id !== slm.id && s.publisher === slm.publisher).slice(0, 8);
 $: inGallery = !!slm.galleryModelId;
 $: candidateId = slm.galleryModelId ?? slm.id;
 $: isCandidate = $selection.candidates.includes(candidateId);
 $: compareId = slm.galleryModelId ?? slm.id;
 $: comparing = $compareList.includes(compareId);
 $: segments = layout ? [
  {n: layout.full, label: t('slm.layerFull'), tone: 1},
  {n: layout.window, label: t('slm.layerWindow', {window: layout.windowSize ?? '—'}), tone: 3},
  {n: layout.other, label: t('slm.layerOther', {kind: layout.otherKind ?? ''}), tone: 2},
 ].filter(s => s.n > 0) : [];
 const speed = (v: number) => v >= 100 ? v.toFixed(0) : v.toFixed(1);
 const link = (id: string) => `#/slm/${encodeURIComponent(id)}`;
</script>
<nav class="page-nav" aria-label={t('slm.title')}>
 <a class="back-link" href="#/slm"><span aria-hidden="true">←</span> {t('common.backTo', {target: t('slm.title')})}</a>
 {#if total > 1 && position > 0}<div class="pager">
  {#if prevId}<a class="btn small" href={link(prevId)}>{t('common.previous')}</a>{:else}<span class="btn small disabled">{t('common.previous')}</span>{/if}
  <span>{t('common.positionOf', {position, total})}</span>
  {#if nextId}<a class="btn small" href={link(nextId)}>{t('common.next')}</a>{:else}<span class="btn small disabled">{t('common.next')}</span>{/if}
 </div>{/if}
</nav>
<header class="page-head">
 <div><p class="overline">{t('slm.rankLabel', {rank: slm.rank})} · {t(`slm.purposes.${slm.purpose}`)}</p><h1>{slm.name}</h1>
  <p>{slm.publisher} · {formatParams(slm.params)}{#if family} · <a href={explainHref ?? `#/architecture/family/${family.id}`}>{family.name}</a>{/if}</p></div>
 <div class="arch-actions">
  {#if explainHref}<a class="btn" href={explainHref}>{t('model.exploreArchitecture')}</a>{/if}
  <button class="btn" disabled={!comparing && $compareList.length >= MAX_COMPARE} on:click={() => toggleCompare(compareId)}>{t(comparing ? 'slm.removeCompare' : 'slm.addCompare')}</button>
  {#if $compareList.length}<a class="btn" href="#/compare/diagram">{t('compare.openCompare', {n: $compareList.length})}</a>{/if}
  <button class="btn" disabled={!isCandidate && $selection.candidates.length >= MAX_CANDIDATES} on:click={() => toggleCandidate(candidateId)}>{t(isCandidate ? 'model.removeCandidate' : 'model.addCandidate')}</button>
  <a class="btn primary" href={`#/finetuning/plan/${encodeURIComponent(slm.id)}`}>{t('slm.planTuning')}</a>
 </div>
</header>
{#if inGallery}<p class="callout spaced">{t('slm.inGallery')} <a href={`#/model/${encodeURIComponent(slm.galleryModelId ?? '')}`}>{t('slm.openGallery')}</a></p>{/if}
<section class="card license-card">
 <h2>{t('model.licence')} <span class={`status ${commercialTone[slm.license.rule.commercial]}`}>{t('model.commercialUse', {status: commercialLabel(slm.license.rule.commercial)})}</span></h2>
 <p class="license-name"><a href={safeUrl(slm.license.url)} target="_blank" rel="noreferrer">{slm.license.rule.name}</a></p><p>{slm.license.rule.summary}</p>
 {#if slm.license.rule.obligations.length || slm.license.rule.restrictions?.length}<div class="two-lists">
  {#if slm.license.rule.obligations.length}<div><h3>{t('model.obligations')}</h3><ul class="plain">{#each slm.license.rule.obligations as x}<li>{x}</li>{/each}</ul></div>{/if}
  {#if slm.license.rule.restrictions?.length}<div><h3>{t('model.restrictions')}</h3><ul class="plain">{#each slm.license.rule.restrictions as x}<li>{x}</li>{/each}</ul></div>{/if}
 </div>{/if}
 {#if slm.gated}<p class="note">{t('model.gated')}</p>{/if}
</section>
{#if !inGallery}<ModelCost model={asModel}/>{/if}
{#if hasDiagram}<section class="card"><div class="card-title"><h2>{t('diagram.title', {name: slm.name})}</h2>{#if explainHref}<a class="btn small" href={explainHref}>{t('model.explain')}</a>{/if}</div><p class="note flush">{t('diagram.intro')}</p>{#key slm.id}<ModelDiagram {arch}/>{/key}</section>{/if}
<section class="card license-card">
 <h2>{t('model.blocks')}{#if explainHref}<a class="btn small" href={explainHref}>{t('model.explain')}</a>{/if}</h2>
 {#if blocks.length}<div class="chips flush">{#each blocks as b (b.id)}<a class="chip link" href={`#/architecture/mechanism/${b.id}`}>{b.name}</a>{/each}</div>
 {:else}<p class="missing">{t('slm.noConfig')}</p>{/if}
 {#if segments.length}
  <div class="layer-bar" role="img" aria-label={t('slm.layoutTitle')}>{#each segments as s}<i style={`flex:${s.n};background:var(--s${s.tone})`} title={`${s.n} ${s.label}`}></i>{/each}</div>
  <div class="chart-legend">{#each segments as s}<span><i class="dot" style={`--tone:var(--s${s.tone})`}></i>{s.n} {s.label}</span>{/each}</div>
  <p class="note">{t('slm.layoutNote')}</p>
 {/if}
</section>
<section class="card">
 <h2>{t('slm.sizeTitle')}</h2>
 <div class="net-controls">
  <label class="field"><span>{t('slm.precisionControl')}</span><select bind:value={precision}>{#each PRECISIONS as p}<option value={p.id}>{t(`slm.precision.${p.id}`)}</option>{/each}</select></label>
  <label class="field"><span>{t('slm.contextControl')}</span><select bind:value={context}>{#each contexts as c}<option value={c}>{formatTokens(c)}</option>{/each}</select></label>
  <label class="net-slider"><span>{t('slm.sessions')}<b>{sessions}</b></span><input type="range" min="1" max="32" bind:value={sessions}/></label>
 </div>
 <div class="size-tiles">
  <div><span>{t('model.weights')}</span><strong>{formatGiB(slmWeights(slm, precision))}</strong></div>
  <div><span>{t('slm.cachePerSession')}</span><strong>{cache === null ? na() : formatGiB(cache)}</strong></div>
  <div class="tile-selected"><span>{t('slm.memoryNeeded')}</span><strong>{formatGiB(need)}</strong></div>
  <div><span>{t('model.cache')}</span><strong>{slm.kvKiBPerToken === null ? na() : t('model.cacheValue', {value: slm.kvKiBPerToken})}</strong></div>
 </div>
 <p class="note">{t('slm.memoryFormula')}</p>
 <h3>{t('slm.devicesTitle')}</h3>
 <div class="table-wrap auto"><table><thead><tr><th>{t('slm.device')}</th><th class="num">{t('slm.deviceMemory')}</th><th class="num">{t('slm.bandwidth')}</th><th>{t('slm.colFits')}</th><th class="num">{t('slm.speedBound')}</th></tr></thead><tbody>
  {#each deviceRows as r (r.d.id)}<tr><td><a href={r.d.source} target="_blank" rel="noreferrer">{r.d.name}</a><small>{t(`slm.kind.${r.d.kind}`)}</small></td><td class="num">{t('slm.gbValue', {value: r.d.memoryGB})}</td><td class="num">{t('slm.gbsValue', {value: r.d.bandwidthGBs})}</td>
   <td><span class={`status ${r.fits ? 'pass' : 'fail'}`}>{t(r.fits ? 'slm.fits' : 'slm.tooLarge')}</span></td><td class="num">{r.fits ? t('slm.tokensPerSecond', {value: speed(r.speed)}) : '—'}</td></tr>{/each}
 </tbody></table></div>
 <p class="note">{t('slm.speedNote')}{#if a?.experts} {t('slm.speedMoe')}{/if} {t('slm.devicesSource', {date: devices.retrievedOn})}</p>
</section>
<div class="card-grid">
 <section class="card"><h2>{t('model.architecture')}</h2><dl>
  <div><dt>{t('slm.familyLabel')}</dt><dd>{slm.family ? FAMILY_NAMES[slm.family] : na()}</dd></div>
  <div><dt>{t('model.attention')}</dt><dd>{a?.attention ? t(`slm.attention.${a.attention}`) : na()}</dd></div>
  <div><dt>{t('model.layers')}</dt><dd>{count(slm.layers)}</dd></div>
  <div><dt>{t('model.hiddenSize')}</dt><dd>{count(slm.hiddenSize)}</dd></div>
  <div><dt>{t('model.heads')}</dt><dd>{count(slm.heads)}</dd></div>
  <div><dt>{t('model.kvHeads')}</dt><dd>{count(slm.kvHeads)}</dd></div>
  <div><dt>{t('slm.headDim')}</dt><dd>{count(a?.headDim)}</dd></div>
  <div><dt>{t('slm.ffn')}</dt><dd>{count(a?.intermediate)}</dd></div>
  {#if a?.experts}<div><dt>{t('slm.experts')}</dt><dd>{t('slm.expertsValue', {total: a.experts, active: a.expertsActive ?? '—'})}</dd></div>{/if}
  <div><dt>{t('model.vocab')}</dt><dd>{count(a?.vocab)}</dd></div>
  <div><dt>{t('slm.tied')}</dt><dd>{a?.tied === null || a?.tied === undefined ? na() : t(a.tied ? 'model.yes' : 'model.no')}</dd></div>
  <div><dt>{t('slm.activation')}</dt><dd>{a?.activation ?? na()}</dd></div>
  <div><dt>{t('slm.ropeTheta')}</dt><dd>{count(a?.ropeTheta)}</dd></div>
  <div><dt>{t('slm.modelType')}</dt><dd class="mono">{slm.modelType ?? na()}</dd></div>
 </dl></section>
 <section class="card"><h2>{t('model.overview')}</h2><dl>
  <div><dt>{t('model.totalParams')}</dt><dd>{formatParams(slm.params)}</dd></div>
  <div><dt>{t('model.weights')}</dt><dd>{slm.weightEstimated ? t('model.estimate', {value: formatGiB(slm.weightGiB)}) : formatGiB(slm.weightGiB)}</dd></div>
  <div><dt>{t('model.precision')}</dt><dd>{slm.precision ?? na()}</dd></div>
  <div><dt>{t('model.context')}</dt><dd>{slm.context === null ? na() : t('model.contextValue', {value: slm.context.toLocaleString('en-US')})}</dd></div>
  <div><dt>{t('slm.purposeLabel')}</dt><dd>{t(`slm.purposes.${slm.purpose}`)}</dd></div>
  <div><dt>{t('model.languages')}</dt><dd>{slm.languages.length ? (slm.languages.length > 8 ? t('model.languageCount', {count: slm.languages.length}) : slm.languages.join(', ')) : na()}</dd></div>
  <div><dt>{t('columns.released')}</dt><dd>{slm.released ?? na()}</dd></div>
  <div><dt>{t('slm.colDownloads')}</dt><dd>{slm.downloads30d.toLocaleString('en-US')}</dd></div>
  <div><dt>{t('slm.colLikes')}</dt><dd>{slm.likes.toLocaleString('en-US')}</dd></div>
  {#each PRECISIONS.slice(1) as p}<div><dt>{t('slm.weightsAt', {precision: t(`slm.precision.${p.id}`)})}</dt><dd>{formatGiB(slmWeights(slm, p.id))}</dd></div>{/each}
 </dl></section>
 <section class="card wide"><h2>{t('slm.cloudTitle')}</h2>
  <p class="note flush">{t('slm.cloudNote')}</p>
  <div class="table-wrap auto infra-table"><table><thead><tr><th>{t('infra.cloud')}</th><th>{t('infra.minimum')}</th><th>{t('infra.recommended')}</th></tr></thead><tbody>
   {#each sizing as r (r.cloud.id)}<tr><td><strong>{r.cloud.name}</strong></td>{#each [r.min, r.rec] as pick}<td>{#if pick}<div class="inst-name">{pick.instance.name}</div><small>{t('infra.instanceSpec', {gpus: `${pick.instance.gpus} ×`, gpu: pick.instance.gpu, memory: formatGiB(pick.instance.gpuMemoryGiB), vcpus: pick.instance.vcpus, ram: formatGiB(pick.instance.ramGiB)})}</small><small>{t('infra.needs', {memory: formatGiB(pick.memoryGiB)})}</small>{:else}—{/if}</td>{/each}</tr>{/each}
  </tbody></table></div>
 </section>
 <section class="card"><h2>{t('slm.lineage')}</h2><dl>
  <div><dt>{t('slm.baseModel')}</dt><dd>{#if base}<a href={link(base.id)}>{base.name}</a>{:else if slm.baseModel}<a href={`https://huggingface.co/${slm.baseModel}`} target="_blank" rel="noreferrer">{slm.baseModel}</a>{:else}{na()}{/if}</dd></div>
  <div><dt>{t('slm.derived')}</dt><dd>{#if derived.length}{#each derived as d, i}{i ? ', ' : ''}<a href={link(d.id)}>{d.name}</a>{/each}{:else}—{/if}</dd></div>
  <div><dt>{t('slm.samePublisher')}</dt><dd>{#if siblings.length}{#each siblings as d, i}{i ? ', ' : ''}<a href={link(d.id)}>{d.name}</a>{/each}{:else}—{/if}</dd></div>
  <div><dt>{t('slm.datasets')}</dt><dd>{#if slm.datasets.length}{#each slm.datasets as d, i}{i ? ', ' : ''}<a href={`https://huggingface.co/datasets/${d}`} target="_blank" rel="noreferrer">{d}</a>{/each}{:else}{t('slm.notTagged')}{/if}</dd></div>
 </dl></section>
 <section class="card"><h2>{t('model.sources')}</h2><dl>
  <div><dt>{t('model.officialCard')}</dt><dd><a href={slm.url} target="_blank" rel="noreferrer">{slm.repo}</a></dd></div>
  <div><dt>{t('model.revision')}</dt><dd class="mono">{slm.revision}</dd></div>
  <div><dt>{t('model.configuration')}</dt><dd>{#if slm.configUrl}<a href={slm.configUrl} target="_blank" rel="noreferrer">{t('model.configFile')}</a>{:else}<span class="missing">{t('model.notAccessible')}</span>{/if}</dd></div>
  {#if slm.configSource}<div><dt>{t('model.publishedFigures')}</dt><dd>{#each slm.configSource.sources as s, i}{i ? ' · ' : ''}<a href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}</a>{/each}<small class="note">{t('model.publishedFiguresNote')} {slm.configSource.note}</small></dd></div>{/if}
  <div><dt>{t('slm.papers')}</dt><dd>{#if slm.papers.length}{#each slm.papers as p, i}{i ? ', ' : ''}<a href={`https://arxiv.org/abs/${p}`} target="_blank" rel="noreferrer">{p}</a>{/each}{:else}{t('slm.notTagged')}{/if}</dd></div>
  <div><dt>{t('slm.library')}</dt><dd>{slm.library ?? na()}</dd></div>
 </dl></section>
 {#if slm.flags.length}<section class="card wide"><h2>{t('model.dataNotes')}</h2><ul class="plain">{#each slm.flags as f}<li>{f}</li>{/each}</ul></section>{/if}
</div>
