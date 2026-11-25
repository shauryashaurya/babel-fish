// Usage: node scripts/catalog/8-add-config-details.mjs <hf-cache-dir>
// Adds layer-level facts from each gallery model's official config.json (the cached copy at the pinned revision)
// to data/catalog/models.json as official.details. Only values the configuration states are recorded.
import fs from 'node:fs';
import path from 'node:path';

const [,, hfDir] = process.argv;
const file = 'data/catalog/models.json';
const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(hfDir, 'index.json'), 'utf8'));
const slugByRepo = new Map(index.filter(x => x.repo).map(x => [x.repo.toLowerCase(), x.slug]));
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const num = v => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

// The decoder settings, wherever the configuration nests them.
const flatten = c => ({...c, ...(c.llm_config || {}), ...(c.language_config || {}), ...(c.text_config || {})});
const first = (c, ...keys) => { for (const k of keys) if (num(c[k]) != null) return c[k]; return null; };

function ropeOf(c) {
  const p = c.rope_parameters, s = c.rope_scaling;
  const full = p && typeof p === 'object' ? (p.full_attention || p) : null, local = p?.sliding_attention || null;
  const theta = num(c.rope_theta) ?? num(full?.rope_theta);
  const scaling = s && typeof s === 'object' ? s : full;
  const type = scaling?.rope_type || scaling?.type || null;
  const partial = num(c.partial_rotary_factor) ?? num(full?.partial_rotary_factor);
  if (!theta && !type) return null;
  return {
    theta, type: type && type !== 'default' ? type : null, factor: num(scaling?.factor),
    original: num(scaling?.original_max_position_embeddings), partial: partial && partial < 1 ? partial : null,
    localTheta: num(local?.rope_theta) ?? num(c.rope_local_base_freq) ?? num(c.swa_rope_theta),
  };
}

function layoutOf(c, layers) {
  const out = {full: layers, window: 0, windowSize: null, other: 0, otherKind: null, unknown: false};
  const sw = num(c.sliding_window) ?? num(c.sliding_window_size);
  const kinds = Array.isArray(c.layer_types) ? c.layer_types : Array.isArray(c.mixer_types) ? c.mixer_types : null;
  if (kinds && kinds.length === layers) {
    const full = kinds.filter(k => /^(full_attention|attention|full|global)$/.test(k)).length;
    const window = kinds.filter(k => /^(sliding_attention|sliding|local|swa)$/.test(k)).length;
    const other = kinds.length - full - window;
    const otherKinds = [...new Set(kinds.filter(k => !/^(full_attention|attention|full|global|sliding_attention|sliding|local|swa)$/.test(k)))];
    return {...out, full, window, windowSize: window ? sw : null, other, otherKind: otherKinds.map(k => k.replace(/_/g, ' ').replace(/-attn$/, ' attention').replace(/^conv$/, 'convolution')).join(', ') || null};
  }
  if (typeof c.hybrid_override_pattern === 'string') {
    const p = c.hybrid_override_pattern, attn = (p.match(/\*/g) || []).length, mamba = (p.match(/M/g) || []).length;
    return {...out, full: attn, other: mamba, otherKind: 'Mamba'};
  }
  if (c.linear_attn_config && Array.isArray(c.linear_attn_config.full_attn_layers)) {
    const full = c.linear_attn_config.full_attn_layers.length;
    return {...out, full, other: layers - full, otherKind: c.linear_attn_config.kda_layers ? 'KDA linear attention' : 'linear attention'};
  }
  if (num(c.full_attention_interval)) {
    const full = Math.floor(layers / c.full_attention_interval);
    return {...out, full, other: layers - full, otherKind: 'linear attention'};
  }
  if (c.attn_layer_period) {
    const full = Array.from({length: layers}, (_, i) => i % c.attn_layer_period === (c.attn_layer_offset ?? 0)).filter(Boolean).length;
    return {...out, full, other: layers - full, otherKind: 'Mamba'};
  }
  if (c.layer_group_size || c.attn_type_list || c.linear_attn_config) return {...out, unknown: true};
  if (sw && c.use_sliding_window !== false && sw < (num(c.max_position_embeddings) ?? Infinity)) return {...out, full: 0, window: layers, windowSize: sw};
  return out;
}

function ffnOf(c, layers, experts) {
  if (!experts) return {dense: layers, moe: 0};
  if (Array.isArray(c.mlp_layer_types) && c.mlp_layer_types.length === layers) {
    const dense = c.mlp_layer_types.filter(k => /dense|mlp/.test(k)).length;
    return {dense, moe: layers - dense};
  }
  if (Array.isArray(c.mlp_only_layers) && c.mlp_only_layers.length) return {dense: c.mlp_only_layers.length, moe: layers - c.mlp_only_layers.length};
  const firstDense = num(c.first_k_dense_replace) ?? 0;
  const freq = num(c.moe_layer_freq) ?? num(c.decoder_sparse_step) ?? 1;
  const moe = Array.from({length: layers}, (_, i) => i >= firstDense && (i - firstDense) % freq === 0).filter(Boolean).length;
  return {dense: layers - moe, moe};
}

