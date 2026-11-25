import fs from 'node:fs';
const json = file => JSON.parse(fs.readFileSync(`data/${file}`, 'utf8'));
const {models} = json('catalog/models.json');
const {rules} = json('catalog/license_rules.json');
const {families, mechanisms} = json('content/architectures.json');
json('content/copy.json');
const technical = json('content/architecture_details.json');
const explain = json('content/explainers.json');
const tuning = json('content/finetuning.json');
const small = json('catalog/slm_candidates.json').models;
if (small.length !== 100 || new Set(small.map(s => s.repo)).size !== 100) throw Error('Expected 100 unique small models');
for (const s of small) if (s.params > 1e10 || !rules[s.license.key] || !/^[0-9a-f]{40}$/.test(s.revision)) throw Error(`Bad small model: ${s.repo}`);
for (const f of families) if (!explain.families[f.id]?.faq?.length) throw Error(`No plain explanation: ${f.id}`);
for (const x of mechanisms) if (!explain.mechanisms[x.id]?.faq?.length) throw Error(`No plain explanation: ${x.id}`);
if (!tuning.methods.every(m => m.source?.url?.startsWith('https://'))) throw Error('Fine-tuning method without a source');
const cloud = json('infrastructure/cloud_instances.json');
for (const f of families) if (!technical.families[f.id]?.math?.length) throw Error(`No technical detail: ${f.id}`);
for (const x of mechanisms) if (!technical.mechanisms[x.id]?.math?.length || !technical.mechanisms[x.id].controls?.length) throw Error(`No technical detail: ${x.id}`);
for (const c of cloud.clouds) for (const i of c.instances) if (!(i.gpuMemoryGiB > 0 && i.ramGiB > 0) || !(i.arch in cloud.gpuFormats)) throw Error(`Bad instance: ${i.name}`);
if (models.length < 131) throw Error(`Expected at least 131 gallery models, found ${models.length}`);
if (new Set(models.map(m => m.id)).size !== models.length) throw Error('Duplicate model ids');
for (const m of models) {
  if (!m.name || !m.publisher) throw Error(`Incomplete identity: ${m.id}`);
  if (!m.galleryUrl.startsWith('https://sebastianraschka.com/llm-architecture-gallery/models/')) throw Error(`Model not traced to gallery: ${m.id}`);
  if (!rules[m.license.key]) throw Error(`No licence rule: ${m.id}`);
  if (m.official && !/^[0-9a-f]{40}$/.test(m.official.revision)) throw Error(`Official source not pinned: ${m.id}`);
  if (!families.some(f => f.name === m.architecture.class)) throw Error(`No architecture explanation: ${m.id} (${m.architecture.class})`);
}
for (const [key, rule] of Object.entries(rules)) if (!['allowed', 'conditional', 'prohibited', 'unverified'].includes(rule.commercial)) throw Error(`Invalid rule: ${key}`);
for (const x of mechanisms) if (!x.source?.url?.startsWith('https://')) throw Error(`Building block has no source: ${x.id}`);
// Cost planning: closed-model prices, instance prices and GPU figures, each traced to a source.
const api = json('finops/api_models.json'), prices = json('finops/infrastructure_prices.json'), loads = json('finops/workloads.json');
const providerIds = new Set(api.providers.map(x => x.id));
for (const x of api.providers) if (![x.pricingUrl, x.modelsUrl, x.terms.url].every(u => u.startsWith('https://'))) throw Error(`Provider without sources: ${x.id}`);
if (new Set(api.models.map(m => m.id)).size !== api.models.length || api.models.some(m => models.some(g => g.id === m.id))) throw Error('Duplicate API model ids');
for (const m of api.models) {
  if (!providerIds.has(m.provider) || !m.source.startsWith('https://') || !(m.context > 0) || !m.prices.length) throw Error(`Incomplete API model: ${m.id}`);
  for (const pr of m.prices) for (const k of ['input', 'cachedInput', 'output', 'batchInput', 'batchOutput']) if (!(pr[k] > 0)) throw Error(`Missing price ${k}: ${m.id}`);
  if (m.prices.filter(pr => !pr.from).length !== 1) throw Error(`Exactly one undated price expected: ${m.id}`);
}
for (const [id, c] of Object.entries(prices.clouds)) {
  const known = cloud.clouds.find(x => x.id === id);
  if (!known || !c.source.url.startsWith('https://')) throw Error(`Unknown cloud or source: ${id}`);
  for (const [name, rate] of Object.entries(c.prices)) if (!(rate > 0) || !known.instances.some(i => i.name === name)) throw Error(`Bad price: ${id} ${name}`);
}
for (const g of prices.gpus.specs) if (!g.source.startsWith('https://')) throw Error(`GPU figure without source: ${g.id}`);
if (!loads.presets.length) throw Error('No example workloads');
// Architecture figures for gated configurations: every entry is sourced, and every model it covers carries the figures and the sources.
const publishedCfg = json('catalog/published_configs.json');
for (const e of publishedCfg.configs) {
  if (!e.sources.length || !e.sources.every(x => x.url.startsWith('https://') && x.title)) throw Error(`Published configuration without sources: ${e.id}`);
  const c = e.config;
  if (!['hidden_size', 'num_hidden_layers', 'num_attention_heads', 'num_key_value_heads', 'head_dim', 'intermediate_size', 'vocab_size'].every(k => c[k] > 0)) throw Error(`Incomplete published configuration: ${e.id}`);
  const repos = new Set(e.repos.map(r => r.toLowerCase()));
  for (const x of small.filter(x => repos.has(x.repo.toLowerCase()))) if (!x.configSource || x.layers !== c.num_hidden_layers || !x.architecture) throw Error(`Small model missing published figures: ${x.id}`);
  for (const m of models.filter(m => m.official && repos.has(m.official.repo.toLowerCase()))) if (!m.official.configSource || m.official.layers !== c.num_hidden_layers || !m.official.details?.cache?.agrees) throw Error(`Gallery model missing published figures: ${m.id}`);
}
console.log({apiModels: api.models.length, pricedInstances: Object.values(prices.clouds).reduce((n, c) => n + Object.keys(c.prices).length, 0), models: models.length, official: models.filter(m => m.official).length, licenceRules: Object.keys(rules).length, families: families.length, buildingBlocks: mechanisms.length});
