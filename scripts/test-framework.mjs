import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const cache = new Map();
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  const mod = {exports: {}};
  cache.set(absolute, mod);
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.resolve(path.dirname(absolute), `${name}.ts`)) : require(name), mod, mod.exports);
  return mod.exports;
}
const content = load('src/lib/content.ts');
content.setCopy(JSON.parse(fs.readFileSync('data/content/copy.json', 'utf8')));
const architecture = load('src/lib/architecture.ts');
const architectureContent = JSON.parse(fs.readFileSync('data/content/architectures.json', 'utf8'));
const technical = JSON.parse(fs.readFileSync('data/content/architecture_details.json', 'utf8'));
architecture.setArchitecture(architectureContent, technical);
const infra = load('src/lib/infrastructure.ts');
const cloudData = JSON.parse(fs.readFileSync('data/infrastructure/cloud_instances.json', 'utf8'));
infra.setInfrastructure(cloudData);
const neural = load('src/lib/neural.ts');
const katex = require('katex');
const training = load('src/lib/training.ts');
const learning = load('src/lib/learning.ts');
const filters = load('src/lib/filters.ts');
const {assessModel, decide, footprint, licenseCheck, minimumTestCases, safeUrl, wilson} = load('src/lib/selection.ts');
const {rules} = JSON.parse(fs.readFileSync('data/catalog/license_rules.json', 'utf8'));
const models = JSON.parse(fs.readFileSync('data/catalog/models.json', 'utf8')).models.map(m => ({...m, license: {...m.license, rule: rules[m.license.key]}}));
const byId = id => { const m = models.find(x => x.id === id); assert.ok(m, `missing ${id}`); return m; };
const base = {useCase: '', preparedBy: '', commercialUse: false, offersMaaS: false, annualRevenueUsd: null, monthlyActiveUsers: null, regions: [], minContext: null, needsVision: false, excludedPublishers: [], excludedCountries: [], gpuMemoryGiB: null, gpuCount: null, concurrentSessions: 1, headroomPct: 0, testCases: null, minPassRatePct: null, maxCriticalFailures: 0, maxP95Ms: null, monthlyBudget: null, requestsPerMonth: null, inputTokens: null, outputTokens: null, peakRps: null, gpuMonthlyCost: null, candidates: [], results: {}, notes: ''};
const lic = (id, patch) => licenseCheck(byId(id), {...base, commercialUse: true, ...patch}).status;

// Catalog scope
assert.equal(models.length, 131);
assert.ok(models.every(m => m.galleryUrl.includes('/llm-architecture-gallery/models/')));

// Stored precision comes from checkpoint tensors, not the config label
assert.equal(byId('deepseek-v3').official.storedPrecision, '8-bit float (FP8)');
assert.equal(byId('kimi-k3').official.storedPrecision, '4-bit float (FP4)');
assert.equal(byId('gpt-oss-120b').official.storedPrecision, '4-bit float (FP4)');
assert.ok(byId('kimi-k3').flags.some(f => f.includes('exact checkpoint')));

// Licence rules from published terms
assert.equal(lic('olmo-2-7b', {}), 'pass');
assert.equal(lic('tiny-aya-3-35b', {}), 'fail', 'CC-BY-NC blocks commercial use');
assert.equal(lic('instella-moe-16b-a3b', {}), 'fail', 'research-only licence');
assert.equal(lic('minimax-m2-7-230b', {}), 'fail');
assert.equal(lic('soofi-s-30b-a3b', {}), 'confirm', 'unpublished terms are never a pass');
assert.equal(lic('lfm3-1-7b', {annualRevenueUsd: 9_000_000}), 'pass');
assert.equal(lic('lfm3-1-7b', {annualRevenueUsd: 10_000_000}), 'fail', 'LFM threshold is $10M or more');
assert.equal(lic('lfm3-1-7b', {}), 'confirm', 'missing revenue needs confirmation');
assert.equal(lic('tencent-hy3-preview-295b-a21b', {monthlyActiveUsers: 10, regions: ['EU']}), 'fail');
assert.equal(lic('tencent-hy3-preview-295b-a21b', {monthlyActiveUsers: 10}), 'pass');
assert.equal(lic('llama-3-8b', {monthlyActiveUsers: 800_000_000}), 'fail');
assert.equal(lic('mistral-large-4', {offersMaaS: true}), 'fail');
assert.equal(lic('mistral-large-4', {}), 'pass');
assert.equal(lic('kimi-k3', {offersMaaS: true, annualRevenueUsd: 30_000_000}), 'fail');
assert.equal(lic('kimi-k3', {offersMaaS: true, annualRevenueUsd: 10_000_000}), 'pass');
assert.equal(lic('xlstm-7b', {annualRevenueUsd: 200_000_000}), 'confirm', 'non-USD limit is never auto-converted');
assert.equal(licenseCheck(byId('tiny-aya-3-35b'), base), null, 'no licence test without commercial or regional input');

