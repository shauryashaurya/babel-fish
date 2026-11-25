import fs from 'node:fs'; import path from 'node:path';
const [,, liveFile, pagesDir, outDir] = process.argv; fs.mkdirSync(outDir,{recursive:true});
const live=JSON.parse(fs.readFileSync(liveFile,'utf8'));
const dec=s=>s.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const UA={'User-Agent':'catalog-fetch'}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){ for(let a=0;a<5;a++){ try{ const r=await fetch(url,{headers:UA,redirect:'follow'}); if(r.status===429||r.status>=500){await wait(2500*(a+1));continue;} return {status:r.status,text:r.ok?await r.text():''}; }catch{await wait(1500*(a+1));} } return {status:0,text:''}; }
const index=[]; for(const m of live){ const h=fs.readFileSync(path.join(pagesDir,m.slug+'.html'),'utf8');
 const facts={}; for(const x of h.matchAll(/data-fact-key="([^"]+)">\s*<dt[^>]*>[\s\S]*?<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) facts[x[1]]=dec(x[2]);
 const links=[...new Set([...h.matchAll(/href="(https:\/\/huggingface\.co\/[^"]+)"/g)].map(x=>x[1]))];
 const repoOf=u=>u.match(/huggingface\.co\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/)?.[1];
 const cfg=links.find(u=>/\/(blob|resolve|raw)\/[^/]+\/config\.json/.test(u)); const lic=links.find(u=>/\/LICEN[SC]E/i.test(u));
 const repos=[...new Set(links.map(repoOf).filter(Boolean))].filter(r=>!/^(docs|blog|spaces|datasets|papers)\//.test(r));
 const repo=(cfg&&repoOf(cfg))||(lic&&repoOf(lic))||repos[0]||null;
 const others=[...new Set([...h.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(x=>x[1]))].filter(u=>!/sebastianraschka|huggingface\.co|twitter|linkedin|substack|bsky|\/\/x\.com|amazon|manning|youtube|google|github\.com\/rasbt|artificialanalysis/.test(u));
 index.push({...m,facts,repo,repoCandidates:repos,officialLinks:others}); }
fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify(index,null,1));
let i=0; const log=[];
async function worker(){ while(i<index.length){ const m=index[i++]; if(!m.repo){log.push({slug:m.slug,status:'no-repo'});continue;}
 const d=path.join(outDir,m.slug); fs.mkdirSync(d,{recursive:true}); const inf=path.join(d,'info.json');
 if(!fs.existsSync(inf)){ const r=await get(`https://huggingface.co/api/models/${m.repo}?blobs=true`); if(r.status!==200){log.push({slug:m.slug,repo:m.repo,status:'info-'+r.status});continue;} fs.writeFileSync(inf,r.text); }
 const info=JSON.parse(fs.readFileSync(inf,'utf8')); const rev=info.sha; const res={slug:m.slug,repo:m.repo,gated:info.gated};
 for(const name of ['config.json','README.md']){ const f=path.join(d,name); if(fs.existsSync(f)){res[name]=200;continue;} const r=await get(`https://huggingface.co/${m.repo}/resolve/${rev}/${name}`); res[name]=r.status; if(r.status===200)fs.writeFileSync(f,r.text); await wait(120);} log.push(res); await wait(200);} }
await Promise.all([worker(),worker(),worker()]);
fs.writeFileSync(path.join(outDir,'fetch-log.json'),JSON.stringify(log,null,1));
const c=k=>log.filter(x=>x[k]===200).length;
console.log({total:index.length,withRepo:index.filter(x=>x.repo).length,info:log.filter(x=>x.gated!==undefined).length,config:c('config.json'),readme:c('README.md'),gated:log.filter(x=>x.gated&&x.gated!==false).map(x=>x.slug)});
console.log('PROBLEMS',JSON.stringify(log.filter(x=>x.gated===undefined||x['config.json']!==200||x['README.md']!==200)));
