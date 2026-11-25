// Usage: node scripts/catalog/5-fetch-slm-candidates.mjs <output-dir>
// Lists text-generation models from official publisher accounts on Hugging Face.
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
fs.mkdirSync(outDir, {recursive: true});
const publishers = {
  'microsoft': 'Microsoft', 'google': 'Google', 'meta-llama': 'Meta', 'facebook': 'Meta', 'Qwen': 'Alibaba Cloud', 'mistralai': 'Mistral AI',
  'HuggingFaceTB': 'Hugging Face', 'allenai': 'Ai2', 'ibm-granite': 'IBM', 'nvidia': 'NVIDIA', 'LiquidAI': 'Liquid AI', 'deepseek-ai': 'DeepSeek',
  'tiiuae': 'TII', 'stabilityai': 'Stability AI', 'apple': 'Apple', 'openbmb': 'OpenBMB', 'zai-org': 'Z.ai', 'THUDM': 'Z.ai', 'baidu': 'Baidu', 'tencent': 'Tencent',
  'CohereLabs': 'Cohere', 'ai21labs': 'AI21 Labs', 'Snowflake': 'Snowflake', 'databricks': 'Databricks', 'EleutherAI': 'EleutherAI', 'upstage': 'Upstage',
  'naver-hyperclovax': 'NAVER', 'LGAI-EXAONE': 'LG AI Research', 'MiniMaxAI': 'MiniMax', 'moonshotai': 'Moonshot AI', 'inclusionAI': 'InclusionAI', 'XiaomiMiMo': 'Xiaomi',
  'BAAI': 'BAAI', 'internlm': 'Shanghai AI Lab', 'sarvamai': 'Sarvam AI', 'arcee-ai': 'Arcee AI', 'PrimeIntellect': 'Prime Intellect', 'openai': 'OpenAI',
  'NousResearch': 'Nous Research', 'togethercomputer': 'Together AI', 'mosaicml': 'MosaicML', 'cerebras': 'Cerebras', 'bigcode': 'BigCode', 'Salesforce': 'Salesforce',
  'JetBrains': 'JetBrains', 'Nanbeige': 'BOSS Zhipin', 'NXAI': 'NXAI', 'Zyphra': 'Zyphra', 'stepfun-ai': 'StepFun', 'rednote-hilab': 'Xiaohongshu', 'ByteDance-Seed': 'ByteDance',
  'utter-project': 'UTTER', 'swiss-ai': 'Swiss AI', 'aisingapore': 'AI Singapore', 'sapienzanlp': 'Sapienza NLP', 'OpenLLM-France': 'OpenLLM France', 'BSC-LT': 'Barcelona Supercomputing Center',
};
const fields = ['downloads', 'likes', 'safetensors', 'createdAt', 'lastModified', 'gated', 'cardData', 'tags', 'pipeline_tag', 'sha', 'library_name'];
const query = fields.map(f => `expand[]=${f}`).join('&');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, {headers: {'User-Agent': 'catalog-fetch'}});
      if (r.status === 429 || r.status >= 500) { await wait(2500 * (attempt + 1)); continue; }
      return r.ok ? r.json() : [];
    } catch { await wait(1500 * (attempt + 1)); }
  }
  return null;
}
const all = [], failed = [];
const orgs = Object.keys(publishers);
let next = 0;
async function worker() {
  while (next < orgs.length) {
    const org = orgs[next++];
    const rows = await get(`https://huggingface.co/api/models?author=${org}&filter=text-generation&sort=downloads&direction=-1&limit=120&${query}`);
    if (!rows) { failed.push(org); continue; }
    for (const row of rows) all.push({...row, publisher: publishers[org]});
    await wait(200);
  }
}
await Promise.all([worker(), worker(), worker()]);
fs.writeFileSync(path.join(outDir, 'raw.json'), JSON.stringify(all));
console.log({organizations: orgs.length, listed: all.length, failed});
