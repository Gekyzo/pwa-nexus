import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SLUG } from '#config';
import { makeEntry } from '#queue';
import { DOC_KEY, MAX_LABEL, DEFAULT_PROJECTS, emptyDoc, normalizeDoc, findProject, addProject, renameProject, removeProject } from '#projects';

const entry = (repo, id) => makeEntry(repo, 'delete', { ref: { path: 'P', title: 'T' } }, { id, now: 1 });

test('the doc key has the slug (PROJ-1)', () => {
  assert.equal(DOC_KEY, `${APP_SLUG}.doc`);
});

test('a new doc has the three default projects and no queue (PROJ-1)', () => {
  assert.deepEqual(emptyDoc(), { version: 1, projects: DEFAULT_PROJECTS, queue: [] });
  assert.deepEqual(DEFAULT_PROJECTS.map((p) => p.repo), ['Gekyzo/shopping-list', 'Gekyzo/pwa-wardrobe', 'Gekyzo/pwa-financial-calculator']);
  emptyDoc().projects.push({ repo: 'x/y', label: 'x' });
  assert.equal(emptyDoc().projects.length, 3);
});

test('addProject takes owner/name, a URL or a .git name, and labels it with the name by default', () => {
  const state = { version: 1, projects: [], queue: [] };
  assert.deepEqual(addProject(state, ' Gekyzo/todo ').state.projects, [{ repo: 'Gekyzo/todo', label: 'todo' }]);
  assert.deepEqual(addProject(state, 'https://github.com/Gekyzo/todo.git', 'Todo').state.projects, [{ repo: 'Gekyzo/todo', label: 'Todo' }]);
  assert.deepEqual(state.projects, []);
});

test('an invalid or taken repository, or a long label, is an error (PROJ-1)', () => {
  const state = emptyDoc();
  assert.deepEqual(addProject(state, 'no-slash'), { state, error: { key: 'error.repoInvalid' } });
  assert.deepEqual(addProject(state, 'a/b/c'), { state, error: { key: 'error.repoInvalid' } });
  assert.deepEqual(addProject(state, 'gekyzo/SHOPPING-LIST'), { state, error: { key: 'error.repoTaken' } });
  assert.deepEqual(addProject(state, 'x/y', 'l'.repeat(MAX_LABEL + 1)), { state, error: { key: 'error.labelTooLong', params: { max: MAX_LABEL } } });
});

test('renameProject changes the label, and a blank label goes back to the name', () => {
  const state = emptyDoc();
  assert.equal(findProject(renameProject(state, 'Gekyzo/pwa-wardrobe', ' Ropa ').state, 'Gekyzo/pwa-wardrobe').label, 'Ropa');
  assert.equal(findProject(renameProject(state, 'Gekyzo/pwa-wardrobe', ' ').state, 'Gekyzo/pwa-wardrobe').label, 'pwa-wardrobe');
  assert.deepEqual(renameProject(state, 'x/y', 'z'), { state, error: { key: 'error.projectMissing' } });
});

test('removeProject drops the project and its queued actions (PROJ-2)', () => {
  const state = { ...emptyDoc(), queue: [entry('Gekyzo/pwa-wardrobe', '1'), entry('Gekyzo/shopping-list', '2')] };
  const next = removeProject(state, 'Gekyzo/pwa-wardrobe').state;
  assert.equal(findProject(next, 'Gekyzo/pwa-wardrobe'), null);
  assert.deepEqual(next.queue.map((e) => e.id), ['2']);
  assert.deepEqual(removeProject(state, 'x/y'), { state, error: { key: 'error.projectMissing' } });
});

test('normalizeDoc keeps a valid doc, drops unknown fields, and trims labels', () => {
  const data = { version: 1, projects: [{ repo: 'a/b', label: ' B ', extra: 1 }], queue: [{ ...entry('a/b', '1'), extra: 2 }], other: 3 };
  assert.deepEqual(normalizeDoc(data), { version: 1, projects: [{ repo: 'a/b', label: 'B' }], queue: [entry('a/b', '1')] });
});

test('normalizeDoc refuses a doc that is not valid', () => {
  const ok = { version: 1, projects: [{ repo: 'a/b', label: 'B' }], queue: [] };
  const bad = [
    null,
    [],
    { ...ok, version: 2 },
    { ...ok, projects: 'x' },
    { ...ok, queue: 'x' },
    { ...ok, projects: [{ repo: 'ab', label: 'B' }] },
    { ...ok, projects: [{ repo: 'a/b', label: ' ' }] },
    { ...ok, projects: [{ repo: 'a/b', label: 'B' }, { repo: 'A/B', label: 'C' }] },
    { ...ok, queue: [{ id: 'x' }] },
  ];
  for (const data of bad) assert.equal(normalizeDoc(data), null, JSON.stringify(data));
});
