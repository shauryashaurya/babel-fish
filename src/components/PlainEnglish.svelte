<script lang="ts">
 import ExpertLab from './ExpertLab.svelte';
 import KvDemo from './KvDemo.svelte';
 import {t} from '../lib/content';
 import type {PlainItem} from '../lib/learning';
 export let item: PlainItem;
 export let demo: 'kv' | 'experts' | null = null;
</script>
<section class="card plain-card">
 <p class="plain-analogy"><span>{t('plain.imagine')}</span> {item.analogy}</p>
 <div class="fact-grid">
  <div><h3>{t('plain.what')}</h3><p>{item.what}</p></div>
  <div><h3>{t('plain.why')}</h3><p>{item.why}</p></div>
  <div><h3>{t('plain.example')}</h3><p>{item.example}</p></div>
 </div>
 <h3>{t('plain.questions')}</h3>
 <div class="faq">{#each item.faq as f (f.q)}<details open><summary>{f.q}</summary><p>{f.a}</p></details>{/each}</div>
 <p class="note">{t('plain.moreTerms')} <a href="#/architecture/concepts">{t('plain.conceptsLink')}</a></p>
</section>
{#if demo === 'kv'}<KvDemo/>{:else if demo === 'experts'}<ExpertLab/>{/if}
