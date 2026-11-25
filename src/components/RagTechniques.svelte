<script lang="ts">
 import {onDestroy} from 'svelte';
 import BarList from './BarList.svelte';
 import RagTrace from './RagTrace.svelte';
 import {t} from '../lib/content';
 import {rag} from '../lib/rag';
 import {adaptive, agentic, benchmark, chunking, compression, contextual, crag, fusion, graphrag, hybrid, hyde, knownItems, lab, late, memory, multihop, multimodal, naive, raptor, rerank, rl, selfrag, sql, type BenchRow, type Run, type Turn} from '../lib/ragLab';
 import {safeUrl} from '../lib/selection';
 import type {Model} from '../lib/types';
 export let models: Model[];
 export let item = '';

 const items = rag.techniques.items;
 const SCORES = 'scores';
 let current = items.some(x => x.id === item) || item === SCORES ? item : items[0].id;
 $: if (item && (items.some(x => x.id === item) || item === SCORES)) current = item;
 $: tech = items.find(x => x.id === current);
 $: n = items.findIndex(x => x.id === current) + 1;
 function choose(id: string) { current = id; history.replaceState(null, '', `#/rag/techniques/${id}`); document.querySelector('main')?.scrollTo({top: 0}); }

 // Shared question, with the hand-written examples that belong to each preset
 const presets = rag.labQueries;
 let query = presets[0].q, draft = presets[0].hyde, subqs = presets[0].subqs.join('\n'), rewrites = presets[0].rewrites.join('\n'), fromPreset = true;
 function usePreset(i: number) { const p = presets[i]; query = p.q; draft = p.hyde; subqs = p.subqs.join('\n'); rewrites = p.rewrites.join('\n'); fromPreset = true; }
 function typed() { if (fromPreset) { draft = ''; subqs = ''; rewrites = ''; fromPreset = false; } }

 // Controls
 let k = 5, strategy: 'fixed' | 'semantic' | 'hierarchical' = 'semantic', pctl = 95, n1 = 20, mode: 'local' | 'global' = 'local';
 let sqlId = rag.sqlPresets[0].id, threshold = .5, order: 'relevance' | 'edges' | 'source' = 'relevance';
 let retrieveAt = .15, relevantAt = .3, upper = .45, lower = .2, budget = 5, epochs = 30, lr = .5, seed = 1;
 let turns: Turn[] = [];
 $: preset = rag.sqlPresets.find(s => s.id === sqlId)!;
 const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

 // Runs are scheduled after paint, so the first build of the index does not block the page.
 let run: Run | null = null, busy = false, error = '', timer: ReturnType<typeof setTimeout> | undefined;
 function compute(): Run | null {
  const o = {k};
  switch (current) {
   case 'naive': return naive(query, o);
   case 'hybrid': return hybrid(query, o);
   case 'chunking': return chunking(query, {k, strategy, pctl});
   case 'contextual': return contextual(query, o);
   case 'rerank': return rerank(query, {k, n: n1});
   case 'fusion': return fusion(query, {k, rewrites: lines(rewrites)});
   case 'hyde': return hyde(query, {k, draft});
   case 'late': return late(query, o);
   case 'multihop': return multihop(query, {k, subqs: lines(subqs)});
   case 'graphrag': return graphrag(query, {k, mode});
   case 'raptor': return raptor(query, o);
   case 'sql': return sql(models, preset.question, preset);
   case 'compression': return compression(query, {k, threshold, order});
   case 'multimodal': return multimodal(models);
   case 'selfrag': return selfrag(query, {k, retrieveAt, relevantAt});
   case 'crag': return crag(query, {k, upper, lower});
   case 'adaptive': return adaptive(query, o);
   case 'agentic': return agentic(models, query, {k, budget});
   case 'memory': return memory(query, {k, history: turns});
   default: return null;
  }
 }
 function schedule(..._deps: unknown[]) {
  if (current === 'rl' || current === SCORES) return;
  clearTimeout(timer); busy = true;
  timer = setTimeout(() => { try { run = compute(); error = ''; } catch (e) { error = e instanceof Error ? e.message : String(e); run = null; } busy = false; }, 30);
 }
 $: schedule(current, query, draft, subqs, rewrites, k, strategy, pctl, n1, mode, sqlId, threshold, order, retrieveAt, relevantAt, upper, lower, budget, turns);
 $: if (current === 'rl' || current === SCORES) { run = null; busy = false; }
 onDestroy(() => clearTimeout(timer));

 function remember() { if (run?.turn) turns = [...turns, run.turn].slice(-6); }

 // Reinforcement learning and the test set run on request, since they search hundreds of times.
 let rlRun: Run | null = null, bench: BenchRow[] | null = null, working = false;
 function later(f: () => void) { working = true; setTimeout(() => { try { f(); } finally { working = false; } }, 30); }
 const trainRl = () => later(() => { rlRun = rl({epochs, lr, seed}); });
 const runBench = () => later(() => { bench = benchmark(); });
 $: sampleItems = current === SCORES ? knownItems().slice(0, 5) : [];

 $: approaches = tech ? tech.approaches.map(id => rag.approaches.find(a => a.id === id)).filter(a => a !== undefined) : [];
 $: sources = (() => { const seen = new Set<string>(); return approaches.flatMap(a => [a.source, a.docs, ...(a.more ?? [])]).filter((s): s is NonNullable<typeof s> => !!s && !seen.has(s.url) && !!seen.add(s.url)); })();
 const usesQuery = (id: string) => !['sql', 'multimodal', 'rl'].includes(id);
 let showPrompt = false;
 $: corpusSize = run ? (() => { const L = lab(); return {docs: L.docs.length, passages: L.passages.length, dims: L.space.k, words: L.space.words.length}; })() : null;
