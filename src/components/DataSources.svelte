<script lang="ts">
 import {catalogInfo} from '../lib/catalog';
 import {list, t} from '../lib/content';
 import {downloadBytes} from '../lib/exports';
 import {commercialLabel} from '../lib/selection';
 import {replaceSelection, resetSelection, selection} from '../lib/state';
 import type {CommercialStatus, Model} from '../lib/types';
 export let models: Model[];
 let message = '', failed = false;
 const statuses: CommercialStatus[] = ['allowed', 'conditional', 'prohibited', 'unverified'];
 $: coverage = [
  [t('data.repo'), models.filter(m => m.official).length],
  [t('data.config'), models.filter(m => m.official?.configUrl).length],
  [t('data.weights'), models.filter(m => m.weightSource === 'official-files').length],
  [t('data.context'), models.filter(m => m.context !== null).length],
  [t('data.cache'), models.filter(m => m.kvKiBPerToken !== null).length],
  [t('data.country'), models.filter(m => m.country).length],
  [t('data.gated'), models.filter(m => m.official?.gated).length],
  [t('data.notes'), models.filter(m => m.flags.length).length],
 ] as [string, number][];
 const saveFile = () => downloadBytes(JSON.stringify($selection, null, 2), 'model-selection.json', 'application/json');
 async function loadFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  if (!file) return;
  try {
   const saved = JSON.parse(await file.text());
   if (!saved || typeof saved !== 'object' || !Array.isArray(saved.candidates)) throw new Error();
   replaceSelection(saved); failed = false; message = t('data.loaded', {file: file.name});
  } catch { failed = true; message = t('data.invalidFile'); }
  input.value = '';
 }
</script>
<header class="page-head"><div><h1>{t('data.title')}</h1><p>{t('data.intro')}</p></div></header>
<div class="card-grid">
 <section class="card"><h2>{t('data.sources')}</h2><dl>
  <div><dt>{t('data.modelList')}</dt><dd><a href={catalogInfo.source} target="_blank" rel="noreferrer">{t('data.gallery')}</a></dd></div>
  <div><dt>{t('data.modelFacts')}</dt><dd>{t('data.modelFactsValue')}</dd></div>
  <div><dt>{t('data.built')}</dt><dd>{catalogInfo.generatedOn}</dd></div>
  <div><dt>{t('data.reviewed')}</dt><dd>{catalogInfo.licensesReviewedOn}</dd></div>
  <div><dt>{t('data.rawData')}</dt><dd><a href="./data/catalog/models.json">models.json</a>, <a href="./data/catalog/license_rules.json">license_rules.json</a>, <a href="./data/content/copy.json">copy.json</a>, <a href="./data/content/architectures.json">architectures.json</a></dd></div>
 </dl></section>
 <section class="card"><h2>{t('data.coverage', {total: models.length})}</h2><dl>{#each coverage as c}<div><dt>{c[0]}</dt><dd>{c[1]}</dd></div>{/each}</dl></section>
 <section class="card"><h2>{t('data.commercial')}</h2><dl>{#each statuses as s}<div><dt>{commercialLabel(s)}</dt><dd>{models.filter(m => m.license.rule.commercial === s).length}</dd></div>{/each}</dl><p class="note">{catalogInfo.licenseBasis}</p></section>
 <section class="card"><h2>{t('data.conflicts')}</h2><ul class="plain">{#each list('data.conflictRules') as x}<li>{x}</li>{/each}</ul></section>
 <section class="card wide"><h2>{t('data.method')}</h2><ol class="plain">{#each list('data.methodSteps') as x}<li>{x}</li>{/each}</ol><p class="note">{t('data.formula')}</p></section>
 <section class="card wide"><h2>{t('data.manage')}</h2>
  <div class="actions"><button class="btn" on:click={saveFile}>{t('data.save')}</button><label class="btn">{t('data.load')}<input class="visually-hidden" type="file" accept=".json,application/json" on:change={loadFile}/></label><button class="btn" on:click={() => { resetSelection(); failed = false; message = t('data.cleared'); }}>{t('data.clear')}</button></div>
  {#if message}<p class={failed ? 'callout warn' : 'callout'}>{message}</p>{/if}<p class="note">{t('data.manageNote')}</p>
 </section>
</div>
