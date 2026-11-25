import {writable} from 'svelte/store';

/** One comparison list shared by the catalog, the small-model list and the Compare page. */
export const MAX_COMPARE = 5;
const KEY = 'babel-fish.compare.v1';

function initial(): string[] {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return (JSON.parse(saved) as string[]).slice(0, MAX_COMPARE);
    // Carry over a list made before the comparison was shared.
    const old = JSON.parse(localStorage.getItem('babel-fish.slm-view.v1') || 'null');
    return Array.isArray(old?.compare) ? old.compare.slice(0, MAX_COMPARE) : [];
  } catch { return []; }
}
export const compareList = writable<string[]>(initial());
compareList.subscribe(v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } });

export function toggleCompare(id: string) {
  compareList.update(v => v.includes(id) ? v.filter(x => x !== id) : v.length >= MAX_COMPARE ? v : [...v, id]);
}
export const setCompare = (ids: string[]) => compareList.set([...new Set(ids)].slice(0, MAX_COMPARE));
export function moveCompare(id: string, step: number) {
  compareList.update(v => {
    const i = v.indexOf(id), j = i + step;
    if (i < 0 || j < 0 || j >= v.length) return v;
    const next = [...v];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
}
