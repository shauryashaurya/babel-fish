<script lang="ts">
 import katex from 'katex';
 import type {MathItem} from '../lib/architecture';
 export let items: MathItem[];
 const GREEK: Record<string, string> = {alpha: 'α', beta: 'β', gamma: 'γ', lambda: 'λ', rho: 'ρ', tau: 'τ', theta: 'θ'};
 const render = (tex: string) => katex.renderToString(tex, {output: 'mathml', displayMode: true, throwOnError: false});
 /** Shows symbols such as L_A or alpha_t in notes with proper subscripts. */
 function parts(note: string) {
  const out: {text: string; sub?: string}[] = [];
  let last = 0;
  for (const m of note.matchAll(/\b([A-Za-z]+)_([A-Za-z0-9]+)\b/g)) {
   out.push({text: note.slice(last, m.index)}, {text: GREEK[m[1]] ?? m[1], sub: m[2]});
   last = m.index + m[0].length;
  }
  out.push({text: note.slice(last)});
  return out;
 }
</script>
<div class="math-list">
 {#each items as item (item.label)}
  <article class="math-item">
   <h3>{item.label}</h3>
   <div class="math-eq">{@html render(item.tex)}</div>
   <p>{#each parts(item.note) as p}{#if p.sub}<i>{p.text}</i><sub>{p.sub}</sub>{:else}{p.text}{/if}{/each}</p>
  </article>
 {/each}
</div>