// Missing facts need confirmation
assert.equal(assessModel(byId('xlstm-7b'), {...base, minContext: 1000}).status, 'confirm');
assert.equal(assessModel(byId('gpt-2-xl-1-5b'), {...base, excludedCountries: ['China']}).status, 'confirm');

// Footprint
const fp = footprint({weightGiB: 10, kvKiBPerToken: 512, context: 2048}, {minContext: 1024, concurrentSessions: 2, headroomPct: 25, gpuMemoryGiB: 8});
assert.equal(fp.cacheGiB, 512 * 1024 * 2 / (1024 * 1024));
assert.equal(fp.memoryGiB, (10 + 1) * 1.25);
assert.equal(fp.gpusPerReplica, 2);

// Wilson interval, reference value for 95/100 at z=1.96: 0.8882 to 0.9785
const [low, high] = wilson(95, 100);
assert.ok(Math.abs(low - 0.8882) < 0.0005 && Math.abs(high - 0.9785) < 0.0005);
const needed = minimumTestCases(90);
assert.ok(wilson(needed, needed)[0] >= 0.9 && wilson(needed - 1, needed - 1)[0] < 0.9);

// Decision rule, hosted
const usable = models.filter(m => m.license.key === 'apache-2.0' && m.weightGiB && m.kvKiBPerToken && m.context);
const [a, b, c] = usable.map(m => m.id);
const api = (passed, price, criticalFailures = 0) => ({hosting: 'api', passed, criticalFailures, p95Ms: 100, rpsPerReplica: null, inputPrice: price, outputPrice: price, otherMonthly: 0});
const ready = {...base, testCases: 200, minPassRatePct: 80, requestsPerMonth: 10000, inputTokens: 1000, outputTokens: 100, candidates: [a, b, c]};
assert.equal(decide(base, models).state, 'empty');
assert.equal(decide({...ready, results: {[a]: api(190, 1)}}, models).state, 'incomplete');
const picked = decide({...ready, results: {[a]: api(180, 1), [b]: api(198, 5), [c]: api(199, .5, 2)}}, models);
assert.equal(picked.state, 'selected');
assert.equal(picked.winner.id, a, 'cheapest qualified model wins');
assert.equal(picked.rows.find(r => r.id === c).status, 'rejected', 'critical failure rejects the cheapest model');
assert.equal(picked.tradeoffs.length, 1, 'measurably better, costlier model is disclosed');
assert.equal(decide({...ready, results: {[a]: api(100, 1), [b]: api(100, 1), [c]: api(100, 1)}}, models).state, 'none');
assert.equal(decide({...ready, results: {[a]: api(201, 1), [b]: api(190, 1), [c]: api(190, 1)}}, models).state, 'incomplete');

