<script lang="ts">
 import {onMount, tick} from 'svelte';
 import Agents from './components/Agents.svelte';
 import Architecture from './components/Architecture.svelte';
 import CatalogRail from './components/CatalogRail.svelte';
 import CatalogTable from './components/CatalogTable.svelte';
 import Compare from './components/Compare.svelte';
 import CostPlanner from './components/CostPlanner.svelte';
 import DataSources from './components/DataSources.svelte';
 import Decision from './components/Decision.svelte';
 import Evaluation from './components/Evaluation.svelte';
 import FilterPanel from './components/FilterPanel.svelte';
 import FineTuning from './components/FineTuning.svelte';
 import Rag from './components/Rag.svelte';
 import SlmFilterPanel from './components/SlmFilterPanel.svelte';
 import SlmRail from './components/SlmRail.svelte';
 import {isSlmId, slmAsModel, slms} from './lib/learning';
 import ModelCard from './components/ModelCard.svelte';
 import Requirements from './components/Requirements.svelte';
 import SmallModels from './components/SmallModels.svelte';
 import {families, mechanisms} from './lib/architecture';
 import {catalogModels, loadData, models} from './lib/catalog';
 import {t} from './lib/content';
 import {visibleModels} from './lib/filters';
 import {catalogView, lastViewedModel, selection} from './lib/state';

 /** Left: exploring models and techniques. Right: the numbered study that turns requirements into a decision. */
 const exploreTabs = ['architecture', 'catalog', 'slm', 'compare', 'cost', 'finetuning', 'rag', 'agents'];
 const studyTabs = ['requirements', 'evaluation', 'decision', 'data'];
 const tabs = [...exploreTabs, ...studyTabs];
 let sideOpen = false, ready = false, loadError = '', view = 'architecture', kind = 'family', itemId = '', subRoute = '', exampleId = '', main: HTMLElement;
 /** Requirements, Evaluation and Decision consider the gallery models plus the small models not already in the gallery. */
 let decisionModels: typeof models = [];
 let currentHash = '#/architecture', modelOrigin = '#/catalog', architectureOrigin: string | null = null, compareOrigin = '#/catalog';

 $: model = ready && view === 'model' ? catalogModels.find(m => m.id === itemId) : undefined;
 $: list = ready && view === 'model' ? visibleModels(catalogModels, $selection, $catalogView) : [];
 $: index = list.findIndex(a => a.model.id === itemId);
 $: title = !ready ? '' : view === 'model' ? model?.name || t('model.overline') : t(`nav.${view}`).replace(/^\d\.\s/, '');

 function hashLabel(hash: string) {
  const [, section, a, b] = hash.split('/');
  if (section === 'model') return catalogModels.find(m => m.id === decodeURIComponent(b ?? a ?? ''))?.name || t('nav.catalog');
  if (section === 'slm' && a) return slms.find(s => s.id === decodeURIComponent(a))?.name || t('nav.slm');
  if (section === 'architecture') return (a === 'mechanism' ? mechanisms : families).find(x => x.id === b)?.name || t('nav.architecture');
  return tabs.includes(section) ? t(`nav.${section}`).replace(/^\d\.\s/, '') : t('nav.catalog');
 }

 const safeDecode = (v: string) => { try { return decodeURIComponent(v); } catch { return ''; } };
 async function sync() {
  const hash = window.location.hash || '#/architecture';
  const [, section, a, b, c] = hash.split('/');
  const previous = currentHash, wasModel = previous.startsWith('#/model/'), wasArchitecture = previous.startsWith('#/architecture');
  if (section === 'model' && a && isSlmId(safeDecode(a)) && !models.some(m => m.id === safeDecode(a))) { window.location.replace(`#/slm/${a}`); return; }
  if (section === 'model' && a) {
   view = 'model';
   try { itemId = decodeURIComponent(a); } catch { itemId = ''; }
   if (!wasModel && previous !== hash) modelOrigin = previous;
   lastViewedModel.set(itemId);
  } else if (section === 'architecture') {
   view = 'architecture'; kind = a === 'mechanism' ? 'mechanism' : a === 'concepts' ? 'concepts' : 'family'; itemId = b || ''; exampleId = c ? safeDecode(c) : '';
   if (wasModel || previous.startsWith('#/compare')) architectureOrigin = previous;
   else if (!wasArchitecture) architectureOrigin = null;
  } else if (section === 'slm') {
   view = 'slm';
   try { itemId = a ? decodeURIComponent(a) : ''; } catch { itemId = ''; }
  } else if (section === 'finetuning' || section === 'rag' || section === 'agents' || section === 'compare' || section === 'cost') {
   if (section === 'compare' && !previous.startsWith('#/compare') && previous !== hash) compareOrigin = previous;
   view = section; subRoute = a || ''; itemId = b ? safeDecode(b) : '';
  } else {
   view = tabs.includes(section) ? section : 'architecture'; itemId = '';
  }
  currentHash = hash;
  sideOpen = false;
  await tick();
  main?.scrollTo({top: 0});
  // On narrow screens the tab strips scroll sideways; keep the current tab in view.
  for (const el of document.querySelectorAll<HTMLElement>('.topbar nav a.active, .section-tabs .on')) {
   const strip = el.closest<HTMLElement>('nav, .section-tabs');
   if (!strip || strip.scrollWidth <= strip.clientWidth) continue;
   const a = el.getBoundingClientRect(), s = strip.getBoundingClientRect();
   strip.scrollLeft += a.left - s.left - (s.width - a.width) / 2;
  }
 }

 onMount(() => {
  loadData().then(() => { decisionModels = [...models, ...slms.filter(s => !s.galleryModelId).map(slmAsModel)]; ready = true; sync(); }).catch(e => { loadError = e instanceof Error ? e.message : String(e); });
  window.addEventListener('hashchange', sync);
  return () => window.removeEventListener('hashchange', sync);
 });
