<script lang="ts" context="module">
 export interface Point {id: string; x: number; y: number; group: string; label: string; detail: string; href?: string;}
 export interface Group {id: string; label: string; color: string;}
</script>
<script lang="ts">
 export let points: Point[];
 export let groups: Group[];
 export let xLabel = '';
 export let yLabel = '';
 export let aria = '';
 export let format: (v: number) => string = v => String(v);
 const W = 900, H = 380, L = 58, R = 14, T = 12, B = 40;
 let hover: Point | null = null;
 const lg = (v: number) => Math.log10(Math.max(v, 1e-9));
 $: xs = points.map(p => lg(p.x));
 $: ys = points.map(p => lg(p.y));
 $: x0 = xs.length ? Math.floor(Math.min(...xs)) : 8;
 $: x1 = xs.length ? Math.max(x0 + 1, Math.ceil(Math.max(...xs))) : 10;
 $: y0 = ys.length ? Math.floor(Math.min(...ys)) : 0;
 $: y1 = ys.length ? Math.max(y0 + 1, Math.ceil(Math.max(...ys))) : 2;
 $: px = (v: number) => L + (W - L - R) * (lg(v) - x0) / (x1 - x0 || 1);
 $: py = (v: number) => H - B - (H - B - T) * (lg(v) - y0) / (y1 - y0 || 1);
 $: xTicks = Array.from({length: x1 - x0 + 1}, (_, i) => 10 ** (x0 + i));
 $: yTicks = Array.from({length: y1 - y0 + 1}, (_, i) => 10 ** (y0 + i));
 $: colorOf = (g: string) => groups.find(x => x.id === g)?.color ?? 'var(--s8)';
 $: counts = new Map(groups.map(g => [g.id, points.filter(p => p.group === g.id).length]));
</script>
<div class="mini-chart">
 <div class="chart-legend">{#each groups as g (g.id)}<span><i class="dot" style={`--tone:${g.color}`}></i>{g.label} ({counts.get(g.id) ?? 0})</span>{/each}</div>
 <div class="chart-body">
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
   {#each yTicks as tick}<line class="chart-grid" x1={L} x2={W - R} y1={py(tick)} y2={py(tick)}/><text class="chart-tick end" x={L - 6} y={py(tick) + 4}>{format(tick)}</text>{/each}
   {#each xTicks as tick}<line class="chart-grid" x1={px(tick)} x2={px(tick)} y1={T} y2={H - B}/><text class="chart-tick mid" x={px(tick)} y={H - B + 16}>{format(tick)}</text>{/each}
   <line class="chart-axis" x1={L} x2={W - R} y1={H - B} y2={H - B}/>
   <text class="chart-tick mid" x={(L + W - R) / 2} y={H - 6}>{xLabel}</text>
   <text class="chart-tick mid" transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`}>{yLabel}</text>
   {#each points as p (p.id)}
    <circle cx={px(p.x)} cy={py(p.y)} r={hover?.id === p.id ? 7 : 5} fill={colorOf(p.group)} stroke="#fcfcfb" stroke-width="2" opacity={hover && hover.id !== p.id ? .55 : .9}/>
   {/each}
   {#each points as p (p.id)}
    <a href={p.href} aria-label={p.label} on:pointerenter={() => hover = p} on:pointerleave={() => hover = null} on:focus={() => hover = p} on:blur={() => hover = null}>
     <circle class="hit" cx={px(p.x)} cy={py(p.y)} r="11" fill="transparent"/>
    </a>
   {/each}
  </svg>
  {#if hover}<div class="chart-tip" style={`left:${px(hover.x) / W * 100}%;top:${Math.max(0, py(hover.y) / H * 100 - 22)}%`}><b>{hover.label}</b><span>{hover.detail}</span></div>{/if}
 </div>
</div>
