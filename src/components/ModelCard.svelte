<script lang="ts">
 import ModelCost from './ModelCost.svelte';
 import ModelDiagram from './ModelDiagram.svelte';
 import {familyOf, mechanismsOf} from '../lib/architecture';
 import {fromModel} from '../lib/compare';
 import {apiModelOf, providerOf} from '../lib/finops';
 import {compareList, MAX_COMPARE, toggleCompare} from '../lib/compareList';
 import {t} from '../lib/content';
 import {assessModel, commercialLabel, commercialTone, formatGiB, formatParams, formatTokens, hasRequirements, MAX_CANDIDATES, safeUrl, statusLabel} from '../lib/selection';
 import {toggleCandidate} from '../lib/state';
 import type {Model, Selection} from '../lib/types';
 export let model: Model;
 export let selection: Selection;
 export let backHref: string;
 export let backLabel: string;
 export let prevId: string | null = null;
 export let nextId: string | null = null;
 export let position = 0;
 export let total = 0;
 $: na = t('model.notPublished');
 const show = (v: unknown) => v === null || v === undefined || v === '' ? t('model.notPublished') : String(v);
 const count = (v: number | null | undefined) => v === null || v === undefined ? t('model.notPublished') : v.toLocaleString('en-US');
 const cardLink = (id: string) => `#/model/${encodeURIComponent(id)}`;
 $: a = assessModel(model, selection);
 $: o = model.official;
 $: r = model.license.rule;
 $: family = familyOf(model);
 $: exploreLink = family ? `#/architecture/family/${family.id}/${encodeURIComponent(model.id)}` : null;
 $: isApi = model.access === 'api';
 $: apiInfo = isApi ? apiModelOf(model.id) : null;
 $: provider = apiInfo ? providerOf(apiInfo.provider) : null;
 $: arch = isApi ? null : fromModel(model);
 $: hasDiagram = !!arch && (arch.layers !== null || arch.hidden !== null || arch.segments.length > 0);
 $: apiRows = [
  [t('api.provider'), model.publisher], [t('api.apiId'), model.api?.apiId ?? na], [t('api.status'), t(model.api?.status === 'preview' ? 'api.preview' : 'api.ga')],
  [t('model.context'), model.context === null ? na : t('model.contextValue', {value: model.context.toLocaleString('en-US')})],
  [t('api.maxOutput'), model.api ? t('model.contextValue', {value: model.api.maxOutput.toLocaleString('en-US')}) : na],
  [t('model.image'), model.api?.vision === null || model.api?.vision === undefined ? na : t(model.api.vision ? 'model.yes' : 'model.no')],
  [t('model.totalParams'), t('api.notPublished')], [t('model.architecture'), t('api.notPublished')],
 ];
 $: blocks = mechanismsOf(model);
 $: isCandidate = selection.candidates.includes(model.id);
 $: comparing = $compareList.includes(model.id);
 $: licenseUrl = safeUrl(model.license.url);
 $: isMissing = (v: string) => v === na || v === t('model.notRecorded');
 $: groups = [
  {title: t('model.footprint'), rows: [
   [t('model.weights'), model.weightGiB === null ? na : model.weightSource === 'estimate' ? t('model.estimate', {value: formatGiB(model.weightGiB)}) : formatGiB(model.weightGiB)],
   [t('model.weightFormat'), o?.weightFormat ? t('model.weightFiles', {format: o.weightFormat, count: o.weightFiles}) : na],
   [t('model.precision'), show(o?.storedPrecision)],
   [t('model.cache'), model.kvKiBPerToken === null ? na : t('model.cacheValue', {value: model.kvKiBPerToken})],
   [t('model.memoryAt', {context: formatTokens(a.footprint.contextUsed)}), a.footprint.memoryGiB === null ? na : formatGiB(a.footprint.memoryGiB)],
   [t('model.gpusPerReplica'), a.footprint.gpusPerReplica === null ? t('model.setGpu') : String(a.footprint.gpusPerReplica)],
  ]},
  {title: t('model.overview'), rows: [
   [t('model.released'), show(model.released)], [t('model.country'), model.country || t('model.notRecorded')], [t('model.totalParams'), model.totalParams === null ? na : formatParams(model.totalParams)],
   [t('model.activeParams'), model.activeParams === null ? na : formatParams(model.activeParams)], [t('model.context'), model.context === null ? na : t('model.contextValue', {value: model.context.toLocaleString('en-US')})],
   [t('model.task'), show(o?.pipeline)], [t('model.image'), o ? (o.vision ? t('model.yes') : o.configUrl ? t('model.no') : na) : na],
   [t('model.languages'), o?.languages.length ? (o.languages.length > 8 ? t('model.languageCount', {count: o.languages.length}) : o.languages.join(', ')) : na],
  ]},
  {title: t('model.architecture'), rows: [
   [t('model.attention'), show(model.architecture.attention)], [t('model.layerMix'), show(model.architecture.layerMix)],
   [t('model.layers'), count(o?.layers)], [t('model.hiddenSize'), count(o?.hiddenSize)], [t('model.heads'), count(o?.heads)], [t('model.kvHeads'), count(o?.kvHeads)], [t('model.vocab'), count(o?.vocab)],
  ]},
  {title: t('model.training'), rows: [[t('model.trainingData'), show(model.trainingData)], [t('model.postTraining'), show(model.postTraining)], [t('model.aaIndex'), model.artificialAnalysisIndex === null ? na : String(model.artificialAnalysisIndex)]]},
 ];
