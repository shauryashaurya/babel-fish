<script lang="ts">
 import {t} from '../lib/content';
 import {buildCorpus, chunkCorpus, rag, search, terms, type ChunkMode, type Ranked} from '../lib/rag';
 const docs = buildCorpus();
 const presets = [t('rag.q1'), t('rag.q2'), t('rag.q3'), t('rag.q4'), t('rag.q5')];
 let query = presets[0], mode: ChunkMode = 'words', size = 60, overlap = 10, k = 5, method: 'bm25' | 'trigram' | 'hybrid' = 'hybrid';
 $: if (overlap >= size) overlap = Math.max(0, size - 10);
 $: chunks = chunkCorpus(docs, mode, size, overlap);
 $: all = {bm25: search(chunks, query, 'bm25'), trigram: search(chunks, query, 'trigram'), hybrid: search(chunks, query, 'hybrid')};
 $: results = all[method].slice(0, k);
 $: qTerms = new Set(terms(query));
 $: agreement = (() => { const ids = (r: Ranked[]) => new Set(r.slice(0, k).map(x => x.chunk.id)); const a = ids(all.bm25), b = ids(all.trigram); let n = 0; a.forEach(x => { if (b.has(x)) n++; }); return n; })();
 $: avgWords = chunks.length ? Math.round(chunks.reduce((s, c) => s + c.words, 0) / chunks.length) : 0;
 $: promptWords = results.reduce((s, r) => s + r.chunk.words, 0);
 const mark = (text: string, set: Set<string>) => text.split(/(\s+)/).map(w => ({w, hit: set.has(w.toLowerCase().replace(/[^a-z0-9]/g, ''))}));
 let showPrompt = false;
</script>
<section class="card">
 <h2>{t('rag.labTitle')}</h2>
 <p class="note flush">{t('rag.labIntro', {docs: docs.length})}</p>
 <div class="preset-row"><span>{t('rag.tryQuery')}</span>{#each presets as p}<button class="btn small" class:primary={p === query} on:click={() => query = p}>{p}</button>{/each}</div>
 <label class="field query-field"><span>{t('rag.query')}</span><input type="search" bind:value={query}/></label>
 <div class="net-controls">
  <label class="field"><span>{t('rag.retriever')}</span><select bind:value={method}><option value="bm25">{t('rag.m_bm25')}</option><option value="trigram">{t('rag.m_trigram')}</option><option value="hybrid">{t('rag.m_hybrid')}</option></select></label>
  <label class="field"><span>{t('rag.chunkMode')}</span><select bind:value={mode}><option value="words">{t('rag.c_words')}</option><option value="sentences">{t('rag.c_sentences')}</option><option value="document">{t('rag.c_document')}</option></select></label>
  {#if mode !== 'document'}
   <label class="net-slider"><span>{t('rag.chunkSize')}<b>{size}</b></span><input type="range" min="20" max="200" step="10" bind:value={size}/></label>
   <label class="net-slider"><span>{t('rag.overlap')}<b>{overlap}</b></span><input type="range" min="0" max={Math.max(0, size - 10)} step="5" bind:value={overlap}/></label>
  {/if}
  <label class="net-slider"><span>{t('rag.topK')}<b>{k}</b></span><input type="range" min="1" max="10" bind:value={k}/></label>
 </div>
 <div class="size-tiles">
  <div><span>{t('rag.chunks')}</span><strong>{chunks.length}</strong></div>
  <div><span>{t('rag.avgWords')}</span><strong>{avgWords}</strong></div>
  <div><span>{t('rag.promptWords')}</span><strong>{promptWords}</strong></div>
  <div><span>{t('rag.agreement')}</span><strong>{agreement} / {k}</strong></div>
 </div>
 {#if !results.length}<p class="empty">{t('rag.noHits')}</p>{/if}
 <ol class="hits">
  {#each results as r, i (r.chunk.id)}
   <li>
    <div class="hit-head"><b>[{i + 1}]</b> <a href={r.chunk.doc.href}>{r.chunk.doc.title}</a> <small>{r.chunk.doc.section} · {t('rag.chunkN', {n: r.chunk.index + 1})}</small>
     <span class="hit-ranks">{t('rag.rankIn', {name: 'BM25', rank: r.ranks.bm25 ?? '—'})} · {t('rag.rankIn', {name: t('rag.trigramShort'), rank: r.ranks.trigram ?? '—'})} · {t('rag.score')} {r.score.toFixed(method === 'hybrid' ? 4 : 3)}</span></div>
    <p>{#each mark(r.chunk.text, qTerms) as p}{#if p.hit}<mark>{p.w}</mark>{:else}{p.w}{/if}{/each}</p>
   </li>
  {/each}
 </ol>
 <label class="net-toggle"><input type="checkbox" bind:checked={showPrompt}/> {t('rag.showPrompt')}</label>
 {#if showPrompt}<pre class="prompt-preview">{t('rag.promptHead')}

{#each results as r, i}[{i + 1}] {r.chunk.doc.title}: {r.chunk.text}

{/each}{t('rag.promptQuestion')} {query}</pre>{/if}
 <p class="callout">{t(agreement === k ? 'rag.readAgree' : agreement === 0 ? 'rag.readDisagree' : 'rag.readPartial')}</p>
 <p class="note">{rag.labNote}</p>
</section>
