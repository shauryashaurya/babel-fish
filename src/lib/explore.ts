import {families, familyOf} from './architecture';
import {models} from './catalog';
import {slms} from './learning';

/**
 * Where a model's architecture is explored: the Architectures page for its family, with the model as the worked
 * example and the diagram open. Accepts a gallery id or a small-model id. Null for API-only models and unknown ids.
 */
export function exploreHref(id: string): string | null {
  const m = models.find(x => x.id === id);
  if (m) { const f = familyOf(m); return f ? `#/architecture/family/${f.id}/${encodeURIComponent(m.id)}` : null; }
  const s = slms.find(x => x.id === id);
  if (!s) return null;
  if (s.galleryModelId && models.some(x => x.id === s.galleryModelId)) return exploreHref(s.galleryModelId);
  const f = s.family ? families.find(x => x.id === s.family) : null;
  return f ? `#/architecture/family/${f.id}/${encodeURIComponent(s.id)}` : null;
}
