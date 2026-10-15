import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, switchModule, visibleSections } from '#modules';

test('MODULES is projects', () => {
  assert.deepEqual(MODULES, ['projects']);
});

test('visibleSections with no module off is the full navigation', () => {
  assert.deepEqual(visibleSections([]), ['projects', 'settings']);
});

test('visibleSections without projects keeps settings', () => {
  assert.deepEqual(visibleSections(['projects']), ['settings']);
});

test('visibleSections ignores an unknown id', () => {
  assert.deepEqual(visibleSections(['shops']), ['projects', 'settings']);
});

test('switchModule turns a module off and on', () => {
  assert.deepEqual(switchModule([], 'projects', false), ['projects']);
  assert.deepEqual(switchModule(['projects'], 'projects', true), []);
  assert.deepEqual(switchModule([], 'projects', true), []);
});

test('switchModule ignores an unknown id and does not change its input', () => {
  const off = ['projects'];
  assert.deepEqual(switchModule(off, 'shops', false), ['projects']);
  assert.deepEqual(off, ['projects']);
});