// Decision rule, self-hosted sizing and licence gate
const small = usable.filter(m => m.weightGiB < 60)[0];
const self = (rpsPerReplica) => ({hosting: 'self', passed: 195, criticalFailures: 0, p95Ms: 100, rpsPerReplica, inputPrice: null, outputPrice: null, otherMonthly: 100});
const hosted = {...base, testCases: 200, minPassRatePct: 80, requestsPerMonth: 10000, peakRps: 10, gpuMemoryGiB: 96, gpuMonthlyCost: 1000, minContext: 1024, candidates: [small.id], results: {[small.id]: self(3)}};
const sized = decide(hosted, models).winner;
assert.equal(sized.replicas, 4);
assert.equal(sized.totalGpus, 4 * sized.footprint.gpusPerReplica);
assert.equal(sized.monthlyCost, sized.totalGpus * 1000 + 100);
assert.equal(decide({...hosted, gpuCount: 1}, models).state, sized.totalGpus > 1 ? 'none' : 'selected', 'GPU capacity is enforced');
const nc = 'tiny-aya-3-35b';
assert.equal(decide({...hosted, commercialUse: true, candidates: [nc], results: {[nc]: self(3)}}, models).state, 'none', 'prohibited licence cannot win');

// Architecture coverage and layer parsing
for (const m of models) {
  assert.ok(architecture.familyOf(m), `no family for ${m.id}`);
  assert.ok(architecture.mechanismsOf(m).length > 0, `no building block for ${m.id}`);
}
for (const x of architectureContent.mechanisms) assert.ok(models.some(m => architecture.hasMechanism(m, x.id)), `unused building block ${x.id}`);
assert.deepEqual(architecture.layerStack(byId('kimi-k3')).map(s => [s.count, s.mechanism?.id]), [[69, 'linear'], [24, 'gated']]);
assert.deepEqual(architecture.layerStack(byId('nemotron-3-nano-30b-a3b')).map(s => [s.count, s.mechanism?.id]), [[6, 'gqa'], [23, 'statespace'], [23, 'moe']]);
assert.equal(architecture.hasMechanism(byId('gpt-2-xl-1-5b'), 'moe'), false);
assert.equal(architecture.hasMechanism(byId('kimi-k3'), 'moe'), true);

// Filters and sorting
const view = patch => ({sortKey: 'name', ascending: true, filters: {...filters.emptyFilters(), ...patch}});
const facet = (key, values) => view({facets: {...filters.emptyFilters().facets, [key]: values}});
assert.equal(filters.visibleModels(models, base, view({})).length, 131);
assert.equal(filters.visibleModels(models, base, facet('family', ['Recurrent'])).length, 1);
assert.equal(filters.visibleModels(models, base, facet('commercial', ['prohibited'])).length, 4);
const both = view({facets: {...filters.emptyFilters().facets, family: ['Dense'], commercial: ['allowed']}});
assert.ok(filters.visibleModels(models, base, both).every(a => a.model.architecture.class === 'Dense' && a.model.license.rule.commercial === 'allowed'));
assert.ok(filters.visibleModels(models, base, view({maxWeightGiB: 10})).every(a => a.model.weightGiB <= 10));
assert.ok(!filters.visibleModels(models, base, view({minContextK: 1})).some(a => a.model.id === 'xlstm-7b'), 'a range filter excludes unknown values');
const newest = filters.visibleModels(models, base, {sortKey: 'context', ascending: false, filters: filters.emptyFilters()});
assert.equal(newest.at(-1).model.id, 'xlstm-7b', 'missing values sort last');
const options = filters.facetOptions(models, base, facet('family', ['Dense']).filters, 'family');
assert.equal(options.find(o => o.value === 'Recurrent').count, 1, 'facet counts ignore their own selection');

// Every equation must compile
for (const item of [...Object.values(technical.families), ...Object.values(technical.mechanisms)]) {
  assert.ok(item.math.length >= 3 && item.strengths.length && item.weaknesses.length && item.limitations.length && item.caveats.length);
  for (const m of item.math) assert.doesNotThrow(() => katex.renderToString(m.tex, {output: 'mathml', throwOnError: true}), m.tex);
}

