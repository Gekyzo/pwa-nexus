import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SLUG } from '#config';
import { CACHE_KEY, emptyCache, normalizeCache, putEntry, dropEntry } from '#cache';

const file = { text: '# R\n', sha: 's', fetchedAt: 1 };

test('the cache key has the slug (CACHE-1)', () => {
  assert.equal(CACHE_KEY, `${APP_SLUG}.cache`);
  assert.deepEqual(emptyCache(), {});
});

test('putEntry replaces the entry of one repository, dropEntry removes it', () => {
  const cache = putEntry({}, 'a/b', file);
  assert.deepEqual(putEntry(cache, 'a/b', { missing: true, fetchedAt: 2 }), { 'a/b': { missing: true, fetchedAt: 2 } });
  assert.deepEqual(dropEntry(cache, 'a/b'), {});
  assert.deepEqual(cache, { 'a/b': file });
});

test('normalizeCache keeps file and missing entries, and drops unknown fields', () => {
  assert.deepEqual(normalizeCache({ 'a/b': { ...file, x: 1 }, 'c/d': { missing: true, fetchedAt: 3, text: 'x' } }), {
    'a/b': file,
    'c/d': { missing: true, fetchedAt: 3 },
  });
});

test('normalizeCache refuses a cache that is not valid', () => {
  for (const data of [null, [], 'x', { 'a/b': { text: 'x', fetchedAt: 1 } }, { 'a/b': { text: 'x', sha: 's' } }]) {
    assert.equal(normalizeCache(data), null, JSON.stringify(data));
  }
});
