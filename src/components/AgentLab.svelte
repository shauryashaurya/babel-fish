<script lang="ts">
 import {onDestroy} from 'svelte';
 import RagTrace from './RagTrace.svelte';
 import {agents, CATEGORY_TONE as TONE, type BriefSpec} from '../lib/agents';
 import {approval, briefLine, chaining, compiler, debate, evaluatorOptimizer, gib, guardrails, lats, planExecute, ranked, react, reflection, reflexion, rewoo, routing, sectioning, solve, supervisor, tokens, toolCalling, tot, useModels, voting, type AgentRun} from '../lib/agentLab';
 import {t} from '../lib/content';
 import {safeUrl} from '../lib/selection';
 import type {Model} from '../lib/types';
 export let models: Model[];
 export let item = '';

 const items = agents.patterns;
 let current = items.some(x => x.id === item) ? item : items[0].id;
 $: if (item && items.some(x => x.id === item)) current = item;
 $: pattern = items.find(x => x.id === current)!;
 $: n = items.findIndex(x => x.id === current) + 1;
 function choose(id: string) { current = id; history.replaceState(null, '', `#/agents/lab/${id}`); document.querySelector('main')?.scrollTo({top: 0}); }
 const groups = Object.keys(agents.categories).map(c => ({id: c, list: items.filter(p => p.category === c)})).filter(g => g.list.length);

 // The brief: a preset that can be edited field by field.
 let briefId = agents.briefs[0].id, brief: BriefSpec = {...agents.briefs[0].brief};
 function usePreset(id: string) { briefId = id; const p = agents.briefs.find(b => b.id === id)!; brief = {...p.brief}; text = p.text; }
 const CONTEXTS = [8192, 32768, 65536, 131072, 262144, 524288, 1048576];
 const BUDGETS = [22, 44, 80, 96, 160, 192, 320, 384, 640, 768, 1128, 1432];
 $: warmup = agents.briefs.find(b => b.id !== briefId)?.brief ?? null;

 // Controls
 let budget = 12, replan = true, rounds = 4, trials = 5, carry = false, breadth = 5;
 let beam = 3, width = 10, lambda = .5, allow8 = true, allow4 = false, iterations = 40, c = 1, seed = 1;
 let calls = 4, llmMs = 1500, threshold = .25, maxWords = 120, tolerance = .5;
 let parallelMode: 'sectioning' | 'voting' = 'sectioning', sectionId = '', voters = 5, error = .2, correlation = .3;
 let request = agents.toolRequests[0], routeRequest = agents.routingRequests[0], text = agents.briefs[0].text;
 let decisions: Record<string, 'approve' | 'reject'> = {}, autoApprove = false;
 let guardInput = true, guardTools = true, guardOutput = true;
 $: showBrief = !['tools', 'routing', 'chaining'].includes(current) && !(current === 'parallel' && parallelMode === 'voting');
 $: precisions = ['published', ...(allow8 ? ['bit8'] : []), ...(allow4 ? ['bit4'] : [])] as ('published' | 'bit8' | 'bit4')[];
 $: sectionPool = (useModels(models), ranked(solve(brief).ok).slice(0, 12));
 $: if (sectionPool.length && !sectionPool.some(m => m.id === sectionId)) sectionId = sectionPool[0].id;

 let run: AgentRun | null = null, busy = false, error_ = '', timer: ReturnType<typeof setTimeout> | undefined;
 function compute(): AgentRun | null {
  const b = brief;
  switch (current) {
   case 'react': return react(models, b, {budget});
   case 'plan': return planExecute(models, b, {replan});
   case 'reflection': return reflection(models, b, {rounds});
   case 'reflexion': return reflexion(models, b, {trials, warmup: carry ? warmup : null});
   case 'rewoo': return rewoo(models, b, {breadth});
   case 'tot': return tot(models, b, {beam, width, lambda, precisions});
   case 'lats': return lats(models, b, {iterations, width, lambda, precisions, c, seed});
   case 'compiler': return compiler(models, b, {n: calls, llmMs});
   case 'tools': return toolCalling(models, request);
   case 'chaining': return chaining(models, text);
   case 'routing': return routing(models, routeRequest, {threshold});
   case 'parallel': return parallelMode === 'voting' ? voting(models, {voters, error, correlation, seed}) : sectioning(models, b, sectionId, llmMs);
   case 'evaluator': return evaluatorOptimizer(models, b, {rounds, maxWords});
   case 'supervisor': return supervisor(models, b);
   case 'multiagent': return debate(models, b, {rounds, tolerance});
   case 'approval': return approval(models, b, {decisions, autoApprove});
   case 'guardrails': return guardrails(models, b, {input: guardInput, tools: guardTools, output: guardOutput});
   default: return null;
  }
 }
 function schedule(..._deps: unknown[]) {
  clearTimeout(timer); busy = true;
  timer = setTimeout(() => { try { run = compute(); error_ = ''; } catch (e) { error_ = e instanceof Error ? e.message : String(e); run = null; } busy = false; }, 30);
 }
 $: schedule(current, brief, budget, replan, rounds, trials, carry, breadth, beam, width, lambda, precisions, iterations, c, seed, calls, llmMs, threshold, maxWords, tolerance, parallelMode, sectionId, voters, error, correlation, request, routeRequest, text, decisions, autoApprove, guardInput, guardTools, guardOutput);
 $: if (current) { decisions = {}; }
 onDestroy(() => clearTimeout(timer));
 const decide = (id: string, d: 'approve' | 'reject') => { decisions = {...decisions, [id]: d}; };
 $: controls = agents.controls.filter(x => x.patterns.includes(current));
