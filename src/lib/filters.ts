import {familyOf, hasMechanism, mechanisms} from './architecture';
import {t} from './content';
import {assessModel, commercialLabel, statusLabel} from './selection';
import type {Assessment, CheckStatus, Model, Selection} from './types';

export interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  sortable?: boolean;
  value: (row: any) => string | number | null;
  text?: (row: any) => string;
  sub?: (row: any) => string;
  href?: (row: any) => string | null;
  tone?: (row: any) => CheckStatus;
  action?: {disabled: (row: any) => boolean; run: (row: any) => void};
  cellClass?: string;
}

export const facetKeys = ['distribution', 'family', 'mechanism', 'requirement', 'commercial', 'license', 'image', 'access', 'precision', 'year', 'publisher', 'country'] as const;
export type FacetKey = typeof facetKeys[number];
export type SortKey = 'name' | 'publisher' | 'released' | 'family' | 'params' | 'context' | 'weights' | 'license' | 'commercial';

export interface CatalogFilters {
  search: string;
  candidatesOnly: boolean;
  minParamsB: number | null;
  maxParamsB: number | null;
  minContextK: number | null;
  maxWeightGiB: number | null;
  facets: Record<FacetKey, string[]>;
}
export interface CatalogView {filters: CatalogFilters; sortKey: SortKey; ascending: boolean;}

export const emptyFilters = (): CatalogFilters => ({
  search: '', candidatesOnly: false, minParamsB: null, maxParamsB: null, minContextK: null, maxWeightGiB: null,
  facets: Object.fromEntries(facetKeys.map(k => [k, []])) as unknown as Record<FacetKey, string[]>,
});

export const sortOptions = ['released:desc', 'released:asc', 'name:asc', 'params:asc', 'params:desc', 'context:desc', 'weights:asc'];

export function sortValue(a: Assessment, key: SortKey): string | number | null {
  const m = a.model;
  if (key === 'publisher') return m.publisher;
  if (key === 'released') return m.released || null;
  if (key === 'family') return m.architecture.class;
  if (key === 'params') return m.totalParams;
  if (key === 'context') return m.context;
  if (key === 'weights') return m.weightGiB;
  if (key === 'license') return m.license.rule.name;
  if (key === 'commercial') return commercialLabel(m.license.rule.commercial);
  return m.name;
}

/** Empty values always sort last, whichever direction is chosen. */
export function compareValues(x: string | number | null, y: string | number | null, ascending: boolean): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', {numeric: true});
  return ascending ? order : -order;
}

const NONE = '__none__';

export function facetValues(a: Assessment, key: FacetKey): string[] {
  const m = a.model, o = m.official;
  switch (key) {
    case 'distribution': return [m.access === 'api' ? 'api' : 'open'];
    case 'family': return [m.access === 'api' ? 'api' : m.architecture.class || NONE];
    case 'mechanism': return mechanisms.filter(x => hasMechanism(m, x.id)).map(x => x.id);
    case 'requirement': return [a.status];
    case 'commercial': return [m.license.rule.commercial];
    case 'license': return [m.license.rule.name];
    case 'image': return [o ? (o.vision ? 'yes' : o.configUrl ? 'no' : 'unknown') : 'unknown'];
    case 'access': return [m.access === 'api' ? 'api' : !o ? 'none' : o.gated ? 'gated' : 'open'];
    case 'precision': return [o?.storedPrecision || NONE];
    case 'year': return [m.released?.slice(0, 4) || NONE];
    case 'publisher': return [m.publisher];
    case 'country': return [m.country || NONE];
  }
}

export function facetLabel(key: FacetKey, value: string): string {
  if (value === NONE) return t('filters.notPublished');
  if (key === 'mechanism') return mechanisms.find(x => x.id === value)?.name || value;
  if (key === 'requirement') return statusLabel(value as CheckStatus);
  if (key === 'commercial') return commercialLabel(value as Parameters<typeof commercialLabel>[0]);
  if (key === 'image') return t(`filters.image.${value}`);
  if (key === 'access') return t(`filters.access.${value}`);
  if (key === 'distribution') return t(`filters.distribution.${value}`);
  if (key === 'family' && value === 'api') return t('api.familyCell');
  return value;
}

