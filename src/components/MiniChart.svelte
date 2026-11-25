<script lang="ts" context="module">
 export interface ChartSeries {id: string; label: string; tone: number; points: [number, number][]; dots?: boolean; dashed?: boolean; endLabel?: string;}
 export interface ChartRef {y: number; label: string;}
 export interface ChartMarker {x: number; label: string;}
 /** Round tick steps (1, 2, 2.5, 5 x 10^n) so axis labels read as plain numbers. */
 export function niceTicks(lo: number, hi: number, target = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
 }
</script>
<script lang="ts">
 export let series: ChartSeries[];
 export let xMin: number;
 export let xMax: number;
 export let yMin: number;
 export let yMax: number;
 export let log = false;
 export let bands: {x0: number; x1: number; tone: number}[] = [];
 export let refs: ChartRef[] = [];
 export let markers: ChartMarker[] = [];
 export let xLabel = '';
 export let yLabel = '';
 export let aria = '';
 export let height = 280;
 /** Write each line's name and last value at its right end. Off automatically when the chart is narrow or crowded. */
 export let endLabels = true;
 export let format: (v: number) => string = v => v.toFixed(2);
 export let xFormat: ((v: number) => string) | null = null;
 export let xTicks: number[] | null = null;

 let width = 640, svg: SVGSVGElement, hoverX: number | null = null;
 const CHAR = 6.4;
 const toY = (v: number) => log ? Math.log10(Math.max(v, yMin)) : v;
 $: lines = series.filter(s => !s.dots && s.points.length);
 $: yLow = toY(yMin);
 $: yHigh = toY(yMax);
 $: yTicks = log ? logTicks(yMin, yMax) : niceTicks(yMin, yMax, height < 240 ? 4 : 5);
 $: ticksX = xTicks ?? niceTicks(xMin, xMax, width < 480 ? 4 : 6);
 $: tickText = (v: number) => format(v);
 $: L = Math.max(36, Math.min(96, 12 + CHAR * Math.max(...yTicks.map(v => tickText(v).length), 2))) + (yLabel ? 16 : 0);
 $: showEnds = endLabels && width >= 520 && lines.length > 0 && lines.length <= 6;
 $: ends = showEnds ? lines.map(s => {const p = s.points[s.points.length - 1]; return {s, p, text: `${s.endLabel ?? s.label}  ${format(p[1])}`};}) : [];
 $: R = showEnds ? Math.min(width * .34, 18 + CHAR * Math.max(...ends.map(e => e.text.length))) : 14;
 const T = 14, B = 42;
 $: H = height;
 $: px = (x: number) => L + (width - L - R) * (x - xMin) / ((xMax - xMin) || 1);
 $: py = (y: number) => H - B - (H - B - T) * (toY(y) - yLow) / ((yHigh - yLow) || 1);
 $: placed = placeEnds(ends, py);
 $: visibleRefs = refs.filter(r => r.y >= yMin && r.y <= yMax);

 function logTicks(lo: number, hi: number) {
  const a = Math.ceil(Math.log10(lo) - 1e-9), b = Math.floor(Math.log10(hi) + 1e-9), out: number[] = [];
  const fine = b - a <= 2;
  for (let e = a - 1; e <= b; e++) for (const m of fine ? [1, 2, 5] : [1]) { const v = m * 10 ** e; if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v); }
  return out.length ? out : [lo, hi];
 }
 /** Stack end labels top to bottom with a minimum gap, so close lines do not print on top of each other. */
 function placeEnds(list: typeof ends, y: (v: number) => number) {
  const gap = 15, sorted = list.map(e => ({...e, y0: y(e.p[1]), y: y(e.p[1])})).sort((a, b) => a.y0 - b.y0);
  for (let i = 1; i < sorted.length; i++) sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + gap);
  const over = sorted.length ? sorted[sorted.length - 1].y - (H - B) : 0;
  if (over > 0) for (let i = sorted.length - 1; i >= 0; i--) sorted[i].y = Math.min(sorted[i].y - over, i < sorted.length - 1 ? sorted[i + 1].y - gap : Infinity);
  return sorted;
 }
 const pathOf = (s: ChartSeries, x: (v: number) => number, y: (v: number) => number) => s.points.map((p, i) => `${i ? 'L' : 'M'} ${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
 const nearest = (s: ChartSeries, x: number) => s.points.reduce((best, p) => Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best, s.points[0]);
 const colour = (s: {tone: number}) => s.tone ? `var(--s${s.tone})` : 'var(--text)';
 function move(event: PointerEvent) {
  const box = svg.getBoundingClientRect(), v = event.clientX - box.left;
  hoverX = v < L || v > width - R ? null : xMin + (v - L) / (width - L - R) * (xMax - xMin);
 }
 $: inRange = (s: ChartSeries, x: number) => !!s.points.length && x >= s.points[0][0] - 1e-9 && x <= s.points[s.points.length - 1][0] + 1e-9;
 $: hoverRows = hoverX === null ? [] : lines.filter(s => !xFormat || inRange(s, hoverX!)).map(s => ({s, p: nearest(s, hoverX!)})).sort((a, b) => b.p[1] - a.p[1]);
 $: tipRight = hoverX !== null && px(hoverX) > width * .6;
</script>
<div class="mini-chart">
 <div class="chart-legend">{#each series as s (s.id)}<span><i class:dot={s.dots} class:dash={s.dashed} style={`--tone:${colour(s)}`}></i>{s.label}</span>{/each}</div>
 <div class="chart-body" bind:clientWidth={width}>
  <svg bind:this={svg} width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={aria} on:pointermove={move} on:pointerleave={() => hoverX = null}>
   {#each bands as b}<rect x={px(b.x0)} y={T} width={Math.max(0, px(b.x1) - px(b.x0))} height={H - B - T} fill={`var(--s${b.tone})`} opacity=".12"/>{/each}
   {#each yTicks as tick}<line class="chart-grid" x1={L} x2={width - R} y1={py(tick)} y2={py(tick)}/><text class="chart-tick end" x={L - 8} y={py(tick) + 4}>{tickText(tick)}</text>{/each}
   {#each ticksX as tick}<line class="chart-xtick" x1={px(tick)} x2={px(tick)} y1={H - B} y2={H - B + 4}/><text class="chart-tick mid" x={px(tick)} y={H - B + 17}>{xFormat ? xFormat(tick) : Math.abs(xMax - xMin) >= 20 ? Math.round(tick).toLocaleString('en-US') : +tick.toFixed(2)}</text>{/each}
   <line class="chart-axis" x1={L} x2={width - R} y1={H - B} y2={H - B}/>
   {#if xLabel}<text class="chart-axis-label mid" x={(L + width - R) / 2} y={H - 6}>{xLabel}</text>{/if}
   {#if yLabel}<text class="chart-axis-label mid" transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`}>{yLabel}</text>{/if}
   {#each visibleRefs as r}<g class="chart-ref"><line x1={L} x2={width - R} y1={py(r.y)} y2={py(r.y)}/><text x={width - R - 6} y={py(r.y) - 5} text-anchor="end">{r.label}</text></g>{/each}
   {#each markers as m}{#if m.x >= xMin && m.x <= xMax}<g class="chart-marker"><line x1={px(m.x)} x2={px(m.x)} y1={T} y2={H - B}/><text x={px(m.x) + (px(m.x) > width - R - 90 ? -6 : 6)} y={T + 10} text-anchor={px(m.x) > width - R - 90 ? 'end' : 'start'}>{m.label}</text></g>{/if}{/each}
   {#each lines as s (s.id)}<path d={pathOf(s, px, py)} fill="none" stroke={colour(s)} stroke-width="2" stroke-dasharray={s.dashed ? '5 4' : undefined} stroke-linejoin="round" stroke-linecap="round"/>{/each}
   {#each series.filter(s => s.dots) as s (s.id)}{#each s.points as p}<circle cx={px(p[0])} cy={py(p[1])} r="4.5" fill={colour(s)} class="chart-ring"/>{/each}{/each}
   {#each placed as e (e.s.id)}
    <circle cx={px(e.p[0])} cy={e.y0} r="4" fill={colour(e.s)} class="chart-ring"/>
    {#if Math.abs(e.y - e.y0) > 2}<path class="chart-leader" d={`M ${px(e.p[0]) + 6} ${e.y0} L ${width - R + 8} ${e.y}`}/>{/if}
    <text class="chart-end" x={width - R + 12} y={e.y + 4}><tspan class="chart-end-swatch" fill={colour(e.s)}>■</tspan> {e.text}</text>
   {/each}
   {#if hoverX !== null}
    <line class="chart-cross" x1={px(hoverX)} x2={px(hoverX)} y1={T} y2={H - B}/>
    {#each hoverRows as r (r.s.id)}<circle cx={px(r.p[0])} cy={py(r.p[1])} r="4.5" fill={colour(r.s)} class="chart-ring"/>{/each}
   {/if}
  </svg>
  {#if hoverX !== null && hoverRows.length}
   <div class="chart-tip" class:flip={tipRight} style={`left:${px(hoverX)}px`}>
    <b>{xFormat ? xFormat(hoverX) : +hoverX.toFixed(2)}</b>
    {#each hoverRows as r (r.s.id)}<span><i style={`background:${colour(r.s)}`}></i>{r.s.label}<em>{format(r.p[1])}</em></span>{/each}
   </div>
  {/if}
 </div>
</div>
