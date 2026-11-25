import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Resolve from the actual plugin, not a separate test-only dependency.
const require = createRequire(import.meta.url);
const pluginEntry = require.resolve('@sveltejs/vite-plugin-svelte');
const pluginRequire = createRequire(pluginEntry);
const factory = pluginRequire('deepmerge');
const merge = factory({ symbols: true, mergeArray: () => (target, source) => source ?? target });

test('the plugin resolves the maintained replacement and adapted call site', () => {
  const pkg = pluginRequire('deepmerge/package.json');
  assert.equal(pkg.name, '@fastify/deepmerge');
  assert.equal(pkg.version, '3.2.4');
  const source = readFileSync(join(dirname(pluginEntry), 'utils/options.js'), 'utf8');
  assert.ok(source.includes('mergeArray: () => (target, source) => source ?? target'));
  assert.ok(!source.includes('arrayMerge:'));
});

test('nested settings merge, arrays replace, and inputs remain unchanged', () => {
  const callback = () => 'hash';
  const symbol = Symbol('config');
  const target = { compilerOptions: { dev: true, cssHash: callback }, extensions: ['.svelte'], nested: { array: [1] } };
  const source = { compilerOptions: { dev: false }, extensions: ['.custom'], nested: { array: [2] }, [symbol]: 'kept' };
  const merged = merge(target, source);
  assert.deepEqual(merged.compilerOptions, { dev: false, cssHash: callback });
  assert.deepEqual(merged.extensions, ['.custom']);
  assert.deepEqual(merged.nested.array, [2]);
  assert.equal(merged[symbol], 'kept');
  assert.deepEqual(target.extensions, ['.svelte']);
  assert.equal(target.compilerOptions.dev, true);
  assert.deepEqual(merge({ value: true }, { value: undefined }), { value: undefined });
});

test('prototype keys are rejected from both inputs, including nested copies', () => {
  const malicious = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"polluted":true},"nested":{"__proto__":{"polluted":true},"safe":42}}');
  for (const result of [merge({}, malicious), merge(malicious, {}), merge({ nested: { existing: true } }, malicious)]) {
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(Object.getPrototypeOf(result.nested), Object.prototype);
    assert.equal(result.polluted, undefined);
    assert.equal(result.nested.polluted, undefined);
    assert.equal(result.nested.safe, 42);
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      assert.equal(Object.hasOwn(result, key), false);
      assert.equal(Object.hasOwn(result.nested, key), false);
    }
  }
  assert.equal({}.polluted, undefined);
});