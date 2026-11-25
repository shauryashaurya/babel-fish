<script lang="ts">
 import BarList from './BarList.svelte';
 import MiniChart, {niceTicks} from './MiniChart.svelte';
 import {t} from '../lib/content';
 import {terms} from '../lib/ragMath';
 import type {Step} from '../lib/ragLab';
 export let steps: Step[];
 export let query = '';
 $: qTerms = new Set(terms(query));
 const mark = (text: string, set: Set<string>) => text.split(/(\s+)/).map(w => ({w, hit: set.has(w.toLowerCase().replace(/[^a-z0-9]/g, ''))}));
</script>
<ol class="trace">
 {#each steps as s, i}
  <li class="trace-step" class:warn={s.kind === 'text' && s.tone === 'warn'} class:ok={s.kind === 'text' && s.tone === 'ok'}>
   <h4><span class="trace-n">{i + 1}</span>{s.title}</h4>
   {#if s.kind === 'text'}<p>{s.text}</p>
   {:else if s.kind === 'chips'}<p class="key-list">{#each s.items as c}<code>{c}</code>{/each}</p>
   {:else if s.kind === 'code'}<pre class="prompt-preview">{s.text}</pre>
   {:else if s.kind === 'tiles'}<div class="size-tiles" class:three={s.items.length === 3}>{#each s.items as x}<div><span>{x.label}</span><strong>{x.value}</strong></div>{/each}</div>
   {:else if s.kind === 'bars'}<BarList rows={s.rows} format={s.percent ? (v => `${(v * 100).toFixed(1)}%`) : (v => v.toFixed(3).replace(/\.?0+$/, '') || '0')}/>
   {:else if s.kind === 'chart'}<MiniChart series={s.series} xMin={s.xMin ?? 1} xMax={s.xMax} yMin={0} yMax={s.yMax} xLabel={s.xLabel} yLabel={s.yLabel} aria={s.title} format={v => v.toFixed(3)} xFormat={v => String(Math.round(v))}/>
   {:else if s.kind === 'gantt'}
    <div class="gantt" role="img" aria-label={s.title}>
     {#each s.rows as g}
      <div class="gantt-row"><span class="gantt-label">{g.label}</span><span class="gantt-track"><i style={`left:${100 * g.start / s.total}%;width:${Math.max(.6, 100 * (g.end - g.start) / s.total)}%;background:var(--s${g.tone})`} title={`${g.label}: ${g.start.toLocaleString('en-US')}–${g.end.toLocaleString('en-US')} ${s.unit}`}></i></span><b>{(g.end - g.start).toLocaleString('en-US')} {s.unit}</b></div>
     {/each}
     <div class="gantt-row gantt-axis"><span></span><span class="gantt-track">{#each niceTicks(0, s.total, 4).filter(v => v <= s.total) as v}<em style={`left:${100 * v / s.total}%`}>{v.toLocaleString('en-US')}</em>{/each}</span><b>{s.unit}</b></div>
    </div>
    {#if s.note}<p class="note">{s.note}</p>{/if}
   {:else if s.kind === 'table'}
    <div class="table-wrap auto"><table class="trace-table"><thead><tr>{#each s.head as h}<th>{h}</th>{/each}</tr></thead>
     <tbody>{#each s.rows as r}<tr>{#each r as c}<td>{c}</td>{/each}</tr>{/each}</tbody></table></div>
    {#if !s.rows.length}<p class="empty">{t('ragLab.noRows')}</p>{/if}
    {#if s.note}<p class="note">{s.note}</p>{/if}
   {:else if s.kind === 'hits'}
    {#if !s.hits.length}<p class="empty">{t('rag.noHits')}</p>{/if}
    <ol class="hits">
     {#each s.hits as h, j (h.p.id)}
      <li>
       <div class="hit-head"><b>[{j + 1}]</b> <a href={h.p.href}>{h.p.title}</a> <small>{h.p.section}</small>
        <span class="hit-ranks">{#if h.note}{h.note} · {/if}{s.scoreLabel} {h.score.toFixed(3)}</span></div>
       <p>{#each mark(h.p.text, qTerms) as p}{#if p.hit}<mark>{p.w}</mark>{:else}{p.w}{/if}{/each}</p>
      </li>
     {/each}
    </ol>
   {/if}
  </li>
 {/each}
</ol>