// Bytes kept per token in each attention layer at 16-bit precision, from the configured head counts and sizes.
function cacheOf(c, layout, heads, kvHeads, headDim) {
  if (!layout || layout.unknown) return null;
  const KiB = 1024;
  if (num(c.kv_lora_rank)) {
    const per = (c.kv_lora_rank + (num(c.qk_rope_head_dim) ?? 0)) * 2 / KiB;
    return {method: 'latent', fullKiB: +per.toFixed(3), windowKiB: +per.toFixed(3)};
  }
  if (!kvHeads || !headDim) return null;
  const windowKiB = 2 * (num(c.swa_num_key_value_heads) ?? kvHeads) * (num(c.swa_head_dim) ?? headDim) * 2 / KiB;
  const globalKv = num(c.num_global_key_value_heads) ?? kvHeads, globalDim = num(c.global_head_dim) ?? headDim;
  const fullKiB = (c.attention_k_eq_v ? 1 : 2) * globalKv * globalDim * 2 / KiB;
  return {method: c.attention_k_eq_v ? 'shared-kv' : 'standard', fullKiB: +fullKiB.toFixed(3), windowKiB: +windowKiB.toFixed(3)};
}

let added = 0;
const report = [];
for (const m of catalog.models) {
  const slug = m.official?.repo && slugByRepo.get(m.official.repo.toLowerCase());
  const raw = slug && read(path.join(hfDir, slug, 'config.json'));
  if (!raw) { if (m.official) m.official.details = null; continue; }
  const c = flatten(raw);
  const layers = num(m.official.layers) ?? first(c, 'num_hidden_layers', 'n_layer', 'num_layers');
  const heads = num(m.official.heads), kvHeads = num(m.official.kvHeads) ?? heads, hidden = num(m.official.hiddenSize);
  // Latent attention states its query/key head as a non-rotary part plus a rotary part.
  const latentHead = num(c.kv_lora_rank) && num(c.qk_nope_head_dim) ? c.qk_nope_head_dim + (num(c.qk_rope_head_dim) ?? 0) : null;
  const statedHead = num(c.head_dim) ?? num(c.qk_head_dim) ?? latentHead;
  const headDim = statedHead ?? (hidden && heads ? Math.floor(hidden / heads) : null);
  const experts = num(m.official.experts);
  const layout = layers ? layoutOf(c, layers) : null;
  const cache = cacheOf(c, layout, heads, kvHeads, headDim);
  const norm = c.rms_norm_eps != null ? 'RMSNorm' : c.layer_norm_epsilon != null || c.layer_norm_eps != null ? 'LayerNorm' : null;
  const tied = typeof c.tie_word_embeddings === 'boolean' ? c.tie_word_embeddings : null;
  const details = {
    headDim, headDimStated: statedHead != null,
    globalHeadDim: num(c.global_head_dim), globalKvHeads: num(c.num_global_key_value_heads), sharedKv: c.attention_k_eq_v === true || null,
    intermediate: first(c, 'intermediate_size', 'ffn_hidden_size', 'mlp_hidden_size', 'n_inner'),
    moeIntermediate: experts ? first(c, 'moe_intermediate_size', 'expert_intermediate_size') : null,
    sharedIntermediate: experts ? first(c, 'shared_expert_intermediate_size', 'moe_shared_expert_intermediate_size') : null,
    activation: c.hidden_act || c.hidden_activation || c.activation_function || c.activation || null,
    norm, tied, rope: ropeOf(c),
    qkNorm: c.use_qk_norm === true || c.qk_norm === true || c.qk_layernorm === true ? true : null,
    attentionBias: typeof c.attention_bias === 'boolean' ? c.attention_bias : null,
    logitSoftcap: num(c.final_logit_softcapping), attnSoftcap: num(c.attn_logit_softcapping),
    qLoraRank: num(c.q_lora_rank), ropeHeadDim: num(c.qk_rope_head_dim),
    mtp: num(c.num_nextn_predict_layers) ?? num(c.mtp_num_hidden_layers),
    layout, ffn: layers ? ffnOf(c, layers, experts) : null, cache,
  };
  // The per-layer split is used only where it reproduces the gallery's published per-token figure.
  if (cache && layout) {
    const total = cache.fullKiB * layout.full + cache.windowKiB * layout.window;
    cache.totalKiB = +total.toFixed(2);
    cache.agrees = !!m.kvKiBPerToken && total > 0 && Math.abs(total - m.kvKiBPerToken) / m.kvKiBPerToken <= 0.03;
  }
  m.official.details = details;
  added++;
  if (cache && layout) {
    report.push([m.id, m.kvKiBPerToken, cache.totalKiB, `${layout.full}f/${layout.window}w/${layout.other}o`, cache.method, cache.agrees]);
  } else report.push([m.id, m.kvKiBPerToken, null, layout?.unknown ? 'unknown' : 'no-cache', null]);
}
fs.writeFileSync(file, JSON.stringify(catalog, null, 1) + '\n');
console.log({models: catalog.models.length, withDetails: added});
for (const r of report) console.log(r.join('\t'));
