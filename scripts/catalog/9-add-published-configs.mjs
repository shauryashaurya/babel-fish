// Usage: node scripts/catalog/9-add-published-configs.mjs
// Fills architecture figures for models whose Hugging Face config.json is gated, from data/catalog/published_configs.json.
// Each entry must reproduce the checkpoint's parameter count within 1.5%, or the script stops without writing.
// Runs offline and is safe to repeat: it only fills models that have no configuration of their own.
import fs from 'node:fs';

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const published = read('data/catalog/published_configs.json');
const slmFile = 'data/catalog/slm_candidates.json', galleryFile = 'data/catalog/models.json';
const slmData = read(slmFile), gallery = read(galleryFile);
const byRepo = new Map(published.configs.flatMap(e => e.repos.map(r => [r.toLowerCase(), e])));
const GATED = 'Configuration requires accepting the publisher\'s access terms.';
const FROM_PUBLISHED = 'The Hugging Face configuration requires accepting the publisher\'s access terms, so the architecture figures come from the public sources listed under Sources.';

/** Layer kinds, one per layer, from a repeating pattern (layer i uses pattern[i % length]). */
const kindsOf = c => c.layer_pattern ? Array.from({length: c.num_hidden_layers}, (_, i) => c.layer_pattern[i % c.layer_pattern.length]) : null;
function layoutOf(c) {
  const kinds = kindsOf(c), layers = c.num_hidden_layers;
  if (!kinds) return {full: layers, window: 0, windowSize: null, other: 0, otherKind: null, unknown: false};
  const window = kinds.filter(k => k === 'sliding_attention').length;
  return {full: layers - window, window, windowSize: window ? c.sliding_window : null, other: 0, otherKind: null, unknown: false};
}
/** Weights in the embedding, attention and feed-forward matrices (norms are a rounding error). */
function paramCount(c) {
  const h = c.hidden_size, d = c.head_dim;
  const attention = h * c.num_attention_heads * d * 2 + h * c.num_key_value_heads * d * 2;
  return c.vocab_size * h * (c.tie_word_embeddings ? 1 : 2) + c.num_hidden_layers * (attention + 3 * h * c.intermediate_size);
}
const perLayerKiB = c => 2 * c.num_key_value_heads * c.head_dim * 2 / 1024;
const attentionOf = c => c.num_key_value_heads === c.num_attention_heads ? 'MHA' : c.num_key_value_heads === 1 ? 'MQA' : 'GQA';
const sourceOf = e => ({sources: e.sources, note: e.note, retrievedOn: published.retrievedOn});
const errors = [], report = [];
function check(e, name, params) {
  const counted = paramCount(e.config), off = Math.abs(counted - params) / params;
  report.push([name, (counted / 1e9).toFixed(3) + 'B', (params / 1e9).toFixed(3) + 'B', (off * 100).toFixed(2) + '%']);
  if (off > 0.015) errors.push(`${name}: figures give ${counted}, checkpoint has ${params}`);
}

let slmCount = 0;
for (const s of slmData.models) {
  const e = byRepo.get(s.repo.toLowerCase());
  if (!e || (s.layers && !s.configSource)) continue;
  const c = e.config, layout = layoutOf(c), per = perLayerKiB(c);
  check(e, s.repo, s.params);
  const architecture = {
    class: null, attention: attentionOf(c), headDim: c.head_dim, vocab: c.vocab_size, intermediate: c.intermediate_size, tied: c.tie_word_embeddings,
    ropeTheta: c.rope_theta, activation: c.hidden_act, experts: null, expertsActive: null, qkNorm: !!c.qk_norm, layout,
  };
  const mech = [architecture.attention === 'MHA' ? 'mha' : 'gqa'];
  if (layout.window) mech.push('window');
  if (c.qk_norm) mech.push('qknorm');
  mech.push('position');
  Object.assign(s, {
    context: s.context ?? c.max_position_embeddings ?? null,
    layers: c.num_hidden_layers, hiddenSize: c.hidden_size, heads: c.num_attention_heads, kvHeads: c.num_key_value_heads,
    kvKiBPerToken: +(per * (layout.full + layout.window)).toFixed(1),
    cache: {perLayerKiB: +per.toFixed(3), fullLayers: layout.full, windowLayers: layout.window, window: layout.windowSize},
    architecture, family: 'dense', mechanisms: mech, configSource: sourceOf(e),
    flags: [...s.flags.filter(f => f !== GATED && f !== FROM_PUBLISHED), FROM_PUBLISHED],
  });
  slmCount++;
}

let galleryCount = 0;
for (const m of gallery.models) {
  const o = m.official, e = o && byRepo.get(o.repo.toLowerCase());
  if (!e || (o.layers && !o.configSource)) continue;
  const c = e.config, layout = layoutOf(c), per = perLayerKiB(c);
  check(e, o.repo, o.checkpointParams ?? m.totalParams);
  const total = per * (layout.full + layout.window);
  Object.assign(o, {hiddenSize: c.hidden_size, layers: c.num_hidden_layers, heads: c.num_attention_heads, kvHeads: c.num_key_value_heads, vocab: c.vocab_size, configSource: sourceOf(e)});
  o.details = {
    headDim: c.head_dim, headDimStated: true, globalHeadDim: null, globalKvHeads: null, sharedKv: null,
    intermediate: c.intermediate_size, moeIntermediate: null, sharedIntermediate: null, activation: c.hidden_act, norm: c.norm, tied: c.tie_word_embeddings,
    rope: {theta: c.rope_theta, type: c.rope_type ?? null, factor: null, original: null, partial: null, localTheta: c.rope_local_theta ?? null},
    qkNorm: c.qk_norm ? true : null, attentionBias: null, logitSoftcap: c.final_logit_softcapping ?? null, attnSoftcap: c.attn_logit_softcapping ?? null,
    qLoraRank: null, ropeHeadDim: null, mtp: null, layout, ffn: {dense: c.num_hidden_layers, moe: 0},
    cache: {method: 'standard', fullKiB: +per.toFixed(3), windowKiB: +per.toFixed(3), totalKiB: +total.toFixed(2),
      agrees: !!m.kvKiBPerToken && Math.abs(total - m.kvKiBPerToken) / m.kvKiBPerToken <= 0.03},
  };
  if (!o.details.cache.agrees) errors.push(`${m.id}: cache ${total} KiB per token, gallery states ${m.kvKiBPerToken}`);
  m.flags = [...m.flags.filter(f => f !== GATED && f !== FROM_PUBLISHED), FROM_PUBLISHED];
  galleryCount++;
}

for (const r of report) console.log(r.join('\t'));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
fs.writeFileSync(slmFile, JSON.stringify(slmData, null, 1) + '\n');
fs.writeFileSync(galleryFile, JSON.stringify(gallery, null, 1) + '\n');
console.log({smallModels: slmCount, galleryModels: galleryCount});
