// Usage: node scripts/catalog/4-build-catalog.mjs <gallery.html> <extracted.json> <hf-index.json> <output.json>
import fs from 'node:fs';
import path from 'node:path';
const [,, galleryFile, extractedFile, indexFile, outFile] = process.argv;
const html = fs.readFileSync(galleryFile, 'utf8');
const extracted = JSON.parse(fs.readFileSync(extractedFile, 'utf8'));
const index = new Map(JSON.parse(fs.readFileSync(indexFile, 'utf8')).map(x => [x.slug, x]));
const {rules} = JSON.parse(fs.readFileSync('data/catalog/license_rules.json', 'utf8'));
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

const cards = new Map();
for (const m of html.matchAll(/<(?:article|a) class="llm-architecture-overview__(?:card|jump-link)"([^>]*)>/g)) {
  const a = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], decode(x[2])]));
  const key = a['data-sort-key'];
  if (key) cards.set(key, {...cards.get(key), ...a});
}
const publisherCountries = new Map();
for (const c of cards.values()) if (c['data-country'] && c['data-company']) {
  if (!publisherCountries.has(c['data-company'])) publisherCountries.set(c['data-company'], new Set());
  publisherCountries.get(c['data-company']).add(c['data-country']);
}
const unit = {T: 1e12, B: 1e9, M: 1e6};
const totalParams = t => { const m = String(t || '').match(/([\d.]+)\s*([TBM])/i); return m ? +m[1] * unit[m[2].toUpperCase()] : null; };
const activeParams = t => { const m = String(t || '').match(/([\d.]+)\s*([TBM])\s*(?:unique\s+)?active/i); return m ? +m[1] * unit[m[2].toUpperCase()] : null; };
const galleryContext = t => {
  const s = String(t || '');
  let m = s.match(/^\s*(\d{1,3}(?:,\d{3})+)/);
  if (m) return +m[1].replace(/,/g, '');
  m = s.match(/^\s*([\d.]+)\s*([KM])/i);
  if (m) return Math.round(+m[1] * (m[2].toUpperCase() === 'M' ? 1048576 : 1024));
  m = s.match(/^\s*(\d+)\b/);
  return m ? +m[1] : null;
};
const kvKiB = t => { const m = String(t || '').match(/([\d.]+)\s*(KiB|MiB)/i); return m ? +m[1] * (m[2].toLowerCase() === 'mib' ? 1024 : 1) : null; };
const overrides = {'deepseek-v3': 'deepseek-1.0', 'grok-2-5-270b': 'grok-2-community', 'motif-3-beta': 'motif-nc', 'datology-xl-30b-a3b': 'unavailable', 'minimax-m2-230b': 'modified-mit-minimax', 'minimax-m2-5-230b': 'minimax-model', 'minimax-m2-7-230b': 'minimax-m2.7-nc', 'mistral-large-4': 'mistral-ecosystem', 'tencent-hy3-preview-295b-a21b': 'tencent-hy-community', 'xlstm-7b': 'nxai-community', 'instella-moe-16b-a3b': 'research-rail'};
const ids = {'apache-2.0': 'apache-2.0', mit: 'mit', 'openmdw-1.1': 'openmdw-1.1', 'modified-mit': 'modified-mit-kimi', 'kimi-k3': 'kimi-k3', 'kimi-k3.1-pro': 'kimi-k3', 'ernie-5.5-flash-base-model-license-v1.0': 'ernie-5.5', gemma: 'gemma', llama3: 'llama3', 'llama3.2': 'llama3.2', llama4: 'llama4', 'lfm1.0': 'lfm-1.0', researchrail: 'research-rail', 'minimax-community': 'minimax-community', 'muse-model-license': 'muse', 'nvidia-nemotron-open-model-license': 'nvidia-nemotron', 'qwen-community-1.0': 'qwen-community', 'upstage-solar-license': 'upstage-solar', 'closed-beta': 'closed-beta', 'stepfun-community-license': 'stepfun-community', 'tencent-hy-license': 'tencent-hy-1.0', 'cc-by-nc-4.0': 'cc-by-nc-4.0'};
const licenseKey = x => overrides[x.slug] || ids[x.licenseName] || ids[x.license] || null;
const GiB = 1024 ** 3;
const hfDir = path.dirname(indexFile);
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/** Precision of the published files, from checkpoint tensor types. Config dtype is unreliable for quantized repos. */
function storedPrecision(slug) {
  const parameters = readJson(path.join(hfDir, slug, 'info.json'))?.safetensors?.parameters;
  const config = readJson(path.join(hfDir, slug, 'config.json'));
  const hasQuantConfig = !!(config?.quantization_config || config?.text_config?.quantization_config);
  if (!parameters) return hasQuantConfig ? 'Quantized (precision not published)' : null;
  const entries = Object.entries(parameters), total = entries.reduce((sum, [, n]) => sum + n, 0);
  const share = test => entries.filter(([k]) => test(k.toUpperCase())).reduce((sum, [, n]) => sum + n, 0) / total;
  const fp8 = share(k => k.startsWith('F8')), packed = share(k => ['U8', 'I8', 'I32'].includes(k));
  if (fp8 >= .8) return '8-bit float (FP8)';
  if (fp8 >= .05 && packed >= .05) return 'Mixed 8-bit and 4-bit';
  if (hasQuantConfig && packed >= .5) return '4-bit float (FP4)';
  if (hasQuantConfig) return 'Quantized (mixed)';
  const dominant = entries.sort((a, b) => b[1] - a[1])[0][0].toUpperCase();
  return {BF16: 'bfloat16', F16: 'float16', F32: 'float32', F64: 'float64'}[dominant] || dominant;
}

