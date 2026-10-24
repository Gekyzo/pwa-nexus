import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubError } from '#github';
import {
  ROADMAP_PATH,
  makeEntry,
  isEntry,
  applyEntry,
  messageOf,
  commitMessageOf,
  enqueue,
  discardEntry,
  pendingOf,
  settleQueue,
  viewOf,
  roadmapView,
  stopsSync,
  syncShare,
  syncRepo,
  hasSection,
  checkEach,
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
      remote.calls.push(['put', message.split('\n')[0]]);
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

test('stopsSync is true for auth, rateLimit and network only: a repository the token cannot reach does not stop the others (SYNC-7)', () => {
  assert.deepEqual(['auth', 'rateLimit', 'network', 'notFound', 'conflict', 'forbidden'].map(stopsSync), [true, true, true, false, false, false]);
});

test('commitMessageOf tags the subject and names the app and its version in a trailer (SYNC-4)', () => {
  assert.equal(commitMessageOf(add('C')), 'Add roadmap item: C [pwa-nexus]\n\nVia: pwa-nexus');
  assert.equal(commitMessageOf(add('C'), '0.1.5'), 'Add roadmap item: C [pwa-nexus]\n\nVia: pwa-nexus 0.1.5');
});

test('syncRepo puts the commit message with the version it gets (SYNC-4)', async () => {
  const client = fakeClient(MD);
  const messages = [];
  const put = client.putFile;
  client.putFile = (repo, path, args) => {
    messages.push(args.message);
    return put(repo, path, args);
  };
  await syncRepo({ client, repo: 'o/r', entries: [add('C', '1')], version: '0.1.5' });
  assert.deepEqual(messages, ['Add roadmap item: C [pwa-nexus]\n\nVia: pwa-nexus 0.1.5']);
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
    ['put', 'Add roadmap item: C [pwa-nexus]'],
    ['put', 'Delete roadmap item: A [pwa-nexus]'],
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
  assert.deepEqual(result, { file: null, done: [], stale: [], sent: [], error: { type: 'notFound' } });
});

test('syncRepo marks an edit stale when the item changed on GitHub since it was read (SYNC-6)', async () => {
  const client = fakeClient(MD.replace('**A.** one', '**A.** one, extended on the computer'));
  const edit = entry('edit', { ref: { path: 'Planned', title: 'A' }, base: { title: 'A', body: 'one' }, item: { title: 'A2', body: 'one' } }, '1');
  const result = await syncRepo({ client, repo: 'o/r', entries: [edit] });
  assert.deepEqual(result.stale, ['1']);
  assert.match(client.remote.text, /extended on the computer/);
});

test('syncRepo marks a delete stale when the item changed on GitHub since it was read (SYNC-6)', async () => {
  const client = fakeClient(MD.replace('**A.** one', '**A.** one, extended'));
  const del = entry('delete', { ref: { path: 'Planned', title: 'A' }, base: { title: 'A', body: 'one' } }, '1');
  const result = await syncRepo({ client, repo: 'o/r', entries: [del] });
  assert.deepEqual(result.stale, ['1']);
  assert.match(client.remote.text, /one, extended/);
});

test('an edit whose base matches the remote item applies', () => {
  const edit = entry('edit', { ref: { path: 'Planned', title: 'A' }, base: { title: 'A', body: 'one' }, item: { title: 'A2', body: 'one' } });
  assert.match(applyEntry(MD, edit).text, /\*\*A2\.\*\* one/);
  assert.deepEqual(applyEntry(MD.replace('one', 'uno'), edit), { text: MD.replace('one', 'uno'), error: { key: 'error.itemChanged' } });
});

test('isEntry checks the arguments of each action, so a broken import cannot reach the screen', () => {
  const ref = { path: 'P', title: 'T' };
  const item = { title: 'T', body: '' };
  const good = [
    ['add', { path: 'P', item }],
    ['edit', { ref, item }],
    ['edit', { ref, item, base: item }],
    ['move', { ref, to: 'Q' }],
    ['delete', { ref }],
    ['delete', { ref, base: item }],
  ];
  const bad = [
    ['add', { path: 'P' }],
    ['add', { item }],
    ['edit', {}],
    ['edit', { ref, item: { title: 'T' } }],
    ['edit', { ref, item, base: 'x' }],
    ['move', { ref }],
    ['delete', { ref: { path: 'P' } }],
  ];
  for (const [op, args] of good) assert.equal(isEntry(entry(op, args)), true, `${op} ${JSON.stringify(args)}`);
  for (const [op, args] of bad) assert.equal(isEntry(entry(op, args)), false, `${op} ${JSON.stringify(args)}`);
});

test('applyEntry never throws on broken arguments: the entry fails instead', () => {
  assert.deepEqual(applyEntry(MD, { op: 'edit', args: {} }), { text: MD, error: { key: 'error.unknownAction' } });
  assert.deepEqual(viewOf(MD, [{ ...add('C', '1'), args: {} }]).failed, ['1']);
});

test('hasSection matches the exact path of a section only (UI-3)', () => {
  const { sections } = roadmapView({ text: '## Now\n\n### Planned\n\n## Deferred\n' }, []);
  assert.equal(hasSection(sections, 'Now'), true);
  assert.equal(hasSection(sections, 'Now / Planned'), true);
  assert.equal(hasSection(sections, 'Planned'), false);
  assert.equal(hasSection(sections, 'deferred'), false);
  assert.equal(hasSection([], 'Now'), false);
});

const addTo = (repo, title, id = `${repo}-${title}`) => makeEntry(repo, 'add', { path: 'Planned', item: { title, body: '' } }, { id, now: 1 });

test('checkEach returns the entries of every repository, without a no-op action (UI-3)', () => {
  const plans = [
    { repo: 'o/a', text: MD, entries: [addTo('o/a', 'C')] },
    { repo: 'o/b', text: MD, entries: [addTo('o/b', 'C'), entry('move', { ref: { path: 'Planned', title: 'A' }, to: 'Planned' })] },
  ];
  assert.deepEqual(checkEach(plans).entries.map((one) => one.id), ['o/a-C', 'o/b-C']);
});

test('checkEach stops at the first repository where an action fails, also the second one (UI-3)', () => {
  const plans = [
    { repo: 'o/a', text: MD, entries: [addTo('o/a', 'C')] },
    { repo: 'o/b', text: MD, entries: [addTo('o/b', 'A')] },
    { repo: 'o/c', text: '## Deferred\n', entries: [addTo('o/c', 'C')] },
  ];
  const before = structuredClone(plans);
  assert.deepEqual(checkEach(plans), { repo: 'o/b', error: { key: 'error.titleTaken' } });
  assert.equal(checkEach([plans[0], plans[2]]).repo, 'o/c');
  assert.equal(checkEach([{ repo: 'o/d', text: null, entries: [addTo('o/d', 'C')] }]).repo, 'o/d');
  assert.deepEqual(plans, before);
});

test('syncShare is the part of the repositories that the sync has done (SYNC-9)', () => {
  assert.equal(syncShare(0, 4), 0);
  assert.equal(syncShare(1, 4), 0.25);
  assert.equal(syncShare(4, 4), 1);
});

test('syncShare is 0 with no repository, and never more than 1 (SYNC-9)', () => {
  assert.equal(syncShare(0, 0), 0);
  assert.equal(syncShare(3, 2), 1);
  assert.equal(syncShare(-1, 2), 0);
});

test('syncRepo skips an action that left the queue during the sync: no commit, neither done nor stale (UI-4, PROJ-2)', async () => {
  const client = fakeClient(MD);
  const entries = [add('C', '1'), add('D', '2'), add('E', '3')];
  const kept = new Set(['1', '3']);
  const result = await syncRepo({ client, repo: 'o/r', entries, keep: ({ id }) => kept.has(id) });
  assert.deepEqual(result.done, ['1', '3']);
  assert.deepEqual(result.stale, []);
  assert.deepEqual(client.remote.calls.map(([, message]) => message).slice(1), ['Add roadmap item: C [pwa-nexus]', 'Add roadmap item: E [pwa-nexus]']);
});

test('syncRepo asks keep just before each commit, so an action dropped while another one is sent is not sent', async () => {
  const client = fakeClient(MD);
  const kept = new Set(['1', '2']);
  const put = client.putFile;
  // The user drops action 2 while action 1 is on its way.
  client.putFile = async (...args) => {
    kept.delete('2');
    return put(...args);
  };
  const result = await syncRepo({ client, repo: 'o/r', entries: [add('C', '1'), add('D', '2')], keep: ({ id }) => kept.has(id) });
  assert.deepEqual(result.done, ['1']);
  assert.equal(client.remote.calls.filter(([kind]) => kind === 'put').length, 1);
});

test('syncRepo names the action it sends, and null once the answer is in', async () => {
  const client = fakeClient(MD);
  const seen = [];
  await syncRepo({ client, repo: 'o/r', entries: [add('C', '1')], onSend: (id) => seen.push(id) });
  assert.deepEqual(seen, ['1', null]);
});

// A client whose next commit reaches GitHub but whose answer is lost.
const losingClient = (text) => {
  const client = fakeClient(text);
  const put = client.putFile;
  let lose = true;
  client.putFile = async (...args) => {
    await put(...args);
    if (lose) {
      lose = false;
      throw new GitHubError('network');
    }
    return client.remote.sha;
  };
  return client;
};

const ref = (title) => ({ path: 'Planned', title });

test('syncRepo reports an action whose commit had no answer as sent (SYNC-11)', async () => {
  const client = losingClient(MD);
  const result = await syncRepo({ client, repo: 'o/r', entries: [add('C', '1'), add('D', '2')] });
  assert.deepEqual(result.done, []);
  assert.deepEqual(result.sent, ['1']);
  assert.deepEqual(result.error, { type: 'network' });
});

test('settleQueue marks the sent entries, and isEntry accepts the mark (SYNC-11)', () => {
  const state = { version: 1, projects: [], queue: [add('C', '1'), add('D', '2')] };
  const next = settleQueue(state, { done: [], stale: [], sent: ['1'] });
  assert.equal(next.queue[0].sent, true);
  assert.equal(next.queue[1].sent, undefined);
  assert.ok(isEntry(next.queue[0]));
  assert.equal(isEntry({ ...next.queue[0], sent: 'yes' }), false);
});

test('syncRepo counts a sent action that GitHub already has as done, with no commit (SYNC-11)', async () => {
  const after = {
    add: '## Planned\n\n- **A.** one\n- **B.** two\n- **C.**\n\n## Deferred\n',
    edit: '## Planned\n\n- **A2.** new\n- **B.** two\n\n## Deferred\n',
    move: '## Planned\n\n- **B.** two\n\n## Deferred\n\n- **A.** one\n',
    delete: '## Planned\n\n- **B.** two\n\n## Deferred\n',
  };
  const sentEntries = {
    add: add('C', 'x'),
    edit: entry('edit', { ref: ref('A'), base: { title: 'A', body: 'one' }, item: { title: 'A2', body: 'new' } }, 'x'),
    move: entry('move', { ref: ref('A'), to: 'Deferred' }, 'x'),
    delete: entry('delete', { ref: ref('A'), base: { title: 'A', body: 'one' } }, 'x'),
  };
  for (const op of Object.keys(after)) {
    const client = fakeClient(after[op]);
    const result = await syncRepo({ client, repo: 'o/r', entries: [{ ...sentEntries[op], sent: true }] });
    assert.deepEqual(result.done, ['x'], op);
    assert.deepEqual(result.stale, [], op);
    assert.equal(client.remote.calls.filter(([kind]) => kind === 'put').length, 0, op);
  }
});

test('syncRepo commits a sent action that never reached GitHub', async () => {
  const client = fakeClient(MD);
  const result = await syncRepo({ client, repo: 'o/r', entries: [{ ...add('C', '1'), sent: true }] });
  assert.deepEqual(result.done, ['1']);
  assert.equal(client.remote.calls.filter(([kind]) => kind === 'put').length, 1);
});

test('syncRepo still marks a sent action stale when GitHub has other text, and an unsent one too', async () => {
  const other = '## Planned\n\n- **A.** changed elsewhere\n- **B.** two\n\n## Deferred\n';
  const edit = entry('edit', { ref: ref('A'), base: { title: 'A', body: 'one' }, item: { title: 'A2', body: 'new' } }, 'x');
  for (const sent of [true, undefined]) {
    const result = await syncRepo({ client: fakeClient(other), repo: 'o/r', entries: [{ ...edit, sent }] });
    assert.deepEqual(result.stale, ['x'], String(sent));
  }
  // An unsent delete of an item that is gone stays stale, as before (SYNC-6).
  const gone = entry('delete', { ref: ref('A'), base: { title: 'A', body: 'one' } }, 'y');
  const result = await syncRepo({ client: fakeClient('## Planned\n\n- **B.** two\n'), repo: 'o/r', entries: [gone] });
  assert.deepEqual(result.stale, ['y']);
});
