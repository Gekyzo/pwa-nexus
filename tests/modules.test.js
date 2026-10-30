import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, switchModule, visibleSections } from '#modules';

test('MODULES is projects and ideas', () => {
  assert.deepEqual(MODULES, ['projects', 'ideas']);
});

test('turning ideas off hides the ideas section', () => {
  assert.deepEqual(visibleSections(['ideas']), ['projects', 'settings']);
  assert.deepEqual(visibleSections(['projects', 'ideas']), ['settings']);
});

test('visibleSections with no module off is the full navigation', () => {
  assert.deepEqual(visibleSections([]), ['projects', 'ideas', 'settings']);
});

test('visibleSections without projects keeps settings', () => {
  assert.deepEqual(visibleSections(['projects']), ['ideas', 'settings']);
});

test('visibleSections ignores an unknown id', () => {
  assert.deepEqual(visibleSections(['shops']), ['projects', 'ideas', 'settings']);
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
