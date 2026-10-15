import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubError } from '#github';
import {
  ROADMAP_PATH,
  makeEntry,
  isEntry,
  applyEntry,
  messageOf,
  enqueue,
  discardEntry,
  pendingOf,
  settleQueue,
  viewOf,
  roadmapView,
  stopsSync,
  syncRepo,
} from '#queue';

const MD = '## Planned\n\n- **A.** one\n- **B.** two\n\n## Deferred\n';
const entry = (op, args, id = op) => makeEntry('o/r', op, args, { id, now: 1 });
const add = (title, id = `add-${title}`) => entry('add', { path: 'Planned', item: { title, body: '' } }, id);

// A repository on GitHub in memory. `fails.get` and `fails.put` hold, in order, the error of each
// call, or null for a call that works.
const fakeClient = (text, fails = {}) => {
  const remote = { text, sha: 's0', calls: [] };
  const queue = { get: [...(fails.get ?? [])], put: [...(fails.put ?? [])] };
  let puts = 0;
  return {
    remote,
    getFile: async (repo, path) => {
      remote.calls.push(['get', repo, path]);
      const error = queue.get.shift();
      if (error) throw error;
      return { text: remote.text, sha: remote.sha };
    },
    putFile: async (repo, path, { text: next, sha, message }) => {
      remote.calls.push(['put', message]);
      const error = queue.put.shift();
      if (error) throw error;
      if (sha !== remote.sha) throw new GitHubError('conflict', 409);
      puts += 1;
      remote.text = next;
      remote.sha = `s${puts}`;
      return remote.sha;
    },
  };
};

test('makeEntry builds a queue entry (SYNC-1)', () => {
  assert.deepEqual(makeEntry('o/r', 'delete', { ref: { path: 'P', title: 'T' } }, { id: 'x', now: 5 }), {
    id: 'x',
    repo: 'o/r',
    op: 'delete',
    args: { ref: { path: 'P', title: 'T' } },
    createdAt: 5,
  });
  assert.equal(typeof makeEntry('o/r', 'delete', {}).id, 'string');
});

test('isEntry accepts a stored entry and refuses a broken one', () => {
  assert.equal(isEntry(add('X')), true);
  assert.equal(isEntry({ ...add('X'), stale: true }), true);
  for (const bad of [null, {}, { ...add('X'), op: 'rename' }, { ...add('X'), id: '' }, { ...add('X'), repo: 'nope' }, { ...add('X'), args: null }]) {
    assert.equal(isEntry(bad), false, JSON.stringify(bad));
  }
});

