<script lang="ts">
 import {families, segmentSeries} from '../lib/architecture';
 import {compareContent, MODEL_LETTERS, MODEL_TONES, specById, type Arch} from '../lib/compare';
 import {cellsOf, explainRow, NORM_ROWS, ROWS, type DiagramRow} from '../lib/diagram';
 import {t} from '../lib/content';
 import {exploreHref} from '../lib/explore';
 export let items: Arch[];

 type Row = DiagramRow;
 const rows = ROWS;
 const key = (r: Row, a: Arch) => `${r.title(a)}|${r.detail(a) ?? ''}`;
 /** A row differs when at least two models state it and the stated content disagrees. */
 const stated = (r: Row, a: Arch) => NORM_ROWS.includes(r.id) ? a.norm !== null : r.detail(a) !== null;
 function differs(r: Row, list: Arch[]) {
  const known = list.filter(a => stated(r, a));
  return known.length > 1 && new Set(known.map(a => key(r, a))).size > 1;
 }
 let selected: Row | null = null;
 $: chosen = selected ? specById(selected.spec ?? '') : null;
 $: diffRows = new Set(rows.filter(r => differs(r, items)).map(r => r.id));
 let layerPick: Record<string, number> = {};
</script>

<section class="card diagram-card">
 {#if items.length > 1}<p class="scroll-hint">{t('compare.d.scrollHint')}</p>{/if}
 <div class="cmp-diagram" style={`--cols: ${items.length}`}>
  <div class="cmp-row head">
   {#each items as a, i (a.id)}<div class="cmp-col-head" style={`--tone: var(--s${MODEL_TONES[i]})`}><b>{MODEL_LETTERS[i]}</b><a href={a.href}>{a.name}</a>{#if families.find(f => f.name === a.family)}<a class="col-family" href={exploreHref(a.id) ?? `#/architecture/family/${families.find(f => f.name === a.family)?.id}`}>{a.family}</a>{:else}<small>{a.family ?? t('compare.notStated')}</small>{/if}</div>{/each}
  </div>
  {#each rows as r (r.id)}
   {#if r.repeat === 'top'}
    <div class="cmp-row">
     {#each items as a, i (a.id)}
      {@const cells = cellsOf(a)}
      {@const pickIndex = layerPick[a.id]}
      <div class="cmp-cell repeat-top" style={`--tone: var(--s${MODEL_TONES[i]})`}>
       <div class="repeat-label">{a.layers ? t('compare.d.repeat', {n: a.layers}) : t('compare.d.repeatUnknown')}</div>
       {#if cells.length}
        <div class="mini-stack" role="group" aria-label={t('compare.d.layerStrip', {name: a.name})}>
         {#each cells as s, li}<button class={`series-${segmentSeries(s)}`} class:on={pickIndex === li} title={t('architecture.selectedLayer', {layer: li + 1, total: cells.length, label: s.label})} aria-label={t('architecture.selectedLayer', {layer: li + 1, total: cells.length, label: s.label})} on:click={() => layerPick = {...layerPick, [a.id]: li}}></button>{/each}
        </div>
        <small class="mini-stack-note">{pickIndex !== undefined && cells[pickIndex] ? t('architecture.selectedLayer', {layer: pickIndex + 1, total: cells.length, label: cells[pickIndex].label}) : a.layerMix ?? ''}</small>
       {:else}<small class="mini-stack-note">{a.layerMix ?? t('compare.d.layoutUnknown')}</small>{/if}
      </div>
     {/each}
    </div>
   {/if}
   <div class="cmp-row">
    {#each items as a, i (a.id)}
     {@const detail = r.detail(a)}
     <div class={`cmp-cell ${r.repeat ? 'in-repeat' : ''} ${r.repeat === 'bottom' ? 'repeat-bottom' : ''}`} style={`--tone: var(--s${MODEL_TONES[i]})`}>
      <button class={`cmp-block ${r.kind ?? ''}`} class:differs={diffRows.has(r.id)} class:picked={selected?.id === r.id} disabled={!r.spec} on:click={() => selected = selected?.id === r.id ? null : r}>
       <span>{r.title(a)}</span>
       {#if detail}<small>{detail}</small>{:else if r.spec && !['res1', 'res2', 'norm1', 'norm2', 'final'].includes(r.id)}<small class="missing">{t('compare.notStated')}</small>{/if}
      </button>
     </div>
    {/each}
   </div>
  {/each}
 </div>
 <p class="note">{compareContent.diagramNote} {t('compare.d.legend')}</p>
</section>

{#if selected && chosen}
 <section class="card diagram-detail">
  <div class="card-title"><h2>{chosen.name}</h2><a class="btn small" href={`#/compare/explained/${chosen.id}`}>{t('compare.fullExplanation')}</a></div>
  <p>{chosen.plain}</p>
  <div class="diff-values" style={`--cols: ${items.length}`}>
   {#each items as a, i (a.id)}
    {@const detail = selected.detail(a)}
    <div class="diff-value" class:differs={diffRows.has(selected.id)} style={`--tone: var(--s${MODEL_TONES[i]})`}>
     <span class="diff-model"><b>{MODEL_LETTERS[i]}</b> {a.name}</span>
     <strong>{selected.title(a)}</strong>{#if detail}<small>{detail}</small>{/if}
     <ul class="plain why-list">{#each explainRow(selected.id, a) as line}<li>{line}</li>{/each}</ul>
    </div>
   {/each}
  </div>
  <p class="note"><b>{t('compare.whyItMatters')}</b> {chosen.matters}</p>
 </section>
{/if}
