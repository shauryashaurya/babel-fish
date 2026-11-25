import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// npm substitutes the maintained package; adapt the plugin's one call site.
// Deliberately fail on upstream changes so upgrades require compatibility review.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = join(root, 'node_modules/@sveltejs/vite-plugin-svelte');
const manifest = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'));
if (manifest.version !== '7.3.1') {
  throw new Error('Review the Svelte config merge adapter before upgrading vite-plugin-svelte.');
}
const pluginRequire = createRequire(join(pluginRoot, 'package.json'));
const replacement = pluginRequire('deepmerge/package.json');
if (replacement.name !== '@fastify/deepmerge' || replacement.version !== '3.2.4') {
  throw new Error('Expected the audited @fastify/deepmerge 3.2.4 override.');
}
const path = join(pluginRoot, 'src/utils/options.js');
const before = `deepmerge(result, /** @type {Partial<T>} */ (config), {
			// replace arrays
			arrayMerge: (target, source) => source ?? target
		})`;
const after = `deepmerge({
			symbols: true,
			// @fastify/deepmerge factory: preserve Svelte's array replacement policy.
			mergeArray: () => (target, source) => source ?? target
		})(result, /** @type {Partial<T>} */ (config))`;
const source = readFileSync(path, 'utf8');
if (source.includes(after) && !source.includes(before)) {
  console.log('Svelte config merge adapter already applied.');
} else if (source.split(before).length === 2) {
  writeFileSync(path, source.replace(before, after));
  console.log('Applied Svelte config merge adapter for @fastify/deepmerge.');
} else {
  throw new Error('Svelte config merge call changed; review the adapter before building.');
}