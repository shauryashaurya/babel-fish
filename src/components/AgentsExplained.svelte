<script lang="ts">
 import AgentConceptDemo from './AgentConceptDemo.svelte';
 import CodeBlock from './CodeBlock.svelte';
 import MathBlock from './MathBlock.svelte';
 import {agents, CATEGORY_TONE as TONE} from '../lib/agents';
 import {concepts} from '../lib/agentConcepts';
 import {t} from '../lib/content';
 import {safeUrl} from '../lib/selection';
 import type {Model} from '../lib/types';
 export let models: Model[];
 export let topic = '';

 const valid = (id: string) => concepts.topics.some(c => c.id === id);
 let current = valid(topic) ? topic : concepts.topics[0]?.id ?? '';
 $: if (topic && valid(topic)) current = topic;
 $: info = concepts.topics.find(c => c.id === current)!;
 $: index = concepts.topics.findIndex(c => c.id === current);
 $: prev = index > 0 ? concepts.topics[index - 1] : null;
 $: next = index < concepts.topics.length - 1 ? concepts.topics[index + 1] : null;
 const groups = concepts.groups.map(g => ({...g, topics: concepts.topics.filter(c => c.group === g.id)}));
 function choose(id: string) { current = id; history.replaceState(null, '', `#/agents/explained/${id}`); document.querySelector('main')?.scrollTo({top: 0}); }
 const pat = (id: string) => agents.patterns.find(p => p.id === id);
</script>

<p class="note flush explain-intro">{concepts.intro}</p>
<div class="spec-layout">
 <nav class="spec-nav" aria-label={t('agentsExplained.navLabel')}>
  {#each groups as g (g.id)}
   <h3>{g.name}</h3>
   {#each g.topics as c (c.id)}<button class:on={c.id === current} aria-current={c.id === current ? 'true' : undefined} on:click={() => choose(c.id)}>{c.name}<small>{c.short}</small></button>{/each}
  {/each}
 </nav>
 {#if info}
  <article class="spec-body">
   <header class="spec-head"><p class="overline">{concepts.groups.find(g => g.id === info.group)?.name} · {t('common.positionOf', {position: index + 1, total: concepts.topics.length})}</p><h2>{info.name}</h2><p>{info.short}</p></header>
   <section class="card plain-card"><p class="plain-analogy"><span>{t('compare.inPlainWords')}</span> {info.plain}</p></section>
   <div class="card-grid">
    <section class="card"><h2>{t('compare.howItWorks')}</h2><ul class="plain">{#each info.technical as x}<li>{x}</li>{/each}</ul></section>
    <section class="card"><h2>{t('compare.whyItMatters')}</h2><p>{info.matters}</p>
     {#if info.related?.length}<h3>{t('agentsExplained.related')}</h3><p class="related-links">{#each info.related as r}<a class="btn small" href={r.href}>{r.label}</a>{/each}</p>{/if}
    </section>
   </div>
   {#if info.demo}<section class="card"><AgentConceptDemo demo={info.demo} {models} topic={info.id}/></section>{/if}
   {#if info.table}
    <section class="card"><h2>{t('agentsExplained.atAGlance')}</h2>
     <div class="table-wrap auto"><table class="trace-table concept-table"><thead><tr>{#each info.table.columns as c}<th>{c}</th>{/each}</tr></thead>
      <tbody>{#each info.table.rows as row}<tr>{#each row as cell, i}{#if i === 0}<th scope="row">{cell}</th>{:else}<td>{cell}</td>{/if}{/each}</tr>{/each}</tbody></table></div>
    </section>
   {/if}
   {#if info.apps}
    <section class="card"><h2>{t('agentsExplained.appsTitle')}</h2>
     <div class="table-wrap auto"><table class="trace-table concept-table"><thead><tr><th>{t('agentsExplained.colApp')}</th><th>{t('agentsExplained.colWhat')}</th><th>{t('agentsExplained.colPatterns')}</th><th>{t('agentsExplained.colBenchmark')}</th><th>{t('agentsExplained.colRisk')}</th></tr></thead>
      <tbody>{#each info.apps as a (a.name)}<tr><th scope="row">{a.name}</th><td>{a.what}</td>
       <td class="chip-cell">{#each a.patterns as id}{@const p = pat(id)}{#if p}<a class="pattern-mini" href={`#/agents/patterns/${id}`} style={`--tone: var(--s${TONE[p.category]})`}>{p.name}</a>{/if}{/each}</td>
       <td>{#if a.benchmarks.length}{#each a.benchmarks as b, i}{i ? ' · ' : ''}<a href={safeUrl(b.url)} target="_blank" rel="noreferrer">{b.title.split(',')[0]}</a>{/each}{:else}<span class="missing">{t('agentsExplained.noBenchmark')}</span>{/if}</td>
       <td>{a.risk}</td></tr>{/each}</tbody></table></div>
    </section>
   {/if}
   {#if info.code.length}<section class="card"><h2>{t('agentsExplained.codeTitle')}</h2><div class="code-list">{#each info.code as c (c.title)}<CodeBlock title={c.title} lang={c.lang} text={c.text} note={c.note ?? ''}/>{/each}</div></section>{/if}
   {#if info.math.length}<section class="card"><h2>{t('compare.formulas')}</h2><MathBlock items={info.math}/></section>{/if}
   <section class="card"><h2>{t('compare.sources')}</h2><ul class="plain">{#each info.sources as s}<li><a href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}</a></li>{/each}</ul></section>
   <nav class="explain-pager" aria-label={t('agentsExplained.pager')}>
    {#if prev}<button class="btn" on:click={() => choose(prev.id)}>← {prev.name}</button>{:else}<span></span>{/if}
    {#if next}<button class="btn" on:click={() => choose(next.id)}>{next.name} →</button>{/if}
   </nav>
  </article>
 {/if}
</div>
