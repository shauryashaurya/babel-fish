<script lang="ts">
 import BarList from './BarList.svelte';
 import MathBlock from './MathBlock.svelte';
 import SpecDemo from './SpecDemo.svelte';
 import {compareContent, DIMENSIONS, distribution, MODEL_LETTERS, MODEL_TONES, type Arch, type Dimension} from '../lib/compare';
 import {families, mechanisms} from '../lib/architecture';
 import {t} from '../lib/content';
 export let all: Arch[];
 export let items: Arch[];
 export let spec = '';

 let current = compareContent.specs.some(s => s.id === spec) ? spec : compareContent.specs[0]?.id;
 $: if (spec && compareContent.specs.some(s => s.id === spec)) current = spec;
 $: info = compareContent.specs.find(s => s.id === current)!;
 $: groups = compareContent.groups.map(g => ({...g, specs: compareContent.specs.filter(s => s.group === g.id)}));
 function choose(id: string) { current = id; history.replaceState(null, '', `#/compare/explained/${id}`); document.querySelector('main')?.scrollTo({top: 0}); }

 /** The catalog-wide spread for each spec, using the same values the comparison shows. */
 const custom: Record<string, Dimension> = {
  attention: {id: 'attType', label: '', spec: 'attention', group: '', text: a => a.attentionType},
  qknorm: {id: 'qk', label: '', spec: 'qknorm', group: '', text: a => a.qkNorm ? t('compare.yes') : null},
  position: {id: 'ropeBase', label: '', spec: 'position', group: '', text: a => a.rope?.theta ? a.rope.theta.toLocaleString('en-US') : null},
  window: {id: 'win', label: '', spec: 'window', group: '', text: a => a.cache ? (a.cache.window ? t('compare.windowOf', {w: a.cache.windowSize?.toLocaleString('en-US') ?? '?'}) : t('compare.noWindow')) : null},
  hybrid: {id: 'hyb', label: '', spec: 'hybrid', group: '', text: a => a.family},
  ffn: {id: 'act', label: '', spec: 'ffn', group: '', text: a => a.activation},
  moe: {id: 'exp', label: '', spec: 'moe', group: '', text: a => a.experts ? t('compare.expertsText', {experts: a.experts, active: a.expertsActive ?? '?'}) : null},
  output: {id: 'tied', label: '', spec: 'output', group: '', text: a => a.tied === null ? null : t(a.tied ? 'compare.tied' : 'compare.untied')},
  headdim: {id: 'hd', label: '', spec: 'headdim', group: '', text: a => a.headDim ? String(a.headDim) : null},
  context: {id: 'ctx', label: '', spec: 'context', group: '', text: a => a.context ? a.context.toLocaleString('en-US') : null},
  scale: {id: 'tier', label: '', spec: 'scale', group: '', text: a => a.totalParams === null ? null : a.totalParams < 4e9 ? t('compare.tierSmall') : a.totalParams < 40e9 ? t('compare.tierMid') : a.totalParams < 300e9 ? t('compare.tierLarge') : t('compare.tierHuge')},
  cache: {id: 'kvb', label: '', spec: 'cache', group: '', text: a => a.kvKiB === null ? null : a.kvKiB < 32 ? t('compare.kvBand1') : a.kvKiB < 128 ? t('compare.kvBand2') : a.kvKiB < 384 ? t('compare.kvBand3') : t('compare.kvBand4')},
  licence: {id: 'lic', label: '', spec: 'licence', group: '', text: a => a.licence},
 };
 $: dim = custom[current] ?? DIMENSIONS.find(d => d.spec === current) ?? null;
 $: spread = dim ? distribution(all, dim, 10) : [];
 $: stated = dim ? all.filter(a => dim!.text(a) !== null).length : 0;
 $: selectedDims = DIMENSIONS.filter(d => d.spec === current);
</script>

<div class="spec-layout">
 <nav class="spec-nav" aria-label={t('compare.tab_explained')}>
  {#each groups as g (g.id)}
   <h3>{g.name}</h3>
   {#each g.specs as s (s.id)}<button class:on={s.id === current} aria-current={s.id === current ? 'true' : undefined} on:click={() => choose(s.id)}>{s.name}<small>{s.short}</small></button>{/each}
  {/each}
 </nav>
 {#if info}
  <article class="spec-body">
   <header class="spec-head"><p class="overline">{compareContent.groups.find(g => g.id === info.group)?.name}</p><h2>{info.name}</h2><p>{info.short}</p></header>
   <section class="card plain-card"><p class="plain-analogy"><span>{t('compare.inPlainWords')}</span> {info.plain}</p></section>
   <div class="card-grid">
    <section class="card"><h2>{t('compare.howItWorks')}</h2><ul class="plain">{#each info.technical as x}<li>{x}</li>{/each}</ul></section>
    <section class="card"><h2>{t('compare.whyItMatters')}</h2><p>{info.matters}</p>
     {#if info.configKeys.length}<h3>{t('compare.configKeys')}</h3><p class="key-list">{#each info.configKeys as k}<code>{k}</code>{/each}</p>{/if}
    </section>
   </div>
   {#if info.demo}<section class="card"><SpecDemo demo={info.demo} {items} {all}/></section>{/if}
   {#if info.math.length}<section class="card"><h2>{t('compare.formulas')}</h2><MathBlock items={info.math}/></section>{/if}
   {#if items.length && selectedDims.length}
    <section class="card"><h2>{t('compare.inYourSelection')}</h2>
     {#each selectedDims as d (d.id)}
      <h3>{t(d.label)}</h3>
      <div class="diff-values" style={`--cols: ${items.length}`}>
       {#each items as a, i (a.id)}{@const v = d.text(a)}<div class="diff-value" style={`--tone: var(--s${MODEL_TONES[i]})`}><span class="diff-model"><b>{MODEL_LETTERS[i]}</b> {a.name}</span>{#if v !== null}<strong>{v}</strong>{:else}<span class="missing">{t('compare.notStated')}</span>{/if}</div>{/each}
      </div>
     {/each}
    </section>
   {/if}
   {#if spread.length}
    <section class="card"><h2>{t('compare.acrossCatalog')}</h2><BarList rows={spread}/><p class="note">{t('compare.acrossNote', {stated, total: all.length})}</p></section>
   {/if}
   {#if info.related?.length}
    <section class="card"><h2>{t('compare.relatedPages')}</h2><p class="related-links">{#each info.related as id}{@const m = mechanisms.find(x => x.id === id)}{@const f = families.find(x => x.id === id)}{#if m}<a class="btn small" href={`#/architecture/mechanism/${m.id}`}>{m.name}</a>{:else if f}<a class="btn small" href={`#/architecture/family/${f.id}`}>{f.name}</a>{/if}{/each}</p></section>
   {/if}
   <section class="card"><h2>{t('compare.sources')}</h2>
    {#if info.sources.length}<ul class="plain">{#each info.sources as s}<li><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>{/each}</ul>
    {:else}<p>{t('compare.sourceIsCard')}</p>{/if}
   </section>
  </article>
 {/if}
</div>