</script>
<nav class="page-nav" aria-label={t('model.overline')}>
 <a class="back-link" href={backHref}><span aria-hidden="true">←</span> {t('common.backTo', {target: backLabel})}</a>
 {#if total > 1 && position > 0}
  <div class="pager">
   {#if prevId}<a class="btn small" href={cardLink(prevId)}>{t('common.previous')}</a>{:else}<span class="btn small disabled">{t('common.previous')}</span>{/if}
   <span>{t('common.positionOf', {position, total})}</span>
   {#if nextId}<a class="btn small" href={cardLink(nextId)}>{t('common.next')}</a>{:else}<span class="btn small disabled">{t('common.next')}</span>{/if}
  </div>
 {/if}
</nav>
<header class="page-head">
 <div><p class="overline">{t('model.overline')}{#if isApi} · <b class="api-tag">{t('api.tag')}</b>{/if}</p><h1>{model.name}</h1><p>{model.publisher}{#if family} · <a href={`#/architecture/family/${family.id}/${encodeURIComponent(model.id)}`}>{family.name}</a>{/if}</p></div>
 <div class="arch-actions">
  {#if exploreLink}<a class="btn" href={exploreLink}>{t('model.exploreArchitecture')}</a>{/if}
  {#if !isApi}<button class="btn" disabled={!comparing && $compareList.length >= MAX_COMPARE} on:click={() => toggleCompare(model.id)}>{t(comparing ? 'slm.removeCompare' : 'slm.addCompare')}</button>{/if}
  {#if $compareList.length}<a class="btn" href="#/compare/diagram">{t('compare.openCompare', {n: $compareList.length})}</a>{/if}
  {#if !isApi}<button class="btn primary" disabled={!isCandidate && selection.candidates.length >= MAX_CANDIDATES} on:click={() => toggleCandidate(model.id)}>{t(isCandidate ? 'model.removeCandidate' : 'model.addCandidate')}</button>{/if}
 </div>
</header>
{#if model.architecture.keyDetail}<p class="lede">{model.architecture.keyDetail}</p>{/if}
{#if isApi}<p class="callout">{t('api.cardIntro', {provider: model.publisher})}</p>{/if}
<section class="card license-card">
 <h2>{t('model.licence')} <span class={`status ${commercialTone[r.commercial]}`}>{t('model.commercialUse', {status: commercialLabel(r.commercial)})}</span></h2>
 <p class="license-name">{#if licenseUrl}<a href={licenseUrl} target="_blank" rel="noreferrer">{r.name}</a>{:else}{r.name}{/if}</p>
 <p>{r.summary}</p>
 {#if r.obligations.length || r.restrictions?.length}<div class="two-lists">
  {#if r.obligations.length}<div><h3>{t('model.obligations')}</h3><ul class="plain">{#each r.obligations as x}<li>{x}</li>{/each}</ul></div>{/if}
  {#if r.restrictions?.length}<div><h3>{t('model.restrictions')}</h3><ul class="plain">{#each r.restrictions as x}<li>{x}</li>{/each}</ul></div>{/if}
 </div>{/if}
 {#if o?.gated}<p class="note">{t('model.gated')}</p>{/if}
</section>
<ModelCost {model}/>
{#if hasDiagram && arch}<section class="card"><div class="card-title"><h2>{t('diagram.title', {name: model.name})}</h2>{#if family}<a class="btn small" href={`#/architecture/family/${family.id}/${encodeURIComponent(model.id)}`}>{t('model.explain')}</a>{/if}</div><p class="note flush">{t('diagram.intro')}</p><ModelDiagram {arch}/></section>{/if}
{#if !isApi}<section class="card license-card">
 <h2>{t('model.blocks')}{#if exploreLink}<a class="btn small" href={exploreLink}>{t('model.explain')}</a>{/if}</h2>
 <div class="chips flush">{#each blocks as b (b.id)}<a class="chip link" href={`#/architecture/mechanism/${b.id}`}>{b.name}</a>{/each}</div>
</section>{/if}
<div class="card-grid">
 {#if isApi}<section class="card"><h2>{t('model.overview')}</h2><dl>{#each apiRows as row}<div><dt>{row[0]}</dt><dd class:missing={isMissing(row[1]) || row[1] === t('api.notPublished')}>{row[1]}</dd></div>{/each}</dl></section>{/if}
 {#each isApi ? [] : groups as g}<section class="card"><h2>{g.title}</h2><dl>{#each g.rows as row}<div><dt>{row[0]}</dt><dd class:missing={isMissing(row[1])}>{row[1]}</dd></div>{/each}</dl></section>{/each}
 <section class="card wide"><h2>{t('model.sources')}</h2><dl>
  {#if isApi && apiInfo && provider}<div><dt>{t('api.modelPage')}</dt><dd><a href={safeUrl(apiInfo.source)} target="_blank" rel="noreferrer">{new URL(apiInfo.source).hostname}</a></dd></div><div><dt>{t('api.pricing')}</dt><dd><a href={safeUrl(provider.pricingUrl)} target="_blank" rel="noreferrer">{new URL(provider.pricingUrl).hostname}</a></dd></div><div><dt>{t('api.terms')}</dt><dd><a href={safeUrl(provider.terms.url)} target="_blank" rel="noreferrer">{provider.terms.title}</a></dd></div>{:else}
  <div><dt>{t('model.officialCard')}</dt><dd>{#if o}<a href={o.url} target="_blank" rel="noreferrer">{o.repo}</a>{:else}<span class="missing">{t('model.noRepository')}</span>{/if}</dd></div>
  {#if o}<div><dt>{t('model.revision')}</dt><dd class="mono">{o.revision}</dd></div><div><dt>{t('model.updated')}</dt><dd>{o.lastModified?.slice(0, 10)}</dd></div>
  <div><dt>{t('model.configuration')}</dt><dd>{#if o.configUrl}<a href={o.configUrl} target="_blank" rel="noreferrer">{t('model.configFile')}</a>{:else}<span class="missing">{t('model.notAccessible')}</span>{/if}</dd></div>
  {#if o.configSource}<div><dt>{t('model.publishedFigures')}</dt><dd>{#each o.configSource.sources as src, i}{i ? ' · ' : ''}<a href={safeUrl(src.url)} target="_blank" rel="noreferrer">{src.title}</a>{/each}<small class="note">{t('model.publishedFiguresNote')} {o.configSource.note}</small></dd></div>{/if}{/if}
  <div><dt>{t('model.architectureSource')}</dt><dd><a href={model.galleryUrl} target="_blank" rel="noreferrer">{t('model.gallery')}</a></dd></div>
  {#each model.otherSources as url}{#if safeUrl(url)}<div><dt>{t('model.publisherDoc')}</dt><dd><a href={safeUrl(url)} target="_blank" rel="noreferrer">{new URL(url).hostname}</a></dd></div>{/if}{/each}{/if}
 </dl></section>
 {#if model.flags.length}<section class="card wide"><h2>{t('model.dataNotes')}</h2><ul class="plain">{#each model.flags as f}<li>{f}</li>{/each}</ul></section>{/if}
 {#if hasRequirements(selection)}<section class="card wide"><h2>{t('model.against')} <span class={`status ${a.status}`}>{statusLabel(a.status)}</span></h2>
  <table class="compact"><tbody>{#each a.checks as c}<tr><td>{c.label}</td><td>{c.detail}</td><td><span class={`status ${c.status}`}>{statusLabel(c.status)}</span></td></tr>{/each}</tbody></table>
 </section>{/if}
</div>
