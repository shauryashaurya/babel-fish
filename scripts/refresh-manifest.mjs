import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve('data');const result=[];
function walk(dir){for(const name of fs.readdirSync(dir)){const abs=path.join(dir,name);if(fs.statSync(abs).isDirectory())walk(abs);else {const p=path.relative(root,abs).replaceAll('\\','/');if(p==='meta/files.json')continue;const bytes=fs.readFileSync(abs);result.push({path:p,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
walk(root);result.sort((a,b)=>a.path.localeCompare(b.path));fs.writeFileSync(path.join(root,'meta/files.json'),JSON.stringify(result,null,2)+'\n');console.log(`Refreshed ${result.length} source file digests.`);
