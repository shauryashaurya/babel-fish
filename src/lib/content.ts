type Dictionary = {[key: string]: unknown};
let dictionary: Dictionary = {};

export const setCopy = (copy: Dictionary) => { dictionary = copy; };

const lookup = (key: string) => key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Dictionary)[part] : undefined), dictionary);

/** Reads text from data/content/copy.json and fills {placeholders}. */
export function t(key: string, values: Record<string, string | number> = {}): string {
  const text = lookup(key);
  if (typeof text !== 'string') return key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

export function list(key: string): string[] {
  const value = lookup(key);
  return Array.isArray(value) ? (value as string[]) : [];
}
