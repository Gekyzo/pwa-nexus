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
  restoreEntry,
  withoutEntries,
  undoDeleteOf,
  hasSection,
  checkEach,
  fileOf,
} from '#queue';
import { ideaText } from '#ideas';

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

test('restoreEntry puts a discarded action back at its place in the queue as it is now (UI-10)', () => {
  const discarded = add('C', '2');
  // Meanwhile action 1 was committed and action 4 was queued.
  const now = { version: 1, projects: [], queue: [add('D', '3'), add('E', '4')] };
  assert.deepEqual(restoreEntry(now, discarded, 1).state.queue.map(({ id }) => id), ['3', '2', '4']);
  assert.deepEqual(restoreEntry(now, discarded, 9).state.queue.map(({ id }) => id), ['3', '4', '2']);
});

test('restoreEntry does nothing for an action that is in the queue already', () => {
  const now = { version: 1, projects: [], queue: [add('C', '2')] };
  assert.equal(restoreEntry(now, add('C', '2'), 0).state, now);
});

test('withoutEntries drops the actions that GitHub has from a doc to go back to (UI-10)', () => {
  const old = { version: 1, projects: [], queue: [add('C', '1'), add('D', '2')] };
  assert.deepEqual(withoutEntries(old, ['1']).queue.map(({ id }) => id), ['2']);
  assert.equal(old.queue.length, 2);
});

test('syncRepo keeps a sent delete stale while an item still has its title or its body (SYNC-11)', async () => {
  const del = { ...entry('delete', { ref: ref('A'), base: { title: 'A', body: 'one' } }, 'x'), sent: true };
  // Renamed elsewhere before the delete landed: the body is still there.
  const renamed = await syncRepo({ client: fakeClient('## Planned\n\n- **A2.** one\n- **B.** two\n'), repo: 'o/r', entries: [del] });
  assert.deepEqual(renamed.stale, ['x']);
  // Moved to another section: the title is still there.
  const moved = await syncRepo({ client: fakeClient('## Planned\n\n- **B.** two\n\n## Deferred\n\n- **A.** one\n'), repo: 'o/r', entries: [del] });
  assert.deepEqual(moved.stale, ['x']);
});

test('viewOf shows a sent action that the text already has as applied, not as failed (SYNC-11)', () => {
  const sentAdd = { ...entry('add', { path: 'Planned', item: { title: 'A', body: 'one' } }, 'x'), sent: true };
  assert.deepEqual(viewOf(MD, [sentAdd]), { text: MD, failed: [] });
});

test('restoreEntry does not put back an action that GitHub has (UI-10)', () => {
  const now = { version: 1, projects: [], queue: [] };
  assert.equal(restoreEntry(now, add('C', '2'), 0, ['2']).state, now);
});

test('undoDeleteOf discards a delete that surely was not sent, and re-adds the item as maybe there otherwise (UI-4)', () => {
  const item = { title: 'A', body: 'one' };
  const del = entry('delete', { ref: ref('A'), base: item }, 'd');
  const state = { version: 1, projects: [], queue: [del] };
  assert.deepEqual(undoDeleteOf(state, del, { maybeSent: false }), { discard: true, readd: false });
  // On its way, or sent with no answer: GitHub may have it.
  assert.deepEqual(undoDeleteOf(state, del, { maybeSent: true }), { discard: true, readd: true });
  assert.deepEqual(undoDeleteOf({ ...state, queue: [{ ...del, sent: true }] }, del, { maybeSent: false }), { discard: true, readd: true });
  // Committed already: only the add.
  assert.deepEqual(undoDeleteOf({ ...state, queue: [] }, del, { maybeSent: false }), { discard: false, readd: true });
});

const IDEAS = '# Ideas\n\n## Car log\n\n### Features\n\n- **Fuel.**\n\n### Specs\n\n### Notes\n';
const idea = (op, args, id = op) => makeEntry('o/r', op, args, { id, now: 1, file: 'IDEAS.md' });

test('makeEntry puts the file on an entry only when it is not ROADMAP.md (SYNC-1)', () => {
  assert.equal(idea('addIdea', { name: 'X' }).file, 'IDEAS.md');
  assert.equal('file' in makeEntry('o/r', 'addIdea', { name: 'X' }, { file: ROADMAP_PATH }), false);
  assert.equal(fileOf(idea('addIdea', { name: 'X' })), 'IDEAS.md');
  assert.equal(fileOf(add('X')), ROADMAP_PATH);
});

test('isEntry accepts each idea op and refuses bad args (SYNC-1)', () => {
  const good = [
    idea('addIdea', { name: 'X' }),
    idea('renameIdea', { name: 'X', to: 'Y', base: '## X' }),
    idea('renameIdea', { name: 'X', to: 'Y' }),
    idea('deleteIdea', { name: 'X', base: '## X' }),
    idea('restoreIdea', { name: 'X', lines: '## X' }),
  ];
  for (const one of good) assert.equal(isEntry(one), true, JSON.stringify(one));
  const bad = [
    idea('addIdea', {}),
    idea('renameIdea', { name: 'X' }),
    idea('renameIdea', { name: 'X', to: 'Y', base: 3 }),
    idea('deleteIdea', { base: '## X' }),
    idea('restoreIdea', { name: 'X' }),
    { ...idea('addIdea', { name: 'X' }), file: 3 },
  ];
  for (const one of bad) assert.equal(isEntry(one), false, JSON.stringify(one));
});

test('applyEntry runs the idea ops', () => {
  assert.match(applyEntry(IDEAS, idea('addIdea', { name: 'Boat' })).text, /## Boat\n\n### Features/);
  assert.match(applyEntry(IDEAS, idea('renameIdea', { name: 'Car log', to: 'Mileage', base: '## Car log\n\n### Features\n\n- **Fuel.**\n\n### Specs\n\n### Notes' })).text, /## Mileage\n/);
  assert.equal(applyEntry(IDEAS, idea('deleteIdea', { name: 'Car log' })).text, '# Ideas\n');
  assert.match(applyEntry('# Ideas\n', idea('restoreIdea', { name: 'Car log', lines: '## Car log\n\n### Notes' })).text, /## Car log\n\n### Notes\n$/);
});

test('renameIdea and deleteIdea with a changed base are error.itemChanged (SYNC-6)', () => {
  for (const op of ['renameIdea', 'deleteIdea']) {
    const result = applyEntry(IDEAS, idea(op, { name: 'Car log', to: 'Mileage', base: '## Car log' }));
    assert.deepEqual(result, { text: IDEAS, error: { key: 'error.itemChanged' } }, op);
  }
});

test('pendingOf keeps the files apart', () => {
  const state = { version: 1, projects: [], queue: [add('C', '1'), idea('addIdea', { name: 'Boat' }, '2')] };
  assert.deepEqual(pendingOf(state, 'o/r').map((e) => e.id), ['1']);
  assert.deepEqual(pendingOf(state, 'o/r', ROADMAP_PATH).map((e) => e.id), ['1']);
  assert.deepEqual(pendingOf(state, 'o/r', 'IDEAS.md').map((e) => e.id), ['2']);
});

test('messageOf names the idea ops (SYNC-4)', () => {
  assert.equal(messageOf(idea('addIdea', { name: 'Boat' })), 'Add idea: Boat');
  assert.equal(messageOf(idea('renameIdea', { name: 'Car log', to: 'Mileage' })), 'Rename idea to Mileage: Car log');
  assert.equal(messageOf(idea('deleteIdea', { name: 'Car log' })), 'Delete idea: Car log');
  assert.equal(messageOf(idea('restoreIdea', { name: 'Car log', lines: '## Car log' })), 'Restore idea: Car log');
});

test('messageOf says idea entry for an item of IDEAS.md (SYNC-4)', () => {
  const ref = { path: 'Car log / Features', title: 'Fuel' };
  assert.equal(messageOf(idea('add', { path: ref.path, item: { title: 'Tyres', body: '' } })), 'Add idea entry: Tyres');
  assert.equal(messageOf(idea('edit', { ref, item: { title: 'Fuel2', body: '' } })), 'Edit idea entry: Fuel');
  assert.equal(messageOf(idea('move', { ref, to: 'Car log / Notes' })), 'Move idea entry to Car log / Notes: Fuel');
  assert.equal(messageOf(idea('delete', { ref })), 'Delete idea entry: Fuel');
});

test('a sent idea action that GitHub already has is done with no commit (SYNC-11)', async () => {
  const cases = [
    [idea('addIdea', { name: 'Car log' }, 'x'), IDEAS],
    [idea('renameIdea', { name: 'Old', to: 'Car log', base: '## Old' }, 'x'), IDEAS],
    [idea('deleteIdea', { name: 'Boat', base: '## Boat' }, 'x'), IDEAS],
    [idea('restoreIdea', { name: 'Car log', lines: '## Car log' }, 'x'), IDEAS],
  ];
  for (const [one, text] of cases) {
    const client = fakeClient(text);
    const result = await syncRepo({ client, repo: 'o/r', path: 'IDEAS.md', entries: [{ ...one, sent: true }] });
    assert.deepEqual(result.done, ['x'], one.op);
    assert.equal(client.remote.calls.filter(([kind]) => kind === 'put').length, 0, one.op);
  }
});

test('a sent renameIdea whose old name is still there is stale (SYNC-11)', async () => {
  const text = `${IDEAS}\n## Old\n`;
  const client = fakeClient(text);
  const result = await syncRepo({ client, repo: 'o/r', path: 'IDEAS.md', entries: [{ ...idea('renameIdea', { name: 'Old', to: 'Car log', base: '## Old' }, 'x'), sent: true }] });
  assert.deepEqual(result.stale, ['x']);
});

test('an add before a rename applies under the old name, then moves with the rename', () => {
  const added = idea('add', { path: 'Car log / Features', item: { title: 'Tyres', body: '' } }, '1');
  // The base is the idea as the screen shows it: with the waiting add on top (SYNC-2).
  const base = ideaText(viewOf(IDEAS, [added]).text, 'Car log');
  const { text, failed } = viewOf(IDEAS, [added, idea('renameIdea', { name: 'Car log', to: 'Mileage', base }, '2')]);
  assert.deepEqual(failed, []);
  assert.match(text, /## Mileage\n\n### Features\n\n- \*\*Fuel\.\*\*\n- \*\*Tyres\.\*\*/);
});

// A repository with no file at the path until a put creates it. A put with no sha on a file that
// exists is a conflict, as on GitHub (422).
const missingClient = ({ appears = null } = {}) => {
  const remote = { text: null, sha: null, puts: [] };
  return {
    remote,
    getFile: async () => {
      if (remote.text === null) throw new GitHubError('notFound', 404);
      return { text: remote.text, sha: remote.sha };
    },
    putFile: async (repo, path, { text, sha }) => {
      remote.puts.push({ text, sha });
      if (appears !== null && remote.text === null) {
        remote.text = appears;
        remote.sha = 'other';
      }
      if ((sha ?? null) !== remote.sha) throw new GitHubError('conflict', 422);
      remote.text = text;
      remote.sha = `s${remote.puts.length}`;
      return remote.sha;
    },
  };
};

test('syncRepo with create writes a missing file (SYNC-3)', async () => {
  const client = missingClient();
  const result = await syncRepo({ client, repo: 'o/r', path: 'IDEAS.md', create: true, entries: [idea('addIdea', { name: 'Car log' }, '1')] });
  assert.equal(result.error, null);
  assert.deepEqual(result.done, ['1']);
  assert.equal(client.remote.puts[0].sha, null);
  assert.equal(client.remote.text, '# Ideas\n\n## Car log\n\n### Features\n\n### Specs\n\n### Notes\n');
  assert.equal(result.file.text, client.remote.text);
});

test('syncRepo with create and no entries returns notFound', async () => {
  const result = await syncRepo({ client: missingClient(), repo: 'o/r', path: 'IDEAS.md', create: true, entries: [] });
  assert.deepEqual(result.error, { type: 'notFound' });
  assert.equal(result.file, null);
});

test('syncRepo without create keeps notFound for a missing file', async () => {
  const result = await syncRepo({ client: missingClient(), repo: 'o/r', path: 'IDEAS.md', entries: [idea('addIdea', { name: 'X' }, '1')] });
  assert.deepEqual(result.error, { type: 'notFound' });
  assert.deepEqual(result.done, []);
});

test('a create that meets a file made meanwhile retries on it (SYNC-5)', async () => {
  const client = missingClient({ appears: '# Ideas\n\n## Boat\n' });
  const result = await syncRepo({ client, repo: 'o/r', path: 'IDEAS.md', create: true, entries: [idea('addIdea', { name: 'Car log' }, '1')] });
  assert.equal(result.error, null);
  assert.deepEqual(result.done, ['1']);
  assert.match(client.remote.text, /## Boat\n\n## Car log\n/);
});
