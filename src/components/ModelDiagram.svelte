<script lang="ts">
 /** One model's processing path. Every box opens a callout on what that layer does in this particular model. */
 import {mechanisms} from '../lib/architecture';
 import {specById, type Arch} from '../lib/compare';
 import {t} from '../lib/content';
 import {cellsOf, explainRepeat, explainRow, ROWS, segmentSeries, type DiagramRow} from '../lib/diagram';
 export let arch: Arch;
 export let tone = 1;

 let selected = 'mixer', layer: number | null = null;
 $: cells = cellsOf(arch);
 $: before = ROWS.filter(r => !r.repeat && ROWS.indexOf(r) < ROWS.findIndex(x => x.repeat));
 $: inside = ROWS.filter(r => r.repeat);
 $: after = ROWS.filter(r => !r.repeat && ROWS.indexOf(r) > ROWS.findIndex(x => x.repeat));
 $: row = ROWS.find(r => r.id === selected) ?? null;
 $: spec = row?.spec ? specById(row.spec) : selected === 'repeat' ? specById('layers') : null;
 $: lines = selected === 'repeat' ? explainRepeat(arch) : row ? explainRow(row.id, arch) : [];
 $: title = selected === 'repeat' ? t('diagram.repeatTitle', {n: arch.layers ?? '?'}) : row?.title(arch) ?? '';
 $: detail = row?.detail(arch) ?? null;
 $: cell = layer !== null ? cells[layer] : null;
 const pick = (id: string) => { selected = id; };
</script>

{#snippet block(r: DiagramRow)}
 {@const d = r.detail(arch)}
 <button class={`md-block ${r.kind ?? ''}`} class:on={selected === r.id} aria-expanded={selected === r.id} on:click={() => pick(r.id)}>
  <span>{r.title(arch)}</span>{#if d}<small>{d}</small>{/if}
 </button>
 {#if selected === r.id}<div class="md-inline">{@render panel()}</div>{/if}
{/snippet}

{#snippet panel()}
 <p class="overline">{t('diagram.inModel', {name: arch.name})}</p>
 <h3>{title}</h3>
 {#if detail}<p class="md-detail">{detail}</p>{/if}
 <ul class="plain md-lines">{#each lines as l}<li>{l}</li>{/each}</ul>
 {#if selected === 'repeat' && cell}<p class="callout">{t('diagram.layerPicked', {layer: (layer ?? 0) + 1, total: cells.length, label: cell.label})}{#if cell.mechanism} <a href={`#/architecture/mechanism/${cell.mechanism.id}`}>{t('diagram.openBlock', {name: cell.mechanism.name})}</a>{/if}</p>{/if}
 {#if spec}
  <h4>{t('diagram.whatItIs')}</h4><p>{spec.plain}</p>
  <h4>{t('compare.whyItMatters')}</h4><p>{spec.matters}</p>
  <p class="related-links"><a class="btn small" href={`#/compare/explained/${spec.id}`}>{t('compare.fullExplanation')}</a>{#each (spec.related ?? []).map(id => mechanisms.find(m => m.id === id)).filter(Boolean) as m}<a class="btn small" href={`#/architecture/mechanism/${m?.id}`}>{m?.name}</a>{/each}</p>
 {/if}
{/snippet}

<div class="model-diagram" style={`--tone: var(--s${tone})`}>
 <div class="md-stack" role="group" aria-label={t('diagram.aria', {name: arch.name})}>
  <div class="md-head"><b>{arch.name}</b><small>{arch.family ?? ''}</small></div>
  {#each before as r (r.id)}{@render block(r)}{/each}
  <div class="md-repeat" class:on={selected === 'repeat'}>
   <button class="md-repeat-head" aria-expanded={selected === 'repeat'} on:click={() => pick('repeat')}>{arch.layers ? t('compare.d.repeat', {n: arch.layers}) : t('compare.d.repeatUnknown')}</button>
   {#if cells.length}
    <div class="mini-stack" role="group" aria-label={t('compare.d.layerStrip', {name: arch.name})}>
     {#each cells as s, li}<button class={`series-${segmentSeries(s)}`} class:on={layer === li} title={t('architecture.selectedLayer', {layer: li + 1, total: cells.length, label: s.label})} aria-label={t('architecture.selectedLayer', {layer: li + 1, total: cells.length, label: s.label})} on:click={() => { layer = li; pick('repeat'); }}></button>{/each}
    </div>
    <small class="mini-stack-note">{arch.layerMix ?? ''}</small>
   {/if}
   {#if selected === 'repeat'}<div class="md-inline">{@render panel()}</div>{/if}
   {#each inside as r (r.id)}{@render block(r)}{/each}
  </div>
  {#each after as r (r.id)}{@render block(r)}{/each}
 </div>
 <aside class="md-side" aria-live="polite">{@render panel()}</aside>
</div>
<p class="note">{t('diagram.note')}</p>
