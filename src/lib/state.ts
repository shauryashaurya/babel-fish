import {writable} from 'svelte/store';
import {emptyFilters, type CatalogFilters, type CatalogView} from './filters';
import {emptyResult, MAX_CANDIDATES} from './selection';
import type {CandidateResult, Selection} from './types';

const SELECTION_KEY = 'babel-fish.selection.v3';
const VIEW_KEY = 'babel-fish.catalog-view.v1';
const LEGACY_KEYS: Record<string, string> = {[SELECTION_KEY]: 'lm-babel-fish.selection.v3', [VIEW_KEY]: 'lm-babel-fish.catalog-view.v1'};

export const blankSelection: Selection = {
  useCase: '', preparedBy: '',
  commercialUse: false, offersMaaS: false, annualRevenueUsd: null, monthlyActiveUsers: null, regions: [],
  minContext: null, needsVision: false, excludedPublishers: [], excludedCountries: [],
  gpuMemoryGiB: null, gpuCount: null, concurrentSessions: 1, headroomPct: 20,
  testCases: null, minPassRatePct: null, maxCriticalFailures: 0, maxP95Ms: null, monthlyBudget: null,
  requestsPerMonth: null, inputTokens: null, outputTokens: null, peakRps: null, gpuMonthlyCost: null,
  candidates: [], results: {}, notes: '',
};

function read<T>(key: string): Partial<T> | null {
  // Work saved under the application's previous name is carried over.
  try { const saved = localStorage.getItem(key) ?? localStorage.getItem(LEGACY_KEYS[key]); return saved ? JSON.parse(saved) : null; } catch { return null; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const selection = writable<Selection>({...blankSelection, ...read<Selection>(SELECTION_KEY)});
selection.subscribe(value => save(SELECTION_KEY, value));

const savedView = read<CatalogView>(VIEW_KEY);
const defaults = emptyFilters();
export const catalogView = writable<CatalogView>({
  sortKey: savedView?.sortKey || 'released',
  ascending: savedView?.ascending ?? false,
  filters: {...defaults, ...savedView?.filters, facets: {...defaults.facets, ...savedView?.filters?.facets}},
});
catalogView.subscribe(value => save(VIEW_KEY, value));

/** The model most recently opened, highlighted when returning to the catalog. */
export const lastViewedModel = writable('');

export const patchFilters = (patch: Partial<CatalogFilters>) => catalogView.update(v => ({...v, filters: {...v.filters, ...patch}}));
export const setFilters = (filters: CatalogFilters) => catalogView.update(v => ({...v, filters}));
export const clearFilters = () => catalogView.update(v => ({...v, filters: emptyFilters()}));
export function showInCatalog(patch: Partial<CatalogFilters['facets']>) {
  const filters = emptyFilters();
  catalogView.update(v => ({...v, filters: {...filters, facets: {...filters.facets, ...patch}}}));
}

export const patchSelection = (patch: Partial<Selection>) => selection.update(s => ({...s, ...patch}));
export const resetSelection = () => selection.set({...blankSelection});
export const replaceSelection = (saved: Partial<Selection>) => selection.set({...blankSelection, ...saved});
export function toggleCandidate(id: string) {
  selection.update(s => {
    if (s.candidates.includes(id)) return {...s, candidates: s.candidates.filter(c => c !== id)};
    if (s.candidates.length >= MAX_CANDIDATES) return s;
    return {...s, candidates: [...s.candidates, id]};
  });
}
export function patchResult(id: string, patch: Partial<CandidateResult>) {
  selection.update(s => ({...s, results: {...s.results, [id]: {...emptyResult, ...s.results[id], ...patch}}}));
}
