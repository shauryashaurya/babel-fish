import fs from 'node:fs'; import path from 'node:path';
const [,, hfDir, outFile] = process.argv;
const index=JSON.parse(fs.readFileSync(path.join(hfDir,'index.json'),'utf8'));
const rj=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return null}};
const pick=(c,...k)=>{ if(!c)return null; for(const n of k){ if(c[n]!=null)return c[n]; for(const s of ['text_config','llm_config','language_config','model_config']) if(c[s]?.[n]!=null)return c[s][n]; } return null; };
function weights(sib){ const s=(sib||[]).filter(x=>x.size!=null); const sum=a=>a.reduce((t,x)=>t+x.size,0);
 const st=s.filter(x=>/\.safetensors$/.test(x.rfilename)&&!x.rfilename.includes('/'));
 const groups={hf:st.filter(x=>/^model[-.]/.test(x.rfilename)),consolidated:st.filter(x=>/^consolidated/.test(x.rfilename)),other:st.filter(x=>!/^(model[-.]|consolidated)/.test(x.rfilename))};
 for(const k of ['hf','consolidated','other']) if(groups[k].length) return {bytes:sum(groups[k]),format:'safetensors',files:groups[k].length};
 const bin=s.filter(x=>/pytorch_model.*\.bin$/.test(x.rfilename)); if(bin.length) return {bytes:sum(bin),format:'pytorch',files:bin.length};
 const nested=s.filter(x=>/\.safetensors$/.test(x.rfilename)); if(nested.length) return {bytes:sum(nested),format:'safetensors-nested',files:nested.length};
 return {bytes:null,format:null,files:0}; }
const parseScale=t=>{const m=String(t||'').match(/([\d.]+)\s*([TBM])/i);return m?+m[1]*({T:1e12,B:1e9,M:1e6})[m[2].toUpperCase()]:null};
const out=index.map(m=>{ const d=path.join(hfDir,m.slug), info=rj(path.join(d,'info.json')), cfg=rj(path.join(d,'config.json')); let readme=''; try{readme=fs.readFileSync(path.join(d,'README.md'),'utf8')}catch{}
 const card=info?.cardData||{}, w=weights(info?.siblings), st=info?.safetensors;
 const tagLic=(info?.tags||[]).find(t=>t.startsWith('license:'))?.slice(8)||null;
 return {slug:m.slug,name:m.name,publisher:m.company,date:m.date,galleryScale:m.facts.scale||m.size,galleryLicense:m.facts.license||null,galleryContext:m.facts.context||null,repo:m.repo,repoCandidates:m.repoCandidates,officialLinks:m.officialLinks,revision:info?.sha||null,lastModified:info?.lastModified||null,gated:info?.gated??null,hasConfig:!!cfg,hasReadme:!!readme,readmeChars:readme.length,
  license:card.license??tagLic,licenseName:card.license_name||null,licenseLink:card.license_link||null,licenseFile:(info?.siblings||[]).map(x=>x.rfilename).find(f=>/^LICEN[SC]E/i.test(f))||null,pipeline:info?.pipeline_tag||null,library:info?.library_name||null,languages:card.language||null,baseModel:card.base_model||null,
  safetensorsParams:st?.total??null,dtypes:st?.parameters?Object.keys(st.parameters):null,weightBytes:w.bytes,weightFormat:w.format,weightFiles:w.files,
  architectures:cfg?.architectures||null,modelType:cfg?.model_type||null,maxPositions:pick(cfg,'max_position_embeddings','n_positions','max_sequence_length','seq_length'),hiddenSize:pick(cfg,'hidden_size','d_model','n_embd'),layers:pick(cfg,'num_hidden_layers','n_layer','num_layers'),heads:pick(cfg,'num_attention_heads','n_head'),kvHeads:pick(cfg,'num_key_value_heads'),vocab:pick(cfg,'vocab_size'),configDtype:pick(cfg,'torch_dtype','dtype'),vision:!!(cfg&&(cfg.vision_config||cfg.visual||cfg.image_token_id!=null||cfg.image_token_index!=null)),audio:!!(cfg&&cfg.audio_config),
  scaleParams:parseScale(m.facts.scale||m.size)};});
fs.writeFileSync(outFile,JSON.stringify(out,null,1));
const n=k=>out.filter(x=>x[k]!=null&&x[k]!==false).length;
console.log('coverage',Object.fromEntries(['repo','revision','license','licenseFile','galleryLicense','safetensorsParams','weightBytes','maxPositions','hiddenSize','layers','heads','vocab','configDtype','pipeline'].map(k=>[k,n(k)])));
const cnt={};out.forEach(x=>{const k=x.license||'(none)';cnt[k]=(cnt[k]||0)+1});console.log('HF license ids',cnt);
console.log('no license anywhere:',out.filter(x=>!x.license&&!x.galleryLicense&&!x.licenseFile).map(x=>x.slug));
console.log('LICENSE: gallery vs HF (other-than-other, differing):');
const norm=s=>String(s||'').toLowerCase().replace(/license|licence|version|[^a-z0-9.]/g,'');
for(const x of out){ if(x.license&&x.galleryLicense&&x.license!=='other'){const a=norm(x.license),b=norm(x.galleryLicense); if(!(a.includes(b)||b.includes(a)||(a.startsWith('apache')&&b.startsWith('apache'))||(a==='mit'&&b==='mit'))) console.log('  ',x.slug,'| hf:',x.license,'| gallery:',x.galleryLicense);} }
console.log('PARAM mismatch >15% (safetensors vs gallery scale):');
for(const x of out) if(x.safetensorsParams&&x.scaleParams){const r=x.safetensorsParams/x.scaleParams; if(r<.85||r>1.15) console.log('  ',x.slug,x.repo,(x.safetensorsParams/1e9).toFixed(2)+'B vs',x.galleryScale);}
console.log('multi-repo pages:',out.filter(x=>x.repoCandidates.length>1).map(x=>x.slug+'→'+x.repo+' ['+x.repoCandidates.length+']').join('; '));
console.log('no weights:',out.filter(x=>x.repo&&!x.weightBytes).map(x=>x.slug+' ('+x.repo+')'));
const ctx=out.filter(x=>x.maxPositions&&x.galleryContext);console.log('context compared',ctx.length);
const pc=t=>{const m=String(t).match(/([\d.]+)\s*([KM])/i);return m?+m[1]*(m[2].toUpperCase()=='M'?1048576:1024):null};
console.log('CONTEXT mismatch >10%:',ctx.filter(x=>{const g=pc(x.galleryContext);return g&&Math.abs(x.maxPositions/g-1)>.1}).map(x=>x.slug+':'+x.maxPositions+' vs '+x.galleryContext).join('; '));
