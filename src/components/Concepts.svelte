<script lang="ts">
 import ExpertLab from './ExpertLab.svelte';
 import KvDemo from './KvDemo.svelte';
 import {t} from '../lib/content';
 import {explainers} from '../lib/learning';
 let query = '', topic: 'terms' | 'kv' | 'experts' = 'terms';
 $: q = query.trim().toLowerCase();
 $: rows = explainers.concepts.filter(c => !q || `${c.term} ${c.plain} ${c.why} ${c.example}`.toLowerCase().includes(q));
</script>
<div class="arch-head"><div><h2 class="arch-title">{t('concepts.title')}</h2><p>{t('concepts.intro')}</p></div></div>
<div class="section-tabs" role="tablist" aria-label={t('concepts.title')}>
 <button role="tab" aria-selected={topic === 'terms'} class:on={topic === 'terms'} on:click={() => topic = 'terms'}>{t('concepts.terms')}</button>
 <button role="tab" aria-selected={topic === 'kv'} class:on={topic === 'kv'} on:click={() => topic = 'kv'}>{t('concepts.kv')}</button>
 <button role="tab" aria-selected={topic === 'experts'} class:on={topic === 'experts'} on:click={() => topic = 'experts'}>{t('concepts.experts')}</button>
</div>
{#if topic === 'terms'}
 <input type="search" placeholder={t('concepts.search')} aria-label={t('concepts.search')} bind:value={query}/>
 <div class="concept-grid">
  {#each rows as c (c.id)}<article class="card concept"><h3>{c.term}</h3><p>{c.plain}</p><p><b>{t('concepts.whyLabel')}</b> {c.why}</p><p class="concept-example"><b>{t('concepts.exampleLabel')}</b> {c.example}</p></article>{:else}<div class="empty">{t('common.noMatches')}</div>{/each}
 </div>
{:else if topic === 'kv'}<KvDemo/>{:else}<ExpertLab/>{/if}