</script>
<svelte:head>{#if ready}<title>{title} · {t('app.title')}</title>{/if}</svelte:head>
{#if loadError}
 <div class="load-state" role="alert">{ready ? t('app.loadError') : ''} {loadError}</div>
{:else if !ready}
 <div class="load-state" aria-busy="true"></div>
{:else}
 <div class="shell">
  <header class="topbar">
   <a class="brand" href="#/architecture">{t('app.title')}</a>
   <nav aria-label={t('nav.main')}>
    {#each [{id: 'explore', items: exploreTabs}, {id: 'study', items: studyTabs}] as group (group.id)}
     <div class={`nav-group ${group.id}`} role="group" aria-label={t(`nav.${group.id}`)}>
      {#if group.id === 'study'}<span class="nav-group-label" aria-hidden="true">{t('nav.study')}</span>{/if}
      {#each group.items as tab}<a class:active={view === tab || (view === 'model' && tab === 'catalog')} aria-current={view === tab ? 'page' : undefined} href={`#/${tab}`}>{t(`nav.${tab}`)}</a>{/each}
     </div>
    {/each}
   </nav>
  </header>
  <div class="body">
   <div class="side" class:open={sideOpen}>
   <button class="side-toggle" aria-expanded={sideOpen} on:click={() => sideOpen = !sideOpen}>{view === 'catalog' || (view === 'slm' && !itemId) ? t('app.showFilters') : t('app.showModels')}<small>{view === 'slm' ? t('app.smallCount', {n: slms.length}) : t('app.modelCount', {n: catalogModels.length})}</small></button>
   {#if view === 'catalog'}<FilterPanel models={catalogModels} selection={$selection}/>{:else if view === 'slm' && !itemId}<SlmFilterPanel/>{:else if view === 'slm'}<SlmRail activeId={itemId}/>{:else}<CatalogRail models={catalogModels} selection={$selection} activeId={view === 'model' ? itemId : ''}/>{/if}
   </div>
   <main bind:this={main}><div class="content">
    {#if view === 'model'}
     {#if model}
      <ModelCard {model} selection={$selection} backHref={modelOrigin} backLabel={hashLabel(modelOrigin)} prevId={index > 0 ? list[index - 1].model.id : null} nextId={index >= 0 && index < list.length - 1 ? list[index + 1].model.id : null} position={index + 1} total={list.length}/>
     {:else}<div class="empty">{t('model.notFound')} <a href="#/catalog">{t('model.returnCatalog')}</a></div>{/if}
    {:else if view === 'architecture'}<Architecture {models} {kind} id={itemId} exampleRoute={exampleId} backHref={architectureOrigin} backLabel={architectureOrigin ? hashLabel(architectureOrigin) : ''}/>
    {:else if view === 'slm'}<SmallModels id={itemId}/>
    {:else if view === 'compare'}<Compare {models} backHref={compareOrigin} backLabel={hashLabel(compareOrigin)} route={subRoute} routeIds={subRoute === 'explained' ? '' : itemId} routeSpec={subRoute === 'explained' ? itemId : ''}/>
    {:else if view === 'cost'}<CostPlanner {models} route={subRoute}/>
    {:else if view === 'finetuning'}<FineTuning route={subRoute} routeModel={itemId}/>
    {:else if view === 'rag'}<Rag {models} route={subRoute} item={itemId}/>
    {:else if view === 'agents'}<Agents {models} route={subRoute} item={itemId}/>
    {:else if view === 'requirements'}<Requirements models={decisionModels} selection={$selection}/>
    {:else if view === 'evaluation'}<Evaluation models={decisionModels} selection={$selection}/>
    {:else if view === 'decision'}<Decision models={decisionModels} selection={$selection}/>
    {:else if view === 'data'}<DataSources {models}/>
    {:else}<CatalogTable models={catalogModels} selection={$selection}/>{/if}
   </div></main>
  </div>
  <footer class="footer">{t('app.footer')}</footer>
 </div>
{/if}
