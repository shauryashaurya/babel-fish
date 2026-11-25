<script lang="ts">
 import NumberField from './NumberField.svelte';
 import {t} from '../lib/content';
 import {emptyResult, minimumTestCases} from '../lib/selection';
 import {patchResult, patchSelection} from '../lib/state';
 import type {CandidateResult, Hosting, Model, Selection} from '../lib/types';
 export let models: Model[];
 export let selection: Selection;
 type NumericKey = Exclude<keyof CandidateResult, 'hosting'>;
 $: candidates = selection.candidates.map(id => models.find(m => m.id === id)).filter((m): m is Model => !!m);
 $: needed = selection.minPassRatePct === null ? null : minimumTestCases(selection.minPassRatePct);
 $: tooSmall = needed !== null && selection.testCases !== null && selection.testCases < needed;
 const fields: {key: NumericKey; label: string; only?: Hosting}[] = [
  {key: 'passed', label: 'passed'}, {key: 'criticalFailures', label: 'criticalFailures'}, {key: 'p95Ms', label: 'latency'},
  {key: 'rpsPerReplica', label: 'throughput', only: 'self'}, {key: 'inputPrice', label: 'inputPrice', only: 'api'}, {key: 'outputPrice', label: 'outputPrice', only: 'api'},
  {key: 'otherMonthly', label: 'other'},
 ];
 const fieldLabel = (key: string) => t(`evaluation.${key}`);
 function update(id: string, key: NumericKey, event: Event) {
  const text = (event.target as HTMLInputElement).value, n = Number(text);
  if (text === '') patchResult(id, {[key]: null});
  else if (Number.isFinite(n) && n >= 0) patchResult(id, {[key]: n});
 }
</script>
<header class="page-head"><div><p class="overline">{t('evaluation.overline')}</p><h1>{t('evaluation.title')}</h1><p>{t('evaluation.intro')}</p></div></header>
<section class="card form-card"><h2>{t('evaluation.criteria')}</h2><div class="form-grid five">
 <NumberField label={t('evaluation.testCases')} hint={t('evaluation.testCasesHint')} value={selection.testCases} min={1} onChange={v => patchSelection({testCases: v === null ? null : Math.floor(v)})}/>
 <NumberField label={t('evaluation.minPass')} hint={t('evaluation.minPassHint')} value={selection.minPassRatePct} min={1} max={99} onChange={v => patchSelection({minPassRatePct: v})}/>
 <NumberField label={t('evaluation.critical')} value={selection.maxCriticalFailures} onChange={v => patchSelection({maxCriticalFailures: v ?? 0})}/>
 <NumberField label={t('evaluation.maxLatency')} hint={t('evaluation.optional')} value={selection.maxP95Ms} onChange={v => patchSelection({maxP95Ms: v})}/>
 <NumberField label={t('evaluation.budget')} hint={t('evaluation.optional')} value={selection.monthlyBudget} onChange={v => patchSelection({monthlyBudget: v})}/>
</div>
{#if needed !== null}<p class={tooSmall ? 'callout warn' : 'callout'}>{t('evaluation.minimumCases', {needed, threshold: selection.minPassRatePct ?? 0})}</p>{/if}
</section>
<section class="card form-card"><h2>{t('evaluation.workload')}</h2><div class="form-grid five">
 <NumberField label={t('evaluation.requests')} value={selection.requestsPerMonth} onChange={v => patchSelection({requestsPerMonth: v})}/>
 <NumberField label={t('evaluation.peak')} hint={t('evaluation.peakHint')} value={selection.peakRps} onChange={v => patchSelection({peakRps: v})}/>
 <NumberField label={t('evaluation.gpuCost')} hint={t('evaluation.selfHosted')} value={selection.gpuMonthlyCost} onChange={v => patchSelection({gpuMonthlyCost: v})}/>
 <NumberField label={t('evaluation.inputTokens')} hint={t('evaluation.hostedHint')} value={selection.inputTokens} onChange={v => patchSelection({inputTokens: v})}/>
 <NumberField label={t('evaluation.outputTokens')} hint={t('evaluation.hostedHint')} value={selection.outputTokens} onChange={v => patchSelection({outputTokens: v})}/>
</div></section>
<section class="section"><div class="section-head"><h2>{t('evaluation.results')}</h2><a class="btn primary" href="#/decision">{t('evaluation.continue')}</a></div>
 {#if candidates.length}
  <div class="table-wrap auto"><table class="entry"><thead><tr><th>{t('evaluation.candidate')}</th><th>{t('evaluation.hosting')}</th>{#each fields as f}<th>{fieldLabel(f.label)}</th>{/each}</tr></thead><tbody>
   {#each candidates as m (m.id)}
    {@const r = {...emptyResult, ...selection.results[m.id]}}
    <tr><td><a href={`#/model/${encodeURIComponent(m.id)}`}>{m.name}</a></td>
     <td><select aria-label={t('evaluation.fieldFor', {field: t('evaluation.hosting'), model: m.name})} value={r.hosting} on:change={e => patchResult(m.id, {hosting: e.currentTarget.value as Hosting})}><option value="self">{t('evaluation.selfHosted')}</option><option value="api">{t('evaluation.hostedEndpoint')}</option></select></td>
     {#each fields as f}<td>{#if !f.only || f.only === r.hosting}<input type="number" min="0" step="any" aria-label={t('evaluation.fieldFor', {field: fieldLabel(f.label), model: m.name})} value={r[f.key] ?? ''} on:input={e => update(m.id, f.key, e)}/>{:else}<span class="na">{t('evaluation.notApplicable')}</span>{/if}</td>{/each}
    </tr>
   {/each}
  </tbody></table></div>
 {:else}<div class="empty">{t('evaluation.emptyLead')} <a href="#/requirements">{t('evaluation.emptyLink')}</a></div>{/if}
</section>
