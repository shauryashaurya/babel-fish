// Usage: node scripts/catalog/7-build-slms.mjs <dir-with-selected.json> <output.json>
import fs from 'node:fs';
import path from 'node:path';

const [,, dir, outFile] = process.argv;
const selected = JSON.parse(fs.readFileSync(path.join(dir, 'selected.json'), 'utf8'));
const {rules} = JSON.parse(fs.readFileSync('data/catalog/license_rules.json', 'utf8'));
const {models} = JSON.parse(fs.readFileSync('data/catalog/models.json', 'utf8'));
const galleryByRepo = new Map(models.filter(m => m.official).map(m => [m.official.repo.toLowerCase(), m.id]));
const GiB = 1024 ** 3;
const ids = {'apache-2.0': 'apache-2.0', mit: 'mit', 'openmdw-1.1': 'openmdw-1.1', 'cc-by-nc-4.0': 'cc-by-nc-4.0', gemma: 'gemma', 'lfm1.0': 'lfm-1.0', llama3: 'llama3', 'llama3.1': 'llama3.1', 'llama3.2': 'llama3.2', llama2: 'llama2', exaone: 'exaone-nc', deepseek: 'deepseek-1.0', 'qwen-research': 'qwen-research', 'nvidia-open-model-license': 'nvidia-open-model', 'nvidia-nemotron-open-model-license': 'nvidia-nemotron', 'bigcode-openrail-m': 'bigcode-openrail', 'nvidia-internal-scientific-research-and-development-model-license': 'nvidia-internal', 'cc-by-sa-4.0': 'cc-by-sa-4.0', 'jamba-open-model-license': 'jamba-open'};
const overrides = {'stabilityai/stablelm-zephyr-3b': 'stability-community', 'internlm/internlm2-chat-7b': 'internlm-weights', 'internlm/internlm2_5-7b-chat': 'internlm-weights', 'nvidia/Nemotron-Orchestrator-8B': 'nvidia-nc'};
const licenseKey = r => {
  if (overrides[r.id]) return overrides[r.id];
  const c = r.cardData || {}, tag = (r.tags || []).find(t => t.startsWith('license:'))?.slice(8);
  return ids[c.license_name] || ids[Array.isArray(c.license) ? c.license[0] : c.license] || ids[tag] || null;
};
function weights(siblings) {
  const files = (siblings || []).filter(s => s.size != null && /\.safetensors$/.test(s.rfilename) && !s.rfilename.includes('/'));
  const groups = [files.filter(s => /^model[-.]/.test(s.rfilename)), files.filter(s => /^consolidated/.test(s.rfilename)), files];
  const chosen = groups.find(g => g.length);
  return chosen ? chosen.reduce((sum, s) => sum + s.size, 0) : null;
}
const pick = (config, ...names) => {
  const scopes = [config, config?.text_config, config?.llm_config].filter(Boolean);
  for (const name of names) for (const scope of scopes) if (typeof scope[name] === 'number' && scope[name] > 0) return scope[name];
  return null;
};
function precision(parameters) {
  if (!parameters) return null;
  const top = Object.entries(parameters).sort((a, b) => b[1] - a[1])[0]?.[0]?.toUpperCase();
  return {BF16: 'bfloat16', F16: 'float16', F32: 'float32', F64: 'float64', F8_E4M3: '8-bit float (FP8)'}[top] || top || null;
}