</script>

<p class="note flush tech-intro">{rag.techniques.intro}</p>
<div class="spec-layout tech-layout">
 <nav class="spec-nav" aria-label={t('rag.tab_techniques')}>
  <button class:on={current === SCORES} aria-current={current === SCORES ? 'true' : undefined} on:click={() => choose(SCORES)}>{t('ragLab.scoresNav')}<small>{t('ragLab.scoresNavNote')}</small></button>
  <h3>{t('ragLab.techniquesHead', {n: items.length})}</h3>
  {#each items as it, i (it.id)}<button class:on={it.id === current} aria-current={it.id === current ? 'true' : undefined} on:click={() => choose(it.id)}><span class="tech-name"><b class="tech-n">{i + 1}</b>{it.name}</span></button>{/each}
 </nav>

 <article class="spec-body">
  {#if current === SCORES}
   <header class="spec-head"><p class="overline">{t('ragLab.scoresOverline')}</p><h2>{t('ragLab.scoresTitle')}</h2><p>{t('ragLab.scoresIntro', {n: knownItems().length})}</p></header>
   <section class="card"><h2>{t('ragLab.testSetTitle')}</h2><p class="note flush">{t('ragLab.testSetText')}</p>
    <div class="table-wrap auto"><table class="trace-table"><thead><tr><th>{t('ragLab.colQuestion')}</th><th>{t('ragLab.colTarget')}</th></tr></thead><tbody>{#each sampleItems as s}<tr><td>{s.q}</td><td>{s.title}</td></tr>{/each}</tbody></table></div>
    <p class="note">{t('ragLab.testSetBias')}</p>
   </section>
   <section class="card"><h2>{t('ragLab.resultsTitle')}</h2>
    <button class="btn primary" disabled={working} on:click={runBench}>{working ? t('ragLab.running') : bench ? t('ragLab.runAgain') : t('ragLab.runScores')}</button>
    {#if bench}
     <div class="table-wrap auto"><table class="trace-table"><thead><tr><th>{t('ragLab.colTechnique')}</th><th>{t('ragLab.colHit5')}</th><th>{t('ragLab.colMrr')}</th><th>{t('ragLab.colMs')}</th></tr></thead>
      <tbody>{#each [...bench].sort((a, b) => b.mrr - a.mrr) as b (b.id)}<tr><td>{b.label}</td><td>{(b.hit5 * 100).toFixed(1)}%</td><td>{b.mrr.toFixed(3)}</td><td>{b.ms.toFixed(1)}</td></tr>{/each}</tbody></table></div>
     <h3>{t('ragLab.colMrr')}</h3><BarList rows={[...bench].sort((a, b) => b.mrr - a.mrr).map(b => ({label: b.label, value: b.mrr}))} format={v => v.toFixed(3)}/>
     <p class="note">{t('ragLab.resultsNote')}</p>
    {/if}
   </section>
  {:else if tech}
   <header class="spec-head"><p class="overline">{t('ragLab.techniqueOf', {n, total: items.length})}</p><h2>{tech.name}</h2><p>{tech.plain}</p>
    <p class="related-links">{#each approaches as a (a.id)}<a class="btn small" href={`#/rag/approaches/${a.id}`}>{a.name}</a>{/each}</p></header>
   <div class="card-grid">
    <section class="card"><h2>{t('ragLab.inPaper')}</h2><ol class="plain">{#each tech.paper as x}<li>{x}</li>{/each}</ol></section>
    <section class="card"><h2>{t('ragLab.inPage')}</h2><p>{tech.here}</p><p class="callout warn"><b>{t('ragLab.differs')}</b> {tech.differs}</p></section>
   </div>

   <section class="card run-card">
    <h2>{t(current === 'rl' ? 'ragLab.trainIt' : 'ragLab.runIt')}</h2>
    {#if usesQuery(current)}
     <div class="preset-row"><span>{t('rag.tryQuery')}</span>{#each presets as p, i}<button class="btn small" class:primary={p.q === query} on:click={() => usePreset(i)}>{p.q}</button>{/each}</div>
     {#if current === 'memory'}<div class="preset-row"><span>{t('ragLab.followUps')}</span>{#each rag.memoryFollowUps as f}<button class="btn small" class:primary={f === query} on:click={() => { query = f; typed(); }}>{f}</button>{/each}</div>{/if}
     <label class="field query-field"><span>{t('rag.query')}</span><input type="search" bind:value={query} on:input={typed}/></label>
    {/if}
    <div class="net-controls">
     {#if usesQuery(current)}<label class="net-slider"><span>{t('rag.topK')}<b>{k}</b></span><input type="range" min="1" max="10" bind:value={k}/></label>{/if}
     {#if current === 'chunking'}
      <label class="field"><span>{t('ragLab.strategy')}</span><select bind:value={strategy}><option value="fixed">{t('ragLab.strat_fixed')}</option><option value="semantic">{t('ragLab.strat_semantic', {p: pctl})}</option><option value="hierarchical">{t('ragLab.strat_hierarchical')}</option></select></label>
      <label class="net-slider"><span>{t('ragLab.percentile')}<b>{pctl}</b></span><input type="range" min="50" max="99" bind:value={pctl}/></label>
     {:else if current === 'rerank'}<label class="net-slider"><span>{t('ragLab.firstStage')}<b>{n1}</b></span><input type="range" min="10" max="50" step="5" bind:value={n1}/></label>
     {:else if current === 'graphrag'}<label class="field"><span>{t('ragLab.searchMode')}</span><select bind:value={mode}><option value="local">{t('ragLab.mode_local')}</option><option value="global">{t('ragLab.mode_global')}</option></select></label>
     {:else if current === 'sql'}<label class="field wide-field"><span>{t('ragLab.catalogQuestion')}</span><select bind:value={sqlId}>{#each rag.sqlPresets as s (s.id)}<option value={s.id}>{s.question}</option>{/each}</select></label>
     {:else if current === 'compression'}
      <label class="net-slider"><span>{t('ragLab.keepAbove')}<b>{Math.round(threshold * 100)}%</b></span><input type="range" min="0" max="1" step=".05" bind:value={threshold}/></label>
      <label class="field"><span>{t('ragLab.orderLabel')}</span><select bind:value={order}><option value="relevance">{t('ragLab.order_relevance')}</option><option value="edges">{t('ragLab.order_edges')}</option><option value="source">{t('ragLab.order_source')}</option></select></label>
     {:else if current === 'selfrag'}
      <label class="net-slider"><span>{t('ragLab.retrieveAt')}<b>{retrieveAt.toFixed(2)}</b></span><input type="range" min="0" max=".8" step=".05" bind:value={retrieveAt}/></label>
      <label class="net-slider"><span>{t('ragLab.relevantAt')}<b>{relevantAt.toFixed(2)}</b></span><input type="range" min="0" max=".9" step=".05" bind:value={relevantAt}/></label>
     {:else if current === 'crag'}
      <label class="net-slider"><span>{t('ragLab.upper')}<b>{upper.toFixed(2)}</b></span><input type="range" min=".1" max=".9" step=".05" bind:value={upper}/></label>
      <label class="net-slider"><span>{t('ragLab.lower')}<b>{lower.toFixed(2)}</b></span><input type="range" min="0" max={upper} step=".05" bind:value={lower}/></label>
     {:else if current === 'agentic'}<label class="net-slider"><span>{t('ragLab.budget')}<b>{budget}</b></span><input type="range" min="2" max="8" bind:value={budget}/></label>
     {:else if current === 'rl'}
      <label class="net-slider"><span>{t('ragLab.epochs')}<b>{epochs}</b></span><input type="range" min="5" max="100" step="5" bind:value={epochs}/></label>
      <label class="net-slider"><span>{t('ragLab.learningRate')}<b>{lr.toFixed(2)}</b></span><input type="range" min=".05" max="2" step=".05" bind:value={lr}/></label>
      <label class="net-slider"><span>{t('ragLab.seed')}<b>{seed}</b></span><input type="range" min="1" max="20" bind:value={seed}/></label>
     {/if}
    </div>
    {#if current === 'hyde'}<label class="field block-field"><span>{t('ragLab.draftLabel')}</span><textarea rows="4" bind:value={draft} placeholder={t('ragLab.draftPlaceholder')}></textarea></label>{#if fromPreset}<p class="note">{t('ragLab.handWritten')}</p>{/if}{/if}
    {#if current === 'multihop'}<label class="field block-field"><span>{t('ragLab.subqsLabel')}</span><textarea rows="3" bind:value={subqs} placeholder={t('ragLab.subqsPlaceholder')}></textarea></label>{#if fromPreset}<p class="note">{t('ragLab.handWritten')}</p>{/if}{/if}
    {#if current === 'fusion'}<label class="field block-field"><span>{t('ragLab.rewritesLabel')}</span><textarea rows="3" bind:value={rewrites} placeholder={t('ragLab.rewritesPlaceholder')}></textarea></label>{#if fromPreset}<p class="note">{t('ragLab.handWritten')}</p>{/if}{/if}
    {#if current === 'sql'}<p class="note">{t('ragLab.sqlHandWritten')}</p>{/if}
    {#if current === 'memory'}<p class="mem-actions"><button class="btn primary small" disabled={!run?.turn} on:click={remember}>{t('ragLab.remember')}</button>{#if turns.length}<button class="btn small" on:click={() => turns = []}>{t('ragLab.forget')}</button>{/if}<span class="note">{t('ragLab.memoryHint')}</span></p>{/if}
    {#if current === 'rl'}<p><button class="btn primary" disabled={working} on:click={trainRl}>{working ? t('ragLab.training') : rlRun ? t('ragLab.trainAgain') : t('ragLab.train')}</button></p>{/if}

    {#if error}<p class="callout warn">{error}</p>{/if}
    {#if current === 'rl'}{#if rlRun}<RagTrace steps={rlRun.steps}/>{/if}
    {:else if run}
     <div class:stale={busy}><RagTrace steps={run.steps} query={query}/></div>
     {#if run.answer}
      <section class="answer-box"><h3>{t('ragLab.answerTitle')}</h3>
       <p>{#each run.answer.sentences as s}{s.text} <sup>[{s.cite}]</sup> {/each}</p>
       <p class="note">{t('ragLab.answerNote')}</p>
      </section>
     {/if}
     {#if run.prompt}<label class="net-toggle"><input type="checkbox" bind:checked={showPrompt}/> {t('ragLab.showPrompt')}</label>{#if showPrompt}<pre class="prompt-preview">{run.prompt}</pre>{/if}{/if}
    {:else if busy}<p class="note">{t('ragLab.building')}</p>{/if}
    {#if corpusSize && usesQuery(current)}<p class="note">{t('ragLab.corpusLine', corpusSize)} {rag.techniques.corpusNote}</p>{/if}
   </section>

   <section class="card"><h2>{t('compare.sources')}</h2><ul class="plain">{#each sources as s}<li><a href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}</a></li>{/each}</ul></section>
  {/if}
 </article>
</div>
