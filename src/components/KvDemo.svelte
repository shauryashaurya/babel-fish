<script lang="ts">
 import {t} from '../lib/content';
 import {explainers} from '../lib/learning';
 const demo = explainers.kvDemo;
 let index = demo.words.findIndex(w => w.text === 'it');
 const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);
 $: word = demo.words[index];
 $: rows = (() => {
  const earlier = demo.words.slice(0, index), scores = earlier.map(w => dot(word.query, w.key) * 4), max = Math.max(...scores, 0);
  const raw = scores.map(s => Math.exp(s - max)), total = raw.reduce((a, b) => a + b, 0) || 1;
  return earlier.map((w, i) => ({w, share: raw[i] / total}));
 })();
 $: best = rows.reduce<(typeof rows)[number] | null>((top, r) => !top || r.share > top.share ? r : top, null);
 const labels = (values: number[]) => demo.features.filter((_, i) => values[i] >= .5);
</script>
<section class="card">
 <h2>{t('kv.title')}</h2>
 <div class="kv-legend">
  <div><b>{t('kv.queryName')}</b><span>{t('kv.queryText')}</span></div>
  <div><b>{t('kv.keyName')}</b><span>{t('kv.keyText')}</span></div>
  <div><b>{t('kv.valueName')}</b><span>{t('kv.valueText')}</span></div>
 </div>
 <p class="kv-intro">{demo.intro}</p>
 <div class="kv-words" role="group" aria-label={t('kv.pickWord')}>
  {#each demo.words as w, i}<button class:on={i === index} class:seen={i < index} aria-pressed={i === index} on:click={() => index = i}>{w.text}</button>{/each}
 </div>
 <p class="kv-query"><b>{t('kv.queryFor', {word: word.text})}</b> {labels(word.query).join(', ') || t('kv.weakQuery')}</p>
 {#if rows.length}
  <div class="table-wrap auto"><table class="compact kv-table"><thead><tr><th>{t('kv.word')}</th><th>{t('kv.key')}</th><th>{t('kv.match')}</th><th>{t('kv.value')}</th></tr></thead><tbody>
   {#each rows as r}<tr class:winner={r === best}><td>{r.w.text}</td><td class="reason">{labels(r.w.key).join(', ') || '—'}</td><td class="kv-bar"><div class="bar"><i style={`width:${r.share * 100}%`}></i></div><span>{(r.share * 100).toFixed(0)}%</span></td><td class="reason">{r.w.value}</td></tr>{/each}
  </tbody></table></div>
  {#if best}<p class="callout">{t('kv.result', {word: word.text, top: best.w.text, share: (best.share * 100).toFixed(0), value: best.w.value})}</p>{/if}
 {:else}<p class="note">{t('kv.first')}</p>{/if}
 <p class="callout warn">{t('kv.costNote')}</p>
 <p class="note">{demo.note}</p>
</section>
