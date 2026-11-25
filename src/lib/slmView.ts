import {get, writable} from 'svelte/store';
import {compareList} from './compareList';
import {mechanisms} from './architecture';
import {t} from './content';
import {commercialLabel} from './selection';
import {FAMILY_NAMES, slmMemory, slms, type Slm} from './learning';

/** Facets of the small-model list, in display order. Each reads one published or derived field. */
export const slmFacetKeys = ['tier', 'purpose', 'family', 'mechanism', 'attention', 'commercial', 'license', 'access', 'year', 'publisher'] as const;
export type SlmFacet = typeof slmFacetKeys[number];

export interface SlmFilters {search: string; facets: Record<SlmFacet, string[]>; fitsOnly: boolean; memory: number; context: number; precision: string; compareOnly: boolean;}
export interface SlmView {filters: SlmFilters; sortKey: string; ascending: boolean; section: string;}

export {MAX_COMPARE, toggleCompare} from './compareList';
const KEY = 'babel-fish.slm-view.v1';
export const emptySlmFilters = (): SlmFilters => ({search: '', facets: Object.fromEntries(slmFacetKeys.map(k => [k, []])) as unknown as Record<SlmFacet, string[]>, fitsOnly: false, memory: 64, context: 8192, precision: 'published', compareOnly: false});

function read(): Partial<SlmView> | null { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
const saved = read(), base = emptySlmFilters();
export const slmView = writable<SlmView>({
  sortKey: saved?.sortKey || 'rank', ascending: saved?.ascending ?? true, section: saved?.section && saved.section !== 'compare' ? saved.section : 'candidates',
  filters: {...base, ...saved?.filters, facets: {...base.facets, ...saved?.filters?.facets}},
});
slmView.subscribe(v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } });

export const patchSlmFilters = (patch: Partial<SlmFilters>) => slmView.update(v => ({...v, filters: {...v.filters, ...patch}}));
export const clearSlmFilters = () => slmView.update(v => ({...v, filters: {...emptySlmFilters(), memory: v.filters.memory, context: v.filters.context, precision: v.filters.precision}}));

/** The value of one facet for one model. A model can carry several values, for example several building blocks. */
export function facetValues(s: Slm, key: SlmFacet): string[] {
  switch (key) {
    case 'tier': return [s.tier];
    case 'purpose': return [s.purpose];
    case 'family': return [s.family ?? 'unknown'];
    case 'mechanism': return s.mechanisms;
    case 'attention': return [s.architecture?.attention ?? 'unknown'];
    case 'commercial': return [s.license.rule.commercial];
    case 'license': return [s.license.rule.name];
    case 'access': return [s.gated ? 'gated' : 'open'];
    case 'year': return [s.released?.slice(0, 4) ?? 'unknown'];
    case 'publisher': return [s.publisher];
  }
}
export function facetLabel(key: SlmFacet, value: string): string {
  if (value === 'unknown') return t('slm.unknown');
  if (key === 'tier') return t(`slm.tiers.${value}`);
  if (key === 'purpose') return t(`slm.purposes.${value}`);
  if (key === 'family') return FAMILY_NAMES[value] ?? value;
  if (key === 'mechanism') return mechanisms.find(m => m.id === value)?.name ?? value;
  if (key === 'commercial') return commercialLabel(value as Slm['license']['rule']['commercial']);
  if (key === 'access') return t(`filters.access.${value}`);
  return value;
}
const matchesSearch = (s: Slm, q: string) => !q || `${s.name} ${s.publisher} ${s.repo} ${s.modelType ?? ''} ${s.license.rule.name}`.toLowerCase().includes(q);
export const fits = (s: Slm, f: SlmFilters) => slmMemory(s, f.precision, f.context) <= f.memory;

function passes(s: Slm, f: SlmFilters, compare: string[], skip?: SlmFacet) {
  if (!matchesSearch(s, f.search.trim().toLowerCase())) return false;
  if (f.fitsOnly && !fits(s, f)) return false;
  if (f.compareOnly && !compare.includes(s.id)) return false;
  return slmFacetKeys.every(k => k === skip || !f.facets[k].length || facetValues(s, k).some(v => f.facets[k].includes(v)));
}
export const filterSlms = (v: SlmView, compare = get(compareList)) => slms.filter(s => passes(s, v.filters, compare));

/** Options with counts that reflect every other active filter, so a zero means the choice would empty the list. */
export function slmFacetOptions(v: SlmView, key: SlmFacet, compare = get(compareList)) {
  const counts = new Map<string, number>(), others = slms.filter(s => passes(s, v.filters, compare, key));
  for (const s of slms) for (const value of facetValues(s, key)) if (!counts.has(value)) counts.set(value, 0);
  for (const s of others) for (const value of facetValues(s, key)) counts.set(value, (counts.get(value) ?? 0) + 1);
  const order: Partial<Record<SlmFacet, string[]>> = {tier: ['nano', 'small', 'medium'], commercial: ['allowed', 'conditional', 'prohibited', 'unverified'], purpose: ['instruct', 'base', 'reasoning', 'code', 'tools'], family: ['dense', 'sparse-moe', 'dense-hybrid', 'hybrid-moe', 'unknown']};
  const fixed = order[key];
  return [...counts.entries()].map(([value, count]) => ({value, count, label: facetLabel(key, value)}))
    .sort((a, b) => fixed ? fixed.indexOf(a.value) - fixed.indexOf(b.value) : key === 'year' ? b.value.localeCompare(a.value) : b.count - a.count || a.label.localeCompare(b.label));
}
export const activeFilterCount = (f: SlmFilters) => slmFacetKeys.reduce((n, k) => n + f.facets[k].length, 0) + (f.fitsOnly ? 1 : 0) + (f.compareOnly ? 1 : 0) + (f.search.trim() ? 1 : 0);