export function matches(a: Assessment, f: CatalogFilters, selection: Selection, skip?: FacetKey): boolean {
  const m = a.model, query = f.search.trim().toLowerCase();
  if (query && !`${m.name} ${m.publisher} ${m.architecture.class} ${m.license.rule.name}`.toLowerCase().includes(query)) return false;
  if (f.candidatesOnly && !selection.candidates.includes(m.id)) return false;
  if (f.minParamsB !== null && (m.totalParams === null || m.totalParams < f.minParamsB * 1e9)) return false;
  if (f.maxParamsB !== null && (m.totalParams === null || m.totalParams > f.maxParamsB * 1e9)) return false;
  if (f.minContextK !== null && (m.context === null || m.context < f.minContextK * 1000)) return false;
  if (f.maxWeightGiB !== null && (m.weightGiB === null || m.weightGiB > f.maxWeightGiB)) return false;
  return facetKeys.every(key => {
    if (key === skip || !f.facets[key]?.length) return true;
    const values = facetValues(a, key);
    return f.facets[key].some(v => values.includes(v));
  });
}

export function visibleModels(models: Model[], selection: Selection, view: CatalogView): Assessment[] {
  return models.map(m => assessModel(m, selection))
    .filter(a => matches(a, view.filters, selection))
    .sort((a, b) => compareValues(sortValue(a, view.sortKey), sortValue(b, view.sortKey), view.ascending));
}

/** Option counts reflect every other active filter, so a count is what you get by ticking it. */
export function facetOptions(models: Model[], selection: Selection, f: CatalogFilters, key: FacetKey) {
  const all = models.map(m => assessModel(m, selection));
  const counts = new Map<string, number>();
  for (const a of all) for (const v of facetValues(a, key)) if (!counts.has(v)) counts.set(v, 0);
  for (const a of all) if (matches(a, f, selection, key)) for (const v of facetValues(a, key)) counts.set(v, (counts.get(v) || 0) + 1);
  const rows = [...counts.entries()].map(([value, count]) => ({value, count, label: facetLabel(key, value)}));
  if (key === 'year') return rows.sort((a, b) => b.value.localeCompare(a.value));
  if (key === 'mechanism' || key === 'commercial' || key === 'requirement' || key === 'distribution') return rows;
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

export interface FilterChip {label: string; clear: (f: CatalogFilters) => CatalogFilters;}

export function filterChips(f: CatalogFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.search.trim()) chips.push({label: t('filters.chipSearch', {value: f.search.trim()}), clear: x => ({...x, search: ''})});
  if (f.candidatesOnly) chips.push({label: t('filters.chipCandidates'), clear: x => ({...x, candidatesOnly: false})});
  if (f.minParamsB !== null) chips.push({label: t('filters.chipMinParams', {value: f.minParamsB}), clear: x => ({...x, minParamsB: null})});
  if (f.maxParamsB !== null) chips.push({label: t('filters.chipMaxParams', {value: f.maxParamsB}), clear: x => ({...x, maxParamsB: null})});
  if (f.minContextK !== null) chips.push({label: t('filters.chipMinContext', {value: f.minContextK}), clear: x => ({...x, minContextK: null})});
  if (f.maxWeightGiB !== null) chips.push({label: t('filters.chipMaxWeights', {value: f.maxWeightGiB}), clear: x => ({...x, maxWeightGiB: null})});
  for (const key of facetKeys) for (const value of f.facets[key] || []) {
    chips.push({label: `${t(`filters.facet.${key}`)}: ${facetLabel(key, value)}`, clear: x => ({...x, facets: {...x.facets, [key]: x.facets[key].filter(v => v !== value)}})});
  }
  return chips;
}

/** The Architectures page for the model's family, with this model as the worked example. */
export const familyHref = (model: Model) => { const f = familyOf(model); return f ? `#/architecture/family/${f.id}/${encodeURIComponent(model.id)}` : null; };
