import fs from 'node:fs'; import path from 'node:path';
const [,, liveFile, outDir] = process.argv; fs.mkdirSync(outDir,{recursive:true});
const live=JSON.parse(fs.readFileSync(liveFile,'utf8')); let i=0, ok=0; const failed=[];
async function worker(){ while(i<live.length){ const m=live[i++]; const f=path.join(outDir,m.slug+'.html'); if(fs.existsSync(f)){ok++;continue;}
 for(let a=0;a<3;a++){ try{ const r=await fetch(`https://sebastianraschka.com/llm-architecture-gallery/models/${m.slug}/`,{headers:{'User-Agent':'Mozilla/5.0 (compatible; catalog-fetch)'}}); if(r.ok){fs.writeFileSync(f,await r.text());ok++;break;} if(a===2)failed.push(m.slug+':'+r.status);}catch(e){if(a===2)failed.push(m.slug+':'+e.message);} await new Promise(r=>setTimeout(r,600*(a+1))); }
 await new Promise(r=>setTimeout(r,150)); } }
await Promise.all([worker(),worker(),worker()]); console.log({ok,total:live.length,failed});
