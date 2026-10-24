import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SLUG } from '#config';
import { makeEntry } from '#queue';
import { DOC_KEY, MAX_LABEL, DEFAULT_PROJECTS, emptyDoc, normalizeDoc, offerDefaults, findProject, addProject, renameProject, removeProject, restoreProject } from '#projects';

const entry = (repo, id) => makeEntry(repo, 'delete', { ref: { path: 'P', title: 'T' } }, { id, now: 1 });

test('the doc key has the slug (PROJ-1)', () => {
  assert.equal(DOC_KEY, `${APP_SLUG}.doc`);
});

test('a new doc has the seven default projects and no queue (PROJ-1)', () => {
  assert.deepEqual(emptyDoc(), { version: 1, projects: DEFAULT_PROJECTS, queue: [], defaults: DEFAULT_PROJECTS.map((p) => p.repo) });
  assert.deepEqual(DEFAULT_PROJECTS.map((p) => p.repo), [
    'Gekyzo/shopping-list',
    'Gekyzo/pwa-wardrobe',
    'Gekyzo/pwa-financial-calculator',
    'Gekyzo/pwa-shifts',
    'Gekyzo/pwa-nexus',
    'Gekyzo/pwa-lists',
    'Gekyzo/pwa-fittings',
  ]);
  emptyDoc().projects.push({ repo: 'x/y', label: 'x' });
  assert.equal(emptyDoc().projects.length, 7);
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

const ALL = DEFAULT_PROJECTS.map((p) => p.repo);
const FIRST = ['Gekyzo/shopping-list', 'Gekyzo/pwa-wardrobe', 'Gekyzo/pwa-financial-calculator'];
const docOf = (repos, defaults) => ({
  version: 1,
  projects: repos.map((repo) => ({ repo, label: repo.split('/')[1] })),
  queue: [],
  ...(defaults ? { defaults } : {}),
});

test('offerDefaults adds the new default projects once to a stored list (PROJ-4)', () => {
  const next = offerDefaults(docOf(FIRST));
  assert.deepEqual(next.projects.map((p) => p.repo), ALL);
  assert.deepEqual(next.defaults, ALL);
  assert.deepEqual(offerDefaults(next), next);
});

test('offerDefaults never adds back a default project that the user removed (PROJ-4)', () => {
  const removedFirst = offerDefaults(docOf(['Gekyzo/shopping-list', 'Gekyzo/pwa-financial-calculator']));
  assert.equal(findProject(removedFirst, 'Gekyzo/pwa-wardrobe'), null);
  assert.ok(findProject(removedFirst, 'Gekyzo/pwa-shifts'));
  const removedNew = offerDefaults(docOf(FIRST, ALL));
  assert.deepEqual(removedNew.projects.map((p) => p.repo), FIRST);
});

test('offerDefaults keeps a project the user added already, in any case, and changes no input', () => {
  const state = docOf([...FIRST, 'gekyzo/PWA-SHIFTS']);
  const next = offerDefaults(state);
  assert.deepEqual(next.projects.map((p) => p.repo), [...FIRST, 'gekyzo/PWA-SHIFTS', 'Gekyzo/pwa-nexus', 'Gekyzo/pwa-lists', 'Gekyzo/pwa-fittings']);
  assert.equal(state.defaults, undefined);
  assert.equal(state.projects.length, 4);
});

test('normalizeDoc keeps the offered defaults, and refuses a list that is not of repositories', () => {
  assert.deepEqual(normalizeDoc(docOf(FIRST, ALL)).defaults, ALL);
  assert.equal(normalizeDoc(docOf(FIRST)).defaults, undefined);
  for (const defaults of ['x', [1], ['nope']]) assert.equal(normalizeDoc({ ...docOf(FIRST), defaults }), null, JSON.stringify(defaults));
});

const doc = (repos, queue = []) => ({ version: 1, projects: repos.map((repo) => ({ repo, label: repo })), queue });

test('restoreProject puts a removed project back at its place, with its actions after the others (UI-10)', () => {
  const removed = { project: { repo: 'o/b', label: 'o/b' }, index: 1, entries: [entry('o/b', '2'), entry('o/b', '3')] };
  // Meanwhile a sync committed action 1 of o/a, and the user queued action 4.
  const now = doc(['o/a', 'o/c'], [entry('o/a', '4')]);
  const { state } = restoreProject(now, removed);
  assert.deepEqual(state.projects.map(({ repo }) => repo), ['o/a', 'o/b', 'o/c']);
  assert.deepEqual(state.queue.map(({ id }) => id), ['4', '2', '3']);
});

test('restoreProject leaves out the actions that GitHub has, and does nothing for a project that is back already', () => {
  const removed = { project: { repo: 'o/b', label: 'o/b' }, index: 0, entries: [entry('o/b', '2'), entry('o/b', '3')] };
  const { state } = restoreProject(doc(['o/a']), removed, ['2']);
  assert.deepEqual(state.queue.map(({ id }) => id), ['3']);
  const same = doc(['o/b']);
  assert.equal(restoreProject(same, removed).state, same);
});

test('normalizeDoc keeps the sent mark of an entry, so it outlives a restart (SYNC-11)', () => {
  const sent = { ...entry('o/a', '1'), sent: true };
  const doc = normalizeDoc({ version: 1, projects: [{ repo: 'o/a', label: 'A' }], queue: [sent, entry('o/a', '2')] });
  assert.equal(doc.queue[0].sent, true);
  assert.equal('sent' in doc.queue[1], false);
});
