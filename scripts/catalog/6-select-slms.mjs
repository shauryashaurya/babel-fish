// Usage: node scripts/catalog/6-select-slms.mjs <dir-with-raw.json>
// Picks the top 100 small language model candidates and downloads their official config and file sizes.
import fs from 'node:fs';
import path from 'node:path';

export const RULES = {minParams: 5e7, maxParams: 1e10, releasedFrom: '2023-07-01', perPublisher: 12, total: 100};
const dir = process.argv[2];
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'raw.json'), 'utf8'));
const NOT_A_GENERAL_SLM = /gguf|onnx|mlx|awq|gptq|exl2|openvino|litert|tflite|ct2|quantized|-int4|-int8|-4bit|-8bit|fp8|fp4|nvfp|tiny-random|guard|shield|embed|rerank|safety|ocr|tts|asr|speech|whisper|vision|-vl|video|audio|sae|scope|lora|draft|test|dummy|dspark|fastvlm|minicpm-v|maira|txgemma|medgemma|diffusion/i;
const owners = new Set(['meta-llama', 'Qwen', 'mistralai', 'google', 'microsoft', 'deepseek-ai']);
const shortName = id => id.split('/')[1];
const family = id => shortName(id).toLowerCase()
  .replace(/^meta-/, '')
  .replace(/[-_.]?(instruct|chat|base|hf|it|pt|preview|sft|dpo|rl|think|thinking|reasoning|cot|fc|1m|4k|8k|128k|2k)\b/g, '')
  .replace(/[-_]\d{4,6}\b/g, '')
  .replace(/[-_.]v\d+(\.\d+)?$/g, '')
  .replace(/-+$/, '');
const unique = [...new Map(raw.map(r => [r.id, r])).values()];
const eligible = unique.filter(r => {
  const params = r.safetensors?.total, tags = (r.tags || []).join(' ');
  return params >= RULES.minParams && params <= RULES.maxParams && r.pipeline_tag === 'text-generation'
    && !NOT_A_GENERAL_SLM.test(r.id) && !/gguf|onnx|mlx|quantized/i.test(tags) && r.createdAt >= RULES.releasedFrom;
});
// Re-uploads of the same model under another account are dropped in favour of the original publisher.
const mirrors = new Map();
for (const r of eligible) {
  const key = shortName(r.id).toLowerCase().replace(/^meta-/, ''), held = mirrors.get(key), isOwner = owners.has(r.id.split('/')[0]);
  if (!held || (isOwner && !owners.has(held.id.split('/')[0])) || (isOwner === owners.has(held.id.split('/')[0]) && r.downloads > held.downloads)) mirrors.set(key, r);
}
const score = r => Math.log10((r.downloads || 0) + 1) + Math.log10((r.likes || 0) + 1);
const families = new Map();
for (const r of [...mirrors.values()].sort((a, b) => b.downloads - a.downloads)) {
  const key = `${r.publisher}:${family(r.id)}`;
  if (!families.has(key)) families.set(key, r);
}
const perPublisher = {};
const selected = [...families.values()].sort((a, b) => score(b) - score(a)).filter(r => {
  perPublisher[r.publisher] = (perPublisher[r.publisher] || 0) + 1;
  return perPublisher[r.publisher] <= RULES.perPublisher;
}).slice(0, RULES.total);

const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, {headers: {'User-Agent': 'catalog-fetch'}});
      if (r.status === 429 || r.status >= 500) { await wait(2500 * (attempt + 1)); continue; }
      if (!r.ok) return null;
      const text = await r.text();
      if (!json) return text;
      // Some published configs contain bare Infinity or NaN, which is not valid JSON.
      try { return JSON.parse(text.replace(/:\s*-?(Infinity|NaN)\b/g, ': null').replace(/([\[,]\s*)-?(Infinity|NaN)\b/g, '$1null')); } catch { return null; }
    } catch { await wait(1500 * (attempt + 1)); }
  }
  return null;
}
const cacheDir = path.join(dir, 'repos');
fs.mkdirSync(cacheDir, {recursive: true});
let next = 0;
async function worker() {
  while (next < selected.length) {
    const r = selected[next++], file = path.join(cacheDir, r.id.replace('/', '__') + '.json');
    if (fs.existsSync(file)) continue;
    const info = await get(`https://huggingface.co/api/models/${r.id}?blobs=true`, true);
    const config = info ? await get(`https://huggingface.co/${r.id}/resolve/${info.sha}/config.json`, true) : null;
    const names = (info?.siblings || []).map(s => s.rfilename).filter(n => /^(LICEN[SC]E|USE_POLICY)[^/]*$/i.test(n) && !/\.pdf$/i.test(n));
    let license = '';
    for (const n of names) { const text = await get(`https://huggingface.co/${r.id}/resolve/${info.sha}/${encodeURIComponent(n)}`, false); if (text) license += `\n=====${n}=====\n${text}`; }
    fs.writeFileSync(file, JSON.stringify({info, config, license}));
    await wait(150);
  }
}
await Promise.all([worker(), worker(), worker()]);
fs.writeFileSync(path.join(dir, 'selected.json'), JSON.stringify(selected.map(r => ({...r, score: score(r)}))));
const keyOf = r => { const c = r.cardData || {}; const l = c.license_name || c.license || (r.tags || []).find(t => t.startsWith('license:'))?.slice(8) || '(none)'; return Array.isArray(l) ? l.join('+') : l; };
const groups = {};
selected.forEach(r => (groups[keyOf(r)] ||= []).push(r.id));
console.log({eligible: eligible.length, afterMirrors: mirrors.size, families: families.size, selected: selected.length});
console.log(Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${String(v.length).padStart(3)} ${k}: ${v.slice(0, 3).join(', ')}`).join('\n'));
const counts = {};
selected.forEach(r => counts[r.publisher] = (counts[r.publisher] || 0) + 1);
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
console.log(selected.map((r, i) => `${i + 1}.${r.id}`).join(' '));