// Every diagram computes finite values at its control limits
const finite = scene => {
  assert.ok(scene.nodes.length > 3);
  for (const n of scene.nodes) assert.ok([n.x, n.y, n.w, n.h, n.value].every(Number.isFinite), `bad node ${n.id}`);
  const ids = new Set(scene.nodes.map(n => n.id));
  for (const e of scene.edges) assert.ok(ids.has(e.from) && ids.has(e.to) && Number.isFinite(e.weight), `bad edge ${e.from}-${e.to}`);
  for (const r of scene.readouts) assert.ok(!/NaN|Infinity|undefined/.test(r.value), `bad readout ${r.label}: ${r.value}`);
};
for (const [id, def] of [...Object.entries(technical.mechanisms), ['ffn', technical.feedForward]]) {
  for (const pick of ['min', 'value', 'max']) {
    const params = {head: 0, hiddenSize: 1024, ...Object.fromEntries(def.controls.map(c => [c.id, c[pick]]))};
    params.tokens = Math.max(params.tokens, 8); params.position = Math.min(Math.max(params.position, 1), params.tokens - 1 - (id === 'mtp' ? params.horizon : 0));
    if (params.kvHeads) params.kvHeads = Math.min(params.kvHeads, params.queryHeads);
    if (params.active) params.active = Math.min(params.active, params.experts);
    finite(neural.simulate(def.scene, id, params));
  }
}
const attend = (variant, patch) => neural.attentionWeights(variant, {tokens: 20, position: 15, ...patch}, 15, 0, 0);
assert.ok(Math.abs(attend('gqa', {}).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'attention weights sum to 1');
assert.equal(attend('window', {window: 4}).filter(w => w > 0).length, 4, 'window mask limits attention');
assert.equal(attend('window', {window: 4, globalLayer: 1}).filter(w => w > 0).length, 15, 'global layer sees all');
assert.equal(attend('sparse', {topK: 3}).filter(w => w > 0).length, 3, 'sparse attention keeps top k');

// Infrastructure sizing
const cloudById = id => cloudData.clouds.find(c => c.id === id);
assert.equal(cloudById('azure').instances.find(i => i.name.includes('GB200')).gpuMemoryGiB, 768, 'Azure GB200 is 4 x 192');
assert.equal(cloudById('azure').instances.find(i => i.name.includes('GB300')).gpuMemoryGiB, 1152, 'Azure GB300 is 4 x 288');
const fp4 = byId('gpt-oss-120b'), h100 = cloudById('aws').instances.find(i => i.name === 'p5.48xlarge'), b200 = cloudById('aws').instances.find(i => i.name === 'p6-b200.48xlarge');
assert.equal(infra.requiredFormat(fp4), 'fp4');
assert.equal(infra.runsNatively(fp4, h100), false);
assert.equal(infra.runsNatively(fp4, b200), true);
assert.ok(infra.servedWeightsGiB(fp4, h100) > infra.servedWeightsGiB(fp4, b200) * 1.5, 'FP4 expands on older GPUs');
for (const m of models) for (const cloud of cloudData.clouds) {
  const min = infra.pickInstance(m, cloud, infra.minimumProfile(m), false);
  const rec = infra.pickInstance(m, cloud, {sessions: 4, contextTokens: m.context ?? 32768, headroomPct: 25}, true);
  assert.ok(min && rec, `${m.id} has no ${cloud.id} instance`);
  assert.ok(min.memoryGiB <= min.instance.gpuMemoryGiB * min.count + 1e-6, `${m.id} minimum does not fit`);
  assert.ok(rec.memoryGiB <= rec.instance.gpuMemoryGiB * rec.count + 1e-6, `${m.id} recommended does not fit`);
  assert.ok(rec.native && !rec.instance.fractional, `${m.id} recommended must be native`);
}

// Fine-tuning lab shows real trade-offs
const tune = (settings, steps) => { const f = new training.FineTuner({method: 'lora', examples: 24, noise: .04, learningRate: .015, rank: 2, keepClose: 0, rehearsal: 0, ...settings}); f.run(steps); return f.history.at(-1); };
const plainTune = tune({}, 700), rehearsed = tune({rehearsal: 16}, 700), overfit = tune({method: 'full', examples: 5, noise: .14}, 1400);
assert.ok(plainTune.holdout < .005, 'LoRA learns the new skill');
assert.ok(plainTune.retained > .02, 'tuning without rehearsal forgets');
assert.ok(rehearsed.retained < plainTune.retained / 3, 'rehearsal protects the old skill');
assert.ok(overfit.holdout > overfit.train * 3, 'few noisy examples overfit');
assert.equal(new training.FineTuner({method: 'head', examples: 8, noise: 0, learningRate: .01, rank: 1, keepClose: 0, rehearsal: 0}).trainable, 13);

// Expert lab: routing is learned, and balancing prevents dead experts
const experts = balance => { const e = new training.ExpertTrainer({experts: 4, active: 1, balance}); const start = e.error(); e.run(1500); return {start, end: e.error(), use: e.usage()}; };
const balanced = experts(true), unbalanced = experts(false);
assert.ok(balanced.end < balanced.start / 10, 'experts learn the target');
assert.ok(balanced.use.every(u => u > .1), 'balancing keeps every expert in use');
assert.ok(unbalanced.use.some(u => u < .005), 'without balancing some experts die');

// Fine-tuning plan
const plan = training.planTraining({params: 4e9, hiddenSize: 2048, layers: 32, method: 'lora', rank: 16, batch: 8, sequence: 512, examples: 2000, epochs: 3, checkpointing: true});
assert.equal(plan.trainable, 32 * 4 * 2 * 16 * 2048);
assert.equal(plan.steps, 750);
assert.ok(training.planTraining({params: 4e9, hiddenSize: 2048, layers: 32, method: 'full', rank: 16, batch: 8, sequence: 512, examples: 2000, epochs: 3, checkpointing: true}).memoryGiB > plan.memoryGiB);
assert.ok(training.planTraining({params: 4e9, hiddenSize: 2048, layers: 32, method: 'qlora', rank: 16, batch: 8, sequence: 512, examples: 2000, epochs: 3, checkpointing: true}).memoryGiB < plan.memoryGiB);

// Small model candidates
const slmRows = JSON.parse(fs.readFileSync('data/catalog/slm_candidates.json', 'utf8')).models;
assert.equal(slmRows.length, 100);
assert.ok(slmRows.every((s, i) => s.rank === i + 1 && s.params <= 1e10));
assert.ok(slmRows.every(s => rules[s.license.key]));
const perPublisher = {}; slmRows.forEach(s => perPublisher[s.publisher] = (perPublisher[s.publisher] || 0) + 1);
assert.ok(Object.values(perPublisher).every(n => n <= 12), 'publisher cap holds');
assert.ok(!slmRows.some(s => /gguf|onnx|mlx/i.test(s.repo)), 'no re-packaged builds');
const sampleSlm = slmRows.find(s => s.kvKiBPerToken);
assert.ok(Math.abs(learning.slmWeights(sampleSlm, 'bit4') - sampleSlm.params * .5 / 1024 ** 3) < 1e-9);
assert.ok(learning.slmMemory(sampleSlm, 'bit4', 8192) < learning.slmMemory(sampleSlm, 'bit16', 8192));


// Small-model architecture details read from the published configurations
const bySlm = name => slmRows.find(s => s.name === name);
const qwen = bySlm('Qwen3-0.6B');
assert.equal(qwen.architecture.headDim, 128, 'explicit head_dim is used, not hidden / heads');
assert.equal(qwen.kvKiBPerToken, 2 * 28 * 8 * 128 * 2 / 1024);
assert.equal(qwen.family, 'dense'); assert.equal(qwen.architecture.attention, 'GQA');
const olmo3 = bySlm('Olmo-3-7B-Instruct');
assert.deepEqual([olmo3.cache.fullLayers, olmo3.cache.windowLayers, olmo3.cache.window], [8, 24, 4096]);
// Sliding-window layers stop growing at their window
const at = ctx => learning.slmCacheGiB(olmo3, ctx);
assert.ok(Math.abs((at(65536) - at(32768)) - olmo3.cache.perLayerKiB * 8 * 32768 / 1024 ** 2) < 1e-9);
const nemo = bySlm('NVIDIA-Nemotron-Nano-9B-v2');
assert.equal(nemo.family, 'dense-hybrid'); assert.ok(nemo.mechanisms.includes('statespace')); assert.equal(nemo.cache.fullLayers, 4);
assert.equal(bySlm('LFM2-8B-A1B').family, 'hybrid-moe');
assert.equal(bySlm('Ling-3.0-tiny').kvKiBPerToken, null, 'unreadable hybrid designs are not estimated');
assert.ok(slmRows.filter(s => s.architecture).every(s => s.mechanisms.every(id => architectureContent.mechanisms.some(m => m.id === id))));
assert.ok(slmRows.every(s => ['base', 'instruct', 'reasoning', 'code', 'tools'].includes(s.purpose)));
// Decode ceiling = bandwidth / bytes read per token
const devices = JSON.parse(fs.readFileSync('data/infrastructure/devices.json', 'utf8'));
assert.ok(devices.devices.every(d => d.memoryGB > 0 && d.bandwidthGBs > 0 && /^https:\/\//.test(d.source)));
const dev = {bandwidthGBs: 100};
const bytes = (learning.slmWeights(qwen, 'bit16') + learning.slmCacheGiB(qwen, 4096)) * 1024 ** 3;
assert.ok(Math.abs(learning.decodeBound(qwen, 'bit16', 4096, dev) - 100e9 / bytes) < 1e-6);
assert.ok(learning.decodeBound(qwen, 'bit4', 4096, dev) > learning.decodeBound(qwen, 'bit16', 4096, dev));
// Small models carried into the decision engine
const asModel = learning.slmAsModel({...qwen, license: {...qwen.license, rule: rules[qwen.license.key]}});
assert.equal(asModel.totalParams, qwen.params); assert.equal(asModel.license.rule.name, rules[qwen.license.key].name);

// Quantization
const quant = load('src/lib/quantize.ts');
const w = quant.sampleWeights(4096, true);
const err = (b, g) => quant.errorStats(w, quant.quantize(w, b, g)).relative;
assert.ok(err(8, 128) < err(4, 128) && err(4, 128) < err(2, 128), 'more bits, less error');
assert.ok(err(4, 32) < err(4, 0), 'smaller groups limit the damage from large weights');
assert.equal(quant.bitsPerWeight(4, 32, 4096), 4.5);
assert.deepEqual(quant.quantize([0.5, -0.3, 0.1], 2, 0), [0.5, -0.5, 0]);

// RAG: retrieval, fusion, graph and chooser
const ragContent = JSON.parse(fs.readFileSync('data/content/rag.json', 'utf8'));
const ragLib = load('src/lib/rag.ts');
ragLib.setRag(ragContent);
assert.ok(ragContent.approaches.every(a => /^https:\/\//.test(a.source.url) && ragContent.categories[a.category]));
assert.ok(ragContent.chooser.rules.every(r => [...(r.add ?? []), ...(r.avoid ?? [])].every(id => ragContent.approaches.some(a => a.id === id))));
const doc = (id, text) => ({id, title: '', section: '', text, href: ''});
const chunks = ragLib.chunkCorpus([doc('a', 'the attention cache grows with context length'), doc('b', 'experts are chosen by a router'), doc('c', 'cache cache cache unrelated words here and more words')], 'document', 0, 0);
const scored = ragLib.bm25(chunks, 'attention cache');
assert.ok(scored[0].score > scored[2].score && scored[1].score === 0, 'BM25 prefers the passage matching the rarer term');
assert.ok(ragLib.trigram(chunks, 'routr experts')[1].score > ragLib.trigram(chunks, 'routr experts')[0].score, 'trigrams tolerate a typo');
const hybrid = ragLib.search(chunks, 'attention cache router', 'hybrid');
const rrf = r => (r.ranks.bm25 ? 1 / (60 + r.ranks.bm25) : 0) + (r.ranks.trigram ? 1 / (60 + r.ranks.trigram) : 0);
assert.ok(hybrid.every(r => Math.abs(r.score - rrf(r)) < 1e-12), 'reciprocal rank fusion with k = 60');
const words = ragLib.chunkCorpus([doc('w', Array.from({length: 100}, (_, i) => `w${i}`).join(' '))], 'words', 40, 10);
assert.deepEqual(words.map(c => c.words), [40, 40, 40]);
assert.equal(words[1].text.split(' ')[0], 'w30', 'overlap repeats the last words of the previous chunk');
const graph = ragLib.buildGraph(models);
assert.equal([...graph.nodes.values()].filter(n => n.kind === 'model').length, models.length);
const groupsLoose = ragLib.communities(graph, .4), groupsTight = ragLib.communities(graph, .9);
assert.equal(groupsLoose.reduce((n, g) => n + g.ids.length, 0), models.length);
assert.ok(groupsTight.length >= groupsLoose.length, 'a stricter overlap never merges communities');
const rec = ragLib.recommend({questionType: 'global', exactTerms: 'no', format: 'text', size: 'large', change: 'frequent', latency: 'strict'});
assert.ok(rec.picks.some(p => p.approach.id === 'lightrag') && !rec.picks.some(p => p.approach.id === 'graphrag'));
assert.ok(rec.picks.some(p => p.approach.id === 'hybrid'));

// Comparison: config details, window-aware cache, verdicts and sources
const cmp = load('src/lib/compare.ts');
const compareContent = JSON.parse(fs.readFileSync('data/content/compare.json', 'utf8'));
cmp.setCompareContent(compareContent);
const g3 = byId('olmo-3-7b').official.details, g4 = byId('gemma-4-26b-a4b').official.details;
assert.deepEqual([g3.layout.full, g3.layout.window, g3.layout.windowSize], [8, 24, 4096], 'Olmo 3 7B: 24 sliding-window + 8 full layers');
assert.equal(byId('gemma-3-27b').official.details, null, 'gated configurations are not read');
assert.ok(g3.cache.agrees && Math.abs(g3.cache.totalKiB - byId('olmo-3-7b').kvKiBPerToken) < 1e-9, 'config split reproduces the gallery figure');
assert.deepEqual([g4.headDim, g4.globalHeadDim, g4.globalKvHeads, g4.sharedKv, g4.logitSoftcap, g4.moeIntermediate], [256, 512, 2, true, 30, 704]);
assert.ok(models.filter(m => m.official?.details?.cache?.agrees).every(m => Math.abs(m.official.details.cache.totalKiB - m.kvKiBPerToken) / m.kvKiBPerToken <= .03));
const qwen3 = byId('qwen3-0-6b').official.details;
assert.equal(qwen3.headDim, 128); assert.ok(qwen3.headDimStated, 'Qwen3 states head_dim instead of hidden / heads');
const allArchs = cmp.allArchs(models);
assert.equal(allArchs.length, models.length + learning.slms.filter(s => !s.galleryModelId).length);
assert.equal(new Set(allArchs.map(a => a.id)).size, allArchs.length, 'gallery and small-model ids never collide');
const a3 = allArchs.find(a => a.id === 'olmo-3-7b'), a4 = allArchs.find(a => a.id === 'gemma-4-26b-a4b');
// Past the window only full layers grow: doubling 32K to 64K adds full-layer cache only
const grow = a => cmp.cacheGiB(a, 65536) - cmp.cacheGiB(a, 32768);
assert.ok(Math.abs(grow(a3) - g3.cache.fullKiB * 8 * 32768 / 1024 ** 2) < 1e-9);
assert.ok(cmp.cacheGiB(a3, 65536) < byId('olmo-3-7b').kvKiBPerToken * 65536 / 1024 ** 2, 'window-aware cache is below the all-layers figure');
assert.equal(cmp.cacheGiB(a3, 10 * a3.context), cmp.cacheGiB(a3, a3.context), 'cache stops at the configured context');
const noSplit = allArchs.find(a => a.id === 'deepseek-v4-flash');
assert.equal(noSplit.cache, null, 'a split that disagrees with the gallery is not used');
assert.ok(Math.abs(cmp.cacheGiB(noSplit, 4096) - byId('deepseek-v4-flash').kvKiBPerToken * 4096 / 1024 ** 2) < 1e-12);
assert.equal(a4.attentionType, 'GQA'); assert.equal(allArchs.find(a => a.id === 'deepseek-v3').attentionType, 'MLA');
const dim = id => cmp.DIMENSIONS.find(d => d.id === id);
assert.equal(cmp.verdict(dim('family'), [a3, a4]), 'different');
assert.equal(cmp.verdict(dim('vocab'), [a4, allArchs.find(a => a.id === 'gemma-4-31b')]), 'same');
assert.equal(cmp.verdict(dim('qkNorm'), [a4, allArchs.find(a => a.id === 'gemma-3-27b')]), 'same', 'the gallery description fills in where a gated config cannot be read');
assert.equal(cmp.verdict(dim('family'), [a3]), 'partial', 'one model alone is never called the same or different');
assert.ok(cmp.DIMENSIONS.every(d => compareContent.specs.some(s => s.id === d.spec)), 'every compared fact has an explanation');
assert.ok(compareContent.specs.every(s => compareContent.groups.some(g => g.id === s.group) && s.sources.every(x => /^https:\/\/arxiv\.org\/abs\/\d{4}\.\d{4,5}$/.test(x.url))));
for (const s of compareContent.specs) for (const m of s.math) assert.ok(!katex.renderToString(m.tex, {throwOnError: false, output: 'mathml'}).includes('katex-error'), `formula ${s.id}: ${m.label}`);
assert.equal(cmp.fmtTokens(131072), '128K'); assert.equal(cmp.fmtParams(26e9), '26B');

// The product name is applied everywhere
for (const file of ['data/content/copy.json', 'data/meta/manifest.json', 'README.md', 'package.json', '.github/workflows/deploy.yml', 'index.html']) assert.ok(!/Language Model Babel Fish|babel-fish-enterprise/.test(fs.readFileSync(file, 'utf8')), `old name in ${file}`);
assert.equal(content.t('app.title'), 'Babel Fish');

// All visible text comes from ./data/content/copy.json
const sourceFiles = [];
const walk = dir => { for (const name of fs.readdirSync(dir)) { const file = path.join(dir, name); if (fs.statSync(file).isDirectory()) walk(file); else if (/\.(ts|svelte)$/.test(name)) sourceFiles.push(file); } };
walk('src');
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bt\('([\w.:-]+)'/g)) assert.notEqual(content.t(match[1]), match[1], `missing copy key ${match[1]} in ${file}`);
  for (const match of text.matchAll(/\blist\('([\w.]+)'\)/g)) assert.ok(content.list(match[1]).length, `missing copy list ${match[1]}`);
  if (file.endsWith('.svelte')) {
    let markup = text.replace(/<script[\s\S]*?<\/script>/g, '');
    for (let i = 0; i < 6; i++) markup = markup.replace(/\{[^{}]*\}/g, '');
    const literal = [...markup.matchAll(/>([^<>]*[A-Za-z]{2,}[^<>]*)</g)].map(x => x[1].trim()).filter(x => !/^(models|license_rules|copy|architectures)\.json,?$/.test(x));
    assert.deepEqual(literal, [], `hardcoded text in ${file}`);
    assert.deepEqual([...markup.matchAll(/(?:placeholder|aria-label|title)="[^"]*[A-Za-z]{2}[^"]*"/g)].map(x => x[0]), [], `hardcoded attribute in ${file}`);
  }
}

assert.equal(safeUrl('javascript:alert(1)'), null);
assert.equal(safeUrl('http://example.com'), null);
assert.ok(safeUrl('https://example.com/a'));
console.log({selectionEngine: 'passed', models: models.length});