test('applyEntry runs each operation, and an unknown one is an error', () => {
  assert.match(applyEntry(MD, add('C')).text, /- \*\*C\.\*\*/);
  assert.match(applyEntry(MD, entry('edit', { ref: { path: 'Planned', title: 'A' }, item: { title: 'A2', body: '' } })).text, /A2/);
  assert.match(applyEntry(MD, entry('move', { ref: { path: 'Planned', title: 'A' }, to: 'Deferred' })).text, /## Deferred\n\n- \*\*A\.\*\* one/);
  assert.doesNotMatch(applyEntry(MD, entry('delete', { ref: { path: 'Planned', title: 'A' } })).text, /\*\*A\./);
  assert.deepEqual(applyEntry(MD, { op: 'rename', args: {} }), { text: MD, error: { key: 'error.unknownAction' } });
});

test('messageOf names each action as a commit subject (SYNC-4)', () => {
  const ref = { path: 'Planned', title: 'A' };
  assert.equal(messageOf(add('C')), 'Add roadmap item: C');
  assert.equal(messageOf(entry('edit', { ref, item: { title: 'A2', body: '' } })), 'Edit roadmap item: A');
  assert.equal(messageOf(entry('move', { ref, to: 'Pro / Cloud' })), 'Move roadmap item to Pro / Cloud: A');
  assert.equal(messageOf(entry('delete', { ref })), 'Delete roadmap item: A');
});

test('enqueue appends, pendingOf keeps the order of one repository, discardEntry removes one', () => {
  const state = { version: 1, projects: [], queue: [] };
  const one = enqueue(state, add('C', '1')).state;
  const two = enqueue(one, { ...add('D', '2'), repo: 'x/y' }).state;
  const three = enqueue(two, add('E', '3')).state;
  assert.deepEqual(state.queue, []);
  assert.deepEqual(pendingOf(three, 'o/r').map((e) => e.id), ['1', '3']);
  assert.deepEqual(discardEntry(three, '1').state.queue.map((e) => e.id), ['2', '3']);
});

test('settleQueue removes the done entries and marks the stale ones', () => {
  const state = { version: 1, projects: [], queue: [add('C', '1'), add('D', '2'), add('E', '3')] };
  const next = settleQueue(state, { done: ['1'], stale: ['3'] });
  assert.deepEqual(next.queue.map(({ id, stale }) => [id, Boolean(stale)]), [['2', false], ['3', true]]);
  assert.equal(state.queue.length, 3);
});

test('viewOf applies the waiting entries in order and lists the ones that fail (SYNC-2)', () => {
  const entries = [add('C', '1'), entry('delete', { ref: { path: 'Planned', title: 'Gone' } }, '2'), { ...add('S', '3'), stale: true }];
  const { text, failed } = viewOf(MD, entries);
  assert.match(text, /\*\*C\./);
  assert.doesNotMatch(text, /\*\*S\./);
  assert.deepEqual(failed, ['2']);
});

test('roadmapView has no text for a project with no cache or no ROADMAP.md', () => {
  assert.deepEqual(roadmapView(undefined, []), { text: null, sections: [], failed: [] });
  assert.deepEqual(roadmapView({ missing: true, fetchedAt: 1 }, []), { text: null, sections: [], failed: [] });
  assert.deepEqual(roadmapView({ text: MD, sha: 's', fetchedAt: 1 }, [add('C')]).sections[0].items.map((i) => i.title), ['A', 'B', 'C']);
});

test('stopsSync is true for auth, rateLimit and network only (SYNC-7)', () => {
  assert.deepEqual(['auth', 'rateLimit', 'network', 'notFound', 'conflict'].map(stopsSync), [true, true, true, false, false]);
});

test('syncRepo commits each action in order, one commit for each (SYNC-3, SYNC-4)', async () => {
  const client = fakeClient(MD);
  const entries = [add('C', '1'), entry('delete', { ref: { path: 'Planned', title: 'A' } }, '2')];
  const result = await syncRepo({ client, repo: 'o/r', entries });
  assert.deepEqual(result.done, ['1', '2']);
  assert.deepEqual(result.stale, []);
  assert.equal(result.error, null);
  assert.deepEqual(client.remote.calls, [
    ['get', 'o/r', ROADMAP_PATH],
    ['put', 'Add roadmap item: C'],
    ['put', 'Delete roadmap item: A'],
  ]);
  assert.deepEqual(result.file, { text: client.remote.text, sha: 's2' });
  assert.equal(client.remote.text, '## Planned\n\n- **B.** two\n- **C.**\n\n## Deferred\n');
});

test('syncRepo removes an action that changes nothing with no commit (SYNC-3)', async () => {
  const client = fakeClient(MD);
  const same = entry('edit', { ref: { path: 'Planned', title: 'A' }, item: { title: 'A', body: 'one' } }, '1');
  const result = await syncRepo({ client, repo: 'o/r', entries: [same] });
  assert.deepEqual(result.done, ['1']);
  assert.deepEqual(client.remote.calls.filter(([kind]) => kind === 'put'), []);
});

test('syncRepo gets the file again after one conflict and retries (SYNC-5)', async () => {
  const client = fakeClient(MD, { put: [new GitHubError('conflict', 409)] });
  const result = await syncRepo({ client, repo: 'o/r', entries: [add('C', '1')] });
  assert.deepEqual(result.done, ['1']);
  assert.deepEqual(client.remote.calls.map(([kind]) => kind), ['get', 'put', 'get', 'put']);
});

test('syncRepo stops the repository on a second conflict and keeps the action (SYNC-5)', async () => {
  const conflict = () => new GitHubError('conflict', 409);
  const client = fakeClient(MD, { put: [conflict(), conflict()] });
  const result = await syncRepo({ client, repo: 'o/r', entries: [add('C', '1'), add('D', '2')] });
  assert.deepEqual(result.done, []);
  assert.deepEqual(result.error, { type: 'conflict' });
});

test('syncRepo marks an action stale when the remote item was renamed, and goes on (SYNC-6)', async () => {
  const client = fakeClient(MD.replace('**A.**', '**A renamed.**'));
  const edit = entry('edit', { ref: { path: 'Planned', title: 'A' }, item: { title: 'A2', body: '' } }, '1');
  const result = await syncRepo({ client, repo: 'o/r', entries: [edit, add('C', '2')] });
  assert.deepEqual(result.stale, ['1']);
  assert.deepEqual(result.done, ['2']);
  assert.match(client.remote.text, /\*\*A renamed\.\*\*/);
});

test('syncRepo skips an entry that is stale already', async () => {
  const client = fakeClient(MD);
  const result = await syncRepo({ client, repo: 'o/r', entries: [{ ...add('C', '1'), stale: true }] });
  assert.deepEqual([result.done, result.stale], [[], []]);
  assert.deepEqual(client.remote.calls.map(([kind]) => kind), ['get']);
});

test('syncRepo stops on a network error and keeps the actions not sent (SYNC-7)', async () => {
  const client = fakeClient(MD, { put: [null, new GitHubError('network')] });
  const result = await syncRepo({ client, repo: 'o/r', entries: [add('C', '1'), add('D', '2'), add('E', '3')] });
  assert.deepEqual(result.done, ['1']);
  assert.deepEqual(result.error, { type: 'network' });
  assert.equal(result.file.sha, 's1');
});

test('syncRepo with no ROADMAP.md returns no file and does nothing', async () => {
  const client = fakeClient(MD, { get: [new GitHubError('notFound', 404)] });
  const result = await syncRepo({ client, repo: 'o/r', entries: [add('C', '1')] });
  assert.deepEqual(result, { file: null, done: [], stale: [], error: { type: 'notFound' } });
});