// Which layers keep a growing attention cache. Linear, state-space and convolution layers keep a fixed-size state instead.
function layoutOf(c, layers, context) {
  if (!c || !layers) return null;
  const out = {full: layers, window: 0, windowSize: null, other: 0, otherKind: null, unknown: false};
  const sw = typeof c.sliding_window === 'number' && c.use_sliding_window !== false && c.sliding_window < (context || Infinity) ? c.sliding_window : null;
  const kinds = Array.isArray(c.layer_types) ? c.layer_types : Array.isArray(c.mixer_types) ? c.mixer_types : null;
  if (kinds) {
    const full = kinds.filter(k => /^(full_attention|attention|minicpm4)$/.test(k)).length, window = kinds.filter(k => k === 'sliding_attention').length;
    const mlp = kinds.filter(k => k === 'mlp').length;
    const otherKinds = [...new Set(kinds.filter(k => !/attention$|^minicpm4$|^mlp$/.test(k)))];
    Object.assign(out, {full, window, windowSize: window ? c.sliding_window : null, other: kinds.length - full - window - mlp, otherKind: otherKinds.map(k => k.replace(/-attn$/, ' attention').replace(/^conv$/, 'convolution')).join(', ') || null});
    return out;
  }
  if (Array.isArray(c.full_attn_idxs)) return {...out, full: c.full_attn_idxs.length, other: layers - c.full_attn_idxs.length, otherKind: 'convolution'};
  if (typeof c.hybrid_override_pattern === 'string') {
    const p = c.hybrid_override_pattern;
    return {...out, full: (p.match(/\*/g) || []).length, other: (p.match(/M/g) || []).length, otherKind: 'Mamba'};
  }
  if (c.attn_layer_period) {
    const full = Array.from({length: layers}, (_, i) => i % c.attn_layer_period === c.attn_layer_offset).filter(Boolean).length;
    return {...out, full, other: layers - full, otherKind: 'Mamba'};
  }
  if (c.layer_group_size || c.model_type === 'bailing_hybrid') return {...out, unknown: true};
  if (sw) return {...out, full: 0, window: layers, windowSize: sw};
  return out;
}
const MECH = {MHA: 'mha', GQA: 'gqa', MQA: 'gqa', MLA: 'mla'};
function mechanismsOf(a) {
  const ids = [];
  if (MECH[a.attention]) ids.push(MECH[a.attention]);
  if (a.layout?.window) ids.push('window');
  if (a.experts) ids.push('moe');
  if (/Mamba/.test(a.layout?.otherKind || '')) ids.push('statespace');
  if (/convolution/.test(a.layout?.otherKind || '')) ids.push('convolution');
  if (/lightning/.test(a.layout?.otherKind || '')) ids.push('linear', 'sparse');
  if (a.qkNorm) ids.push('qknorm');
  if (a.ropeTheta) ids.push('position');
  return ids;
}
function familyOf(a) {
  const hybrid = !!a.layout?.other || !!a.layout?.unknown, moe = !!a.experts;
  return hybrid ? (moe ? 'hybrid-moe' : 'dense-hybrid') : moe ? 'sparse-moe' : 'dense';
}
// Facts the publisher states in the repository card metadata and tags.
function cardFacts(r, info) {
  const c = info?.cardData || r.cardData || {}, tags = info?.tags || r.tags || [], name = r.id.split('/')[1];
  const list = v => v == null ? [] : (Array.isArray(v) ? v : [v]).map(String);
  const purpose = /coder|starcoder|code/i.test(name) ? 'code' : /-R1|reason|thinking|-RL\b|Orchestrator/i.test(name) ? 'reasoning' : /-fc-|xLAM|function/i.test(name) ? 'tools'
    : /instruct|chat|-it\b|zephyr|hermes|ChatQA/i.test(name) || tags.includes('conversational') ? 'instruct' : 'base';
  return {
    purpose, languages: list(c.language), baseModel: list(c.base_model)[0] || null,
    papers: [...new Set(tags.filter(t => t.startsWith('arxiv:')).map(t => t.slice(6)))].slice(0, 6),
    datasets: tags.filter(t => t.startsWith('dataset:')).map(t => t.slice(8)).slice(0, 8), library: info?.library_name || r.library_name || null,
  };
}
const rows = selected.map((r, index) => {
  const cached = JSON.parse(fs.readFileSync(path.join(dir, 'repos', `${r.id.replace('/', '__')}.json`), 'utf8'));
  const {info, config} = cached, key = licenseKey(r), flags = [];
  if (!key || !rules[key]) throw Error(`No licence rule for ${r.id}`);
  const params = r.safetensors.total, bytes = weights(info?.siblings);
  const cfg = config ? {...config, ...(config.text_config || {}), ...(config.llm_config || {})} : null;
  const hidden = pick(config, 'hidden_size', 'd_model', 'n_embd'), layers = pick(config, 'num_hidden_layers', 'n_layer', 'num_layers', 'n_layers');
  const heads = pick(config, 'num_attention_heads', 'n_head', 'n_heads'), kvHeads = pick(config, 'num_key_value_heads') ?? (cfg?.multi_query_attention ? 1 : heads);
  const context = pick(config, 'max_position_embeddings', 'n_positions', 'max_sequence_length');
  const headDim = pick(config, 'head_dim') ?? (hidden && heads ? Math.floor(hidden / heads) : null);
  const layout = layoutOf(cfg, layers, context);
  const perLayer = kvHeads && headDim ? 2 * kvHeads * headDim * 2 / 1024 : null;
  const cacheKiB = perLayer && layout && !layout.unknown ? +(perLayer * (layout.full + layout.window)).toFixed(1) : null;
  const cache = perLayer && layout && !layout.unknown ? {perLayerKiB: +perLayer.toFixed(3), fullLayers: layout.full, windowLayers: layout.window, window: layout.windowSize} : null;
  const experts = pick(config, 'num_local_experts', 'num_experts', 'n_routed_experts');
  const architecture = cfg ? {
    class: (cfg.architectures || [])[0] || null, attention: !kvHeads || !heads ? null : cfg.kv_lora_rank ? 'MLA' : kvHeads === heads ? 'MHA' : kvHeads === 1 ? 'MQA' : 'GQA',
    headDim, vocab: pick(config, 'vocab_size', 'embedding_size'), intermediate: pick(config, 'intermediate_size', 'mlp_hidden_size'), tied: typeof (cfg.tie_word_embeddings ?? cfg.weight_tying) === 'boolean' ? (cfg.tie_word_embeddings ?? cfg.weight_tying) : null,
    ropeTheta: pick(config, 'rope_theta') ?? cfg.rope_parameters?.rope_theta ?? null, activation: cfg.hidden_act || cfg.activation_type || null,
    experts: experts && experts > 1 ? experts : null, expertsActive: experts && experts > 1 ? pick(config, 'num_experts_per_tok', 'moe_topk') : null,
    qkNorm: !!(cfg.use_qk_norm || cfg.qk_norm), layout,
  } : null;
  if (!config) flags.push(r.gated ? 'Configuration requires accepting the publisher\'s access terms.' : 'No readable config.json in the official repository.');
  if (config && !cacheKiB) flags.push(layout?.unknown ? 'The configuration describes a hybrid layer design this tool cannot read, so the attention cache is not estimated.' : 'Attention cache could not be calculated from the configuration.');
  if (layout && layout.other) flags.push(`${layout.other} of ${layers} layers are ${layout.otherKind} layers with a fixed-size state; they are not counted in the attention cache.`);
  if (context && context > 1e8) flags.push('The configuration does not state a usable context limit.');
  const short = r.id.split('/')[1], modelType = config?.model_type || null;
  return {
    rank: index + 1, id: r.id.replace('/', '--'), name: short, repo: r.id, url: `https://huggingface.co/${r.id}`, publisher: r.publisher,
    params, weightGiB: bytes ? +(bytes / GiB).toFixed(2) : +(params * 2 / GiB).toFixed(2), weightEstimated: !bytes,
    tier: params < 1e9 ? 'nano' : params < 4e9 ? 'small' : 'medium',
    context: context && context <= 1e8 ? context : null, layers, hiddenSize: hidden, heads, kvHeads, kvKiBPerToken: cacheKiB, cache, modelType, architecture,
    family: architecture ? familyOf(architecture) : null, mechanisms: architecture ? mechanismsOf(architecture) : [], ...cardFacts(r, info),
    configUrl: config ? `https://huggingface.co/${r.id}/blob/${info.sha}/config.json` : null,
    precision: precision(r.safetensors.parameters), downloads30d: r.downloads, likes: r.likes, score: +r.score.toFixed(3),
    released: r.createdAt?.slice(0, 10) ?? null, updated: (r.lastModified || info?.lastModified)?.slice(0, 10) ?? null, revision: info?.sha || r.sha,
    gated: r.gated && r.gated !== false ? String(r.gated) : null, galleryModelId: galleryByRepo.get(r.id.toLowerCase()) || null,
    license: {key, url: `https://huggingface.co/${r.id}/tree/${info?.sha || 'main'}`}, flags,
  };
});
fs.writeFileSync(outFile, JSON.stringify({
  generatedOn: '2026-11-24',
  method: {minParams: 5e7, maxParams: 1e10, releasedFrom: '2023-07-01', perPublisher: 12, total: 100, publishersSearched: 57},
  models: rows,
}, null, 1) + '\n');
const count = f => rows.filter(f).length;
const commercial = {};
rows.forEach(x => { const c = rules[x.license.key].commercial; commercial[c] = (commercial[c] || 0) + 1; });
console.log({models: rows.length, nano: count(x => x.tier === 'nano'), small: count(x => x.tier === 'small'), medium: count(x => x.tier === 'medium'), withConfig: count(x => x.hiddenSize), inGallery: count(x => x.galleryModelId), gated: count(x => x.gated), commercial});