/** Design parameters published in config.json, used to start the architecture explorer from real values. */
function designParams(slug) {
  const config = readJson(path.join(hfDir, slug, 'config.json'));
  if (!config) return {};
  const find = (...names) => {
    const scopes = [config, config.text_config, config.llm_config, config.language_config, config.model_config].filter(Boolean);
    for (const name of names) for (const scope of scopes) if (typeof scope[name] === 'number' && scope[name] > 0) return scope[name];
    return null;
  };
  return {
    experts: find('n_routed_experts', 'num_experts', 'num_local_experts', 'moe_num_experts'),
    expertsActive: find('num_experts_per_tok', 'num_experts_per_token'),
    sharedExperts: find('n_shared_experts', 'num_shared_experts'),
    window: find('sliding_window', 'sliding_window_size', 'window_size'),
    kvLatentRank: find('kv_lora_rank', 'hybrid_mla_kv_lora_rank'),
    convKernel: find('short_conv_kernel_size'),
    mtpModules: find('num_nextn_predict_layers', 'num_mtp_modules'),
  };
}

const models = extracted.map(x => {
  const facts = index.get(x.slug)?.facts || {};
  const card = cards.get(x.slug) || {};
  const flags = [];
  const key = licenseKey(x);
  if (!key || !rules[key]) throw Error(`No licence rule for ${x.slug}: ${x.licenseName || x.license}`);
  const gScale = totalParams(facts.scale || x.galleryScale);
  const config = x.maxPositions && x.maxPositions < 1e8 ? x.maxPositions : null;
  const gallery = galleryContext(facts.context);
  const conflict = !!(config && gallery && Math.abs(config / gallery - 1) > .1);
  const context = conflict ? Math.min(config, gallery) : config ?? gallery;
  if (conflict) flags.push(`Context differs: config ${config.toLocaleString('en-US')}, gallery "${facts.context}". The lower value is used.`);
  const checkpointParams = x.safetensorsParams;
  if (checkpointParams && gScale && Math.abs(checkpointParams / gScale - 1) > .15) flags.push(`Parameters differ: checkpoint ${(checkpointParams / 1e9).toFixed(2)}B, gallery "${facts.scale}".`);
  let weightGiB = x.weightBytes ? x.weightBytes / GiB : null, weightSource = x.weightBytes ? 'official-files' : 'none';
  const expected = Math.max(gScale || 0, checkpointParams || 0);
  if (x.weightBytes && expected && x.weightBytes / expected < .4) {
    flags.push(`Published files (${weightGiB.toFixed(1)} GiB) look partial, such as an adapter. Weights are estimated at 2 bytes per parameter.`);
    weightGiB = (expected * 2) / GiB;
    weightSource = 'estimate';
  } else if (!x.weightBytes && gScale) {
    weightGiB = (gScale * 2) / GiB;
    weightSource = 'estimate';
    flags.push('No official weight files found. Weights are estimated at 2 bytes per parameter.');
  }
  if (x.slug === 'arcee-ai-trinity-large-400b' || x.slug === 'nemotron-3-ultra-550b-a55b') flags.push(`Licence differs: official card says OpenMDW 1.1, gallery says "${x.galleryLicense}". The official card is used.`);
  if (x.slug === 'gpt-2-xl-1-5b') flags.push(`Licence differs: official card says MIT, gallery says "${x.galleryLicense}".`);
  if (x.slug === 'minimax-m2-5-230b') flags.push('Licence differs: card metadata says modified MIT, but the repository licence file is the MiniMax Model License. The file is used.');
  if (!x.repo) flags.push('No official model repository found. Facts come from the gallery and its linked technical report.');
  if (x.repo && !x.hasConfig) flags.push(x.gated ? 'Configuration requires accepting the publisher\'s access terms.' : 'No config.json in the official repository.');
  const precision = x.repo ? storedPrecision(x.slug) : null;
  const quantized = !!precision && /bit|quantized/i.test(precision);
  if (quantized) flags.push(`Official checkpoint is stored as ${precision}. The weight size applies to this exact checkpoint, so evaluate and deploy the same one.`);
  const countries = publisherCountries.get(x.publisher);
  const country = card['data-country'] || (countries?.size === 1 ? [...countries][0] : null);
  const aa = Number(card['data-sort-aai-v5']);
  return {
    id: x.slug, name: x.name, publisher: x.publisher, country, released: x.date,
    galleryUrl: `https://sebastianraschka.com/llm-architecture-gallery/models/${x.slug}/`,
    architecture: {class: card['data-decoder-type'] || facts.decoder || null, attention: facts.attention || null, layerMix: facts['layer-mix'] || null, keyDetail: facts['key-detail'] || null},
    scale: facts.scale || x.galleryScale, totalParams: gScale, activeParams: activeParams(facts.scale),
    context, contextConfig: config, contextGallery: facts.context || null, kvKiBPerToken: kvKiB(facts['kv-cache']),
    weightGiB: weightGiB === null ? null : +weightGiB.toFixed(2), weightSource,
    trainingData: facts['training-data'] || null, postTraining: facts['post-training'] || null,
    artificialAnalysisIndex: Number.isFinite(aa) && aa > 0 ? aa : null,
    official: x.repo ? {repo: x.repo, url: `https://huggingface.co/${x.repo}`, revision: x.revision, lastModified: x.lastModified, gated: x.gated && x.gated !== false ? String(x.gated) : null, configUrl: x.hasConfig ? `https://huggingface.co/${x.repo}/blob/${x.revision}/config.json` : null, pipeline: x.pipeline, library: x.library, languages: Array.isArray(x.languages) ? x.languages : x.languages ? [x.languages] : [], architectures: x.architectures, modelType: x.modelType, hiddenSize: x.hiddenSize, layers: x.layers, heads: x.heads, kvHeads: x.kvHeads, vocab: x.vocab, dtype: x.configDtype, storedPrecision: precision, quantized, ...designParams(x.slug), checkpointParams, weightFormat: x.weightFormat, weightFiles: x.weightFiles, vision: x.vision || x.pipeline === 'image-text-to-text', audio: x.audio} : null,
    otherSources: x.officialLinks?.slice(0, 4) || [],
    license: {key, url: x.licenseFile && x.repo ? `https://huggingface.co/${x.repo}/blob/${x.revision}/${x.licenseFile}` : (typeof x.licenseLink === 'string' ? x.licenseLink : x.repo ? `https://huggingface.co/${x.repo}` : null)},
    flags,
  };
});
fs.writeFileSync(outFile, JSON.stringify({generatedOn: '2026-11-23', source: 'https://sebastianraschka.com/llm-architecture-gallery/', models}, null, 1) + '\n');
const count = f => models.filter(f).length;
console.log({models: models.length, official: count(m => m.official), context: count(m => m.context), kv: count(m => m.kvKiBPerToken), weightOfficial: count(m => m.weightSource === 'official-files'), weightEstimate: count(m => m.weightSource === 'estimate'), country: count(m => m.country), aa: count(m => m.artificialAnalysisIndex), flagged: count(m => m.flags.length), vision: count(m => m.official?.vision)});
const precisionCounts = {};
models.forEach(m => { const k = m.official?.storedPrecision || 'not published'; precisionCounts[k] = (precisionCounts[k] || 0) + 1; });
console.log('stored precision', precisionCounts);
const c = {};
models.forEach(m => { const k = rules[m.license.key].commercial; c[k] = (c[k] || 0) + 1; });
console.log(c);
console.log('no context:', models.filter(m => !m.context).map(m => m.id), 'no kv:', models.filter(m => !m.kvKiBPerToken).map(m => m.id), 'no country:', models.filter(m => !m.country).map(m => `${m.id}(${m.publisher})`).join(', '));
console.log('estimated weights:', models.filter(m => m.weightSource === 'estimate').map(m => `${m.id} ${m.weightGiB}`).join('; '));
const ratio = models.filter(m => m.weightSource === 'official-files' && m.totalParams).map(m => [m.id, m.weightGiB * GiB / m.totalParams]).sort((a, b) => a[1] - b[1]);
console.log('lowest bytes/param:', ratio.slice(0, 6).map(([a, b]) => `${a}:${b.toFixed(2)}`).join(' '), '| highest:', ratio.slice(-6).map(([a, b]) => `${a}:${b.toFixed(2)}`).join(' '));