</script>

<p class="note flush tech-intro">{agents.labIntro}</p>
<div class="spec-layout tech-layout">
 <nav class="spec-nav" aria-label={t('agents.tab_lab')}>
  {#each groups as g (g.id)}
   <h3>{agents.categories[g.id]}</h3>
   {#each g.list as it (it.id)}<button class:on={it.id === current} aria-current={it.id === current ? 'true' : undefined} on:click={() => choose(it.id)}><span class="tech-name"><b class="tech-n agent-n" style={`background: var(--s${TONE[it.category]})`}>{items.indexOf(it) + 1}</b>{it.name}</span><small>{it.mechanism}</small></button>{/each}
  {/each}
 </nav>

 <article class="spec-body">
  <header class="spec-head"><p class="overline">{t('agents.patternOf', {n, total: items.length})} · {agents.categories[pattern.category]}</p><h2>{pattern.name}</h2><p><b>{pattern.mechanism}.</b> {pattern.what}</p>
   <p class="related-links"><a class="btn small" href={`#/agents/patterns/${pattern.id}`}>{t('agents.patternCard')}</a></p></header>
  <div class="card-grid">
   <section class="card"><h2>{t('ragLab.inPaper')}</h2><ol class="plain">{#each pattern.how as x}<li>{x}</li>{/each}</ol></section>
   <section class="card"><h2>{t('ragLab.inPage')}</h2><p>{pattern.here}</p><p class="callout warn"><b>{t('ragLab.differs')}</b> {pattern.differs}</p></section>
  </div>

  <section class="card run-card">
   <h2>{t('ragLab.runIt')}</h2>
   {#if showBrief}
    <div class="preset-row"><span>{t('agentLab.brief')}</span>{#each agents.briefs as b (b.id)}<button class="btn small" class:primary={b.id === briefId} on:click={() => usePreset(b.id)}>{b.name}</button>{/each}</div>
    <div class="net-controls brief-fields">
     <label class="net-toggle"><input type="checkbox" bind:checked={brief.commercial}/> {t('agentLab.needCommercial')}</label>
     <label class="field"><span>{t('agentLab.f_minContext')}</span><select bind:value={brief.minContext}>{#each CONTEXTS as x}<option value={x}>{tokens(x)}</option>{/each}</select></label>
     <label class="field"><span>{t('agentLab.f_tokens')}</span><select bind:value={brief.contextTokens}>{#each CONTEXTS as x}<option value={x}>{tokens(x)}</option>{/each}</select></label>
     <label class="net-slider"><span>{t('agentLab.f_sessions')}<b>{brief.sessions}</b></span><input type="range" min="1" max="32" bind:value={brief.sessions}/></label>
     <label class="field"><span>{t('agentLab.f_budget')}</span><select bind:value={brief.budgetGiB}>{#each BUDGETS as x}<option value={x}>{gib(x)}</option>{/each}</select></label>
     <label class="net-toggle"><input type="checkbox" bind:checked={brief.vision}/> {t('agentLab.needVision')}</label>
    </div>
    <p class="note">{briefLine(brief)}</p>
   {/if}
   {#if current === 'tools'}
    <div class="preset-row"><span>{t('agentLab.tryRequest')}</span>{#each agents.toolRequests as r}<button class="btn small" class:primary={r === request} on:click={() => request = r}>{r}</button>{/each}</div>
    <label class="field query-field"><span>{t('agentLab.request')}</span><input type="search" bind:value={request}/></label>
   {:else if current === 'routing'}
    <div class="preset-row"><span>{t('agentLab.tryRequest')}</span>{#each agents.routingRequests as r}<button class="btn small" class:primary={r === routeRequest} on:click={() => routeRequest = r}>{r}</button>{/each}</div>
    <label class="field query-field"><span>{t('agentLab.request')}</span><input type="search" bind:value={routeRequest}/></label>
   {:else if current === 'chaining'}
    <div class="preset-row"><span>{t('agentLab.brief')}</span>{#each agents.briefs as b (b.id)}<button class="btn small" class:primary={b.text === text} on:click={() => usePreset(b.id)}>{b.name}</button>{/each}</div>
    <label class="field block-field"><span>{t('agentLab.briefTextLabel')}</span><textarea rows="3" bind:value={text}></textarea></label>
   {/if}
   <div class="net-controls">
    {#if current === 'react'}<label class="net-slider"><span>{t('agentLab.c_budget')}<b>{budget}</b></span><input type="range" min="2" max="40" bind:value={budget}/></label>
    {:else if current === 'plan'}<label class="net-toggle"><input type="checkbox" bind:checked={replan}/> {t('agentLab.c_replan')}</label>
    {:else if current === 'reflection' || current === 'evaluator' || current === 'multiagent'}<label class="net-slider"><span>{t('agentLab.c_rounds')}<b>{rounds}</b></span><input type="range" min="1" max="8" bind:value={rounds}/></label>
     {#if current === 'evaluator'}<label class="net-slider"><span>{t('agentLab.c_words')}<b>{maxWords}</b></span><input type="range" min="40" max="250" step="10" bind:value={maxWords}/></label>{/if}
     {#if current === 'multiagent'}<label class="net-slider"><span>{t('agentLab.c_tolerance')}<b>{Math.round(tolerance * 100)}%</b></span><input type="range" min="0" max="1" step=".05" bind:value={tolerance}/></label>{/if}
    {:else if current === 'reflexion'}<label class="net-slider"><span>{t('agentLab.c_trials')}<b>{trials}</b></span><input type="range" min="1" max="8" bind:value={trials}/></label><label class="net-toggle"><input type="checkbox" bind:checked={carry}/> {t('agentLab.c_carry')}</label>
    {:else if current === 'rewoo'}<label class="net-slider"><span>{t('agentLab.c_breadth')}<b>{breadth}</b></span><input type="range" min="1" max="15" bind:value={breadth}/></label>
    {:else if current === 'tot' || current === 'lats'}
     {#if current === 'tot'}<label class="net-slider"><span>{t('agentLab.c_beam')}<b>{beam}</b></span><input type="range" min="1" max="6" bind:value={beam}/></label>
     {:else}<label class="net-slider"><span>{t('agentLab.c_iterations')}<b>{iterations}</b></span><input type="range" min="5" max="120" step="5" bind:value={iterations}/></label>
      <label class="net-slider"><span>{t('agentLab.c_explore')}<b>{c.toFixed(1)}</b></span><input type="range" min="0" max="2" step=".1" bind:value={c}/></label>
      <label class="net-slider"><span>{t('ragLab.seed')}<b>{seed}</b></span><input type="range" min="1" max="20" bind:value={seed}/></label>{/if}
     <label class="net-slider"><span>{t('agentLab.c_width')}<b>{width}</b></span><input type="range" min="3" max="20" bind:value={width}/></label>
     <label class="net-slider"><span>{t('agentLab.c_lambda')}<b>{lambda.toFixed(2)}</b></span><input type="range" min="0" max="1" step=".05" bind:value={lambda}/></label>
     <label class="net-toggle"><input type="checkbox" bind:checked={allow8}/> {t('agentLab.prec_bit8')}</label><label class="net-toggle"><input type="checkbox" bind:checked={allow4}/> {t('agentLab.prec_bit4')}</label>
    {:else if current === 'compiler'}<label class="net-slider"><span>{t('agentLab.c_candidates')}<b>{calls}</b></span><input type="range" min="1" max="8" bind:value={calls}/></label>
     <label class="net-slider"><span>{t('agents.llmMs')}<b>{t('agents.secValue', {s: (llmMs / 1000).toFixed(1)})}</b></span><input type="range" min="300" max="6000" step="100" bind:value={llmMs}/></label>
    {:else if current === 'routing'}<label class="net-slider"><span>{t('agentLab.c_threshold')}<b>{threshold.toFixed(2)}</b></span><input type="range" min="0" max=".8" step=".05" bind:value={threshold}/></label>
    {:else if current === 'parallel'}
     <label class="field"><span>{t('agentLab.c_mode')}</span><select bind:value={parallelMode}><option value="sectioning">{t('agentLab.mode_sectioning')}</option><option value="voting">{t('agentLab.mode_voting')}</option></select></label>
     {#if parallelMode === 'sectioning'}<label class="field"><span>{t('agentLab.c_model')}</span><select bind:value={sectionId}>{#each sectionPool as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select></label>
     {:else}
      <label class="net-slider"><span>{t('agentLab.c_voters')}<b>{voters}</b></span><input type="range" min="1" max="15" step="2" bind:value={voters}/></label>
      <label class="net-slider"><span>{t('agentLab.c_error')}<b>{Math.round(error * 100)}%</b></span><input type="range" min="0" max=".45" step=".05" bind:value={error}/></label>
      <label class="net-slider"><span>{t('agentLab.c_correlation')}<b>{Math.round(correlation * 100)}%</b></span><input type="range" min="0" max="1" step=".05" bind:value={correlation}/></label>
     {/if}
    {:else if current === 'approval'}<label class="net-toggle"><input type="checkbox" bind:checked={autoApprove}/> {t('agentLab.c_autoApprove')}</label>{#if Object.keys(decisions).length}<button class="btn small" on:click={() => decisions = {}}>{t('agentLab.c_reset')}</button>{/if}
    {:else if current === 'guardrails'}
     <label class="net-toggle"><input type="checkbox" bind:checked={guardInput}/> {t('agentLab.g_input')}</label>
     <label class="net-toggle"><input type="checkbox" bind:checked={guardTools}/> {t('agentLab.g_tools')}</label>
     <label class="net-toggle"><input type="checkbox" bind:checked={guardOutput}/> {t('agentLab.g_output')}</label>
    {/if}
   </div>

   {#if error_}<p class="callout warn">{error_}</p>{/if}
   {#if run}
    <div class:stale={busy}><RagTrace steps={run.steps}/></div>
    {#if run.pending}
     <div class="approval-box" role="group" aria-label={t('agentLab.approvalTitle')}>
      <h3>{t('agentLab.approvalTitle')}</h3><p>{run.pending.text}</p>
      <p class="mem-actions"><button class="btn primary small" on:click={() => decide(run?.pending?.id ?? '', 'approve')}>{t('agentLab.approve')}</button><button class="btn small" on:click={() => decide(run?.pending?.id ?? '', 'reject')}>{t('agentLab.reject')}</button><span class="note">{t('agentLab.approvalNote')}</span></p>
     </div>
    {/if}
   {:else if busy}<p class="note">{t('ragLab.building')}</p>{/if}
  </section>

  <section class="card"><h2>{t('agents.governTitle')}</h2><p>{pattern.govern}</p>
   {#if controls.length}<ul class="plain">{#each controls as x (x.id)}<li><b>{x.name}.</b> {x.text} <a href={x.source.url} target="_blank" rel="noreferrer">{x.source.title}</a></li>{/each}</ul>{/if}
  </section>
  <section class="card"><h2>{t('compare.sources')}</h2><ul class="plain">{#each pattern.sources as s}<li><a href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}</a></li>{/each}</ul></section>
 </article>
</div>
