import {jacobiEigen, Space, Bm25, kmeans, personalizedPageRank, labelPropagation, proximity, percentile, rrf, dot, sentences} from '../src/lib/ragMath.ts';
let ok = 0, bad = 0; const check = (name: string, cond: boolean, info: unknown = '') => { if (cond) ok++; else { bad++; console.log('FAIL', name, info); } };
// Jacobi: known eigenvalues of [[2,1],[1,2]] are 3 and 1; random symmetric reconstructs
const e = jacobiEigen([[2,1],[1,2]]); check('eig2', Math.abs(Math.max(...e.values)-3)<1e-9 && Math.abs(Math.min(...e.values)-1)<1e-9, e.values);
const n=12, M=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>0)); for(let i=0;i<n;i++)for(let j=i;j<n;j++){const v=Math.sin(i*7+j*3);M[i][j]=v;M[j][i]=v;}
const r = jacobiEigen(M); let err=0; for(let i=0;i<n;i++)for(let j=0;j<n;j++){let s=0;for(let k=0;k<n;k++)s+=r.vectors[i][k]*r.values[k]*r.vectors[j][k];err=Math.max(err,Math.abs(s-M[i][j]));} check('eig reconstruct', err<1e-9, err);
// LSA: synonyms that co-occur should land closer than unrelated words
const texts=[]; for(let i=0;i<30;i++){texts.push(`cache memory keys values tokens store ${i%3?'kv':'attention'}`);texts.push(`expert router mixture tokens gate ${i%2?'moe':'sparse'}`);texts.push(`lora adapter fine tuning rank low weights ${i%4?'adapter':'peft'}`);}
const sp = new Space(texts, 8); check('space k', sp.k>0 && sp.k<=8, sp.k);
const s1 = dot(sp.wordVec('cache')!, sp.wordVec('memory')!), s2 = dot(sp.wordVec('cache')!, sp.wordVec('router')!); check('lsa related>unrelated', s1 > s2+0.3, [s1,s2]);
const q = sp.embed('router gate'); const sims = texts.map(t=>dot(q, sp.embed(t))); check('lsa retrieves moe', texts[sims.indexOf(Math.max(...sims))].includes('router'));
// singular values against brute force: S^2 = eigenvalues of A^T A (top), compare with the top from jacobi on full gram
const A = texts.map(t=>sp.weights(t.toLowerCase().match(/[a-z0-9]+/g)!.filter(w=>w.length>1)));
const G = A.map(a=>A.map(b=>{let s=0;a.forEach((v,i)=>{s+=v*(b.get(i)??0)});return s;}));
const full = jacobiEigen(G).values.sort((x,y)=>y-x); check('svd top singular', Math.abs(full[0]-sp.S[0]**2)<1e-6 && Math.abs(full[2]-sp.S[2]**2)<1e-6, [full.slice(0,4), Array.from(sp.S.slice(0,4),x=>x*x)]);
// BM25 hand check: one term, two docs
const bm = new Bm25(['apple banana', 'banana banana cherry cherry']); const sc = bm.scores('apple'); const idf = Math.log(1 + (2-1+.5)/(1+.5)); const want = idf*1*2.2/(1+1.2*(1-.75+.75*2/3)); check('bm25', Math.abs(sc[0]-want)<1e-12 && sc[1]===0, [sc, want]);
// RRF
const f = rrf([[1,2,3],[3,1]]); check('rrf', f[0][0]===1 && Math.abs(f[0][1]-(1/61+1/62))<1e-12, f);
// k-means separates the three topics
const vs = texts.map(t=>sp.embed(t)); const km = kmeans(vs, 3); const groups = new Set([0,1,2].map(o=>km.assign.filter((_,i)=>i%3===o).every(a=>a===km.assign[o])?km.assign[o]:-1)); check('kmeans topics', !groups.has(-1) && groups.size===3, km.assign.slice(0,9));
// PPR: seed node has the most mass; mass sums to 1
const adj=[new Map([[1,1]]),new Map([[0,1],[2,1]]),new Map([[1,1]]),new Map()]; const p = personalizedPageRank(adj,new Map([[0,1]])); check('ppr sum', Math.abs(p.reduce((s,x)=>s+x,0)-1)<1e-9, p); check('ppr seed top', p[0]>p[1] && p[1]>p[2] && p[3]===0, p);
// Label propagation: two cliques
const cl=[new Map([[1,1],[2,1]]),new Map([[0,1],[2,1]]),new Map([[0,1],[1,1],[3,.1]]),new Map([[4,1],[5,1],[2,.1]]),new Map([[3,1],[5,1]]),new Map([[3,1],[4,1]])]; const lb=labelPropagation(cl); check('labels', lb[0]===lb[1]&&lb[1]===lb[2]&&lb[3]===lb[4]&&lb[4]===lb[5]&&lb[0]!==lb[3], lb);
check('prox adjacent', proximity(['a','b','x','y'], new Set(['a','b']))===1); check('prox spread', proximity(['a','x','x','b'], new Set(['a','b']))===0.5);
check('percentile', percentile([1,2,3,4,5],95)===4.8 && percentile([1,2,3,4],50)===2.5);
check('sentences', sentences('One two. Three four! Five').length===3);
console.log(`ragMath: ${ok} passed, ${bad} failed`); if (bad) process.exit(1);
