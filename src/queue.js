import { addItem, editItem, moveItem, deleteItem, itemOf, sectionsOf } from '#roadmap';

// Every action is an entry of the queue first (SYNC-1). A sync turns each entry into one commit.
export const ROADMAP_PATH = 'ROADMAP.md';
export const OPS = ['add', 'edit', 'move', 'delete'];
const REPO = /^[\w.-]+\/[\w.-]+$/;
const STOPS = ['auth', 'rateLimit', 'network'];

export const makeEntry = (repo, op, args, { id = crypto.randomUUID(), now = Date.now() } = {}) => ({
  id,
  repo,
  op,
  args,
  createdAt: now,
});

const isObject = (value) => typeof value === 'object' && value !== null;
const isRef = (ref) => isObject(ref) && typeof ref.path === 'string' && typeof ref.title === 'string';
const isItem = (item) => isObject(item) && typeof item.title === 'string' && typeof item.body === 'string';
const isBase = (base) => base === undefined || isItem(base);

// The arguments of each action: a stored queue that a screen cannot read must not load (SYNC-1).
const ARGS = {
  add: ({ path, item }) => typeof path === 'string' && isItem(item),
  edit: ({ ref, item, base }) => isRef(ref) && isItem(item) && isBase(base),
  move: ({ ref, to }) => isRef(ref) && typeof to === 'string',
  delete: ({ ref, base }) => isRef(ref) && isBase(base),
};

export const isEntry = (value) =>
  typeof value === 'object' &&
  value !== null &&
  typeof value.id === 'string' &&
  value.id !== '' &&
  typeof value.repo === 'string' &&
  REPO.test(value.repo) &&
  OPS.includes(value.op) &&
  isObject(value.args) &&
  ARGS[value.op](value.args) &&
  typeof value.createdAt === 'number' &&
  (value.stale === undefined || typeof value.stale === 'boolean') &&
  (value.sent === undefined || typeof value.sent === 'boolean');

// An edit or a delete carries the item as the phone saw it: if GitHub has another version, the
// action would overwrite text written elsewhere, so it fails and goes stale (SYNC-6).
const changed = (md, { ref, base }) => {
  if (!base) return false;
  const now = itemOf(md, ref);
  return now !== null && (now.title !== base.title || now.body !== base.body);
};

const run = (md, op, args) => {
  if ((op === 'edit' || op === 'delete') && changed(md, args)) return { text: md, error: { key: 'error.itemChanged' } };
  if (op === 'add') return addItem(md, args.path, args.item);
  if (op === 'edit') return editItem(md, args.ref, args.item);
  if (op === 'move') return moveItem(md, args.ref, args.to);
  if (op === 'delete') return deleteItem(md, args.ref);
  return { text: md, error: { key: 'error.unknownAction' } };
};

export const applyEntry = (md, { op, args }) => {
  try {
    return run(md, op, args);
  } catch {
    return { text: md, error: { key: 'error.unknownAction' } };
  }
};

export const messageOf = ({ op, args }) => {
  if (op === 'add') return `Add roadmap item: ${args.item.title}`;
  if (op === 'edit') return `Edit roadmap item: ${args.ref.title}`;
  if (op === 'move') return `Move roadmap item to ${args.to}: ${args.ref.title}`;
  return `Delete roadmap item: ${args.ref.title}`;
};

// The commit of an action: its subject tagged `[pwa-nexus]`, and a `Via:` trailer with the
// version of the app, when it is known (SYNC-4).
export const commitMessageOf = (entry, version = null) =>
  `${messageOf(entry)} [pwa-nexus]\n\nVia: ${version ? `pwa-nexus ${version}` : 'pwa-nexus'}`;

export const enqueue = (state, entry) => ({ state: { ...state, queue: [...state.queue, entry] } });

export const discardEntry = (state, id) => ({ state: { ...state, queue: state.queue.filter((entry) => entry.id !== id) } });

// The inverse of a discard: the entry goes back at `index` of the queue as it is now, so what a
// sync settled meanwhile stays settled (UI-10).
export const restoreEntry = (state, entry, index, committed = []) => {
  if (committed.includes(entry.id) || state.queue.some((one) => one.id === entry.id)) return { state };
  const queue = [...state.queue];
  queue.splice(Math.min(index, queue.length), 0, entry);
  return { state: { ...state, queue } };
};

// What Undo of a delete does (UI-4). A delete that surely was not sent leaves the queue. One that
// may have reached GitHub, on its way or sent with no answer, leaves the queue too, and the item
// is queued back as an `add` marked `sent`: the sync then adds it, or finds it there (SYNC-11).
export const undoDeleteOf = (state, { id }, { maybeSent }) => {
  const queued = state.queue.find((entry) => entry.id === id);
  if (!queued) return { discard: false, readd: true };
  const sure = !maybeSent && !queued.sent;
  return { discard: true, readd: !sure };
};

// A doc to go back to, without the entries that GitHub has now (UI-10).
export const withoutEntries = (state, ids) => ({ ...state, queue: state.queue.filter((entry) => !ids.includes(entry.id)) });

export const pendingOf = (state, repo) => state.queue.filter((entry) => entry.repo === repo);

// `sent` holds the entries whose commit got no answer: GitHub may have them (SYNC-11).
export const settleQueue = (state, { done, stale, sent = [] }) => ({
  ...state,
  queue: state.queue
    .filter((entry) => !done.includes(entry.id))
    .map((entry) => (stale.includes(entry.id) ? { ...entry, stale: true } : entry))
    .map((entry) => (sent.includes(entry.id) ? { ...entry, sent: true } : entry)),
});

const sameItem = (found, item) => found !== null && found.title === item.title && found.body === item.body;

// True when `md` already shows the result of the action: a commit whose answer was lost (SYNC-11).
const isApplied = (md, { op, args }) => {
  if (op === 'add') return sameItem(itemOf(md, { path: args.path, title: args.item.title }), args.item);
  if (op === 'edit') {
    const renamed = args.item.title !== args.ref.title;
    return sameItem(itemOf(md, { path: args.ref.path, title: args.item.title }), args.item) && (!renamed || itemOf(md, args.ref) === null);
  }
  if (op === 'move') return itemOf(md, { path: args.to, title: args.ref.title }) !== null && itemOf(md, args.ref) === null;
  // A delete is done only when nothing on GitHub still has the title or the body of the item:
  // a rename or a move made elsewhere keeps it stale (SYNC-6).
  if (itemOf(md, args.ref) !== null) return false;
  if (!args.base) return true;
  const { title, body } = args.base;
  return !sectionsOf(md).some((section) => section.items.some((one) => one.title === title || (body && one.body === body)));
};

// The text that the screen shows: the cached text with the waiting entries on top (SYNC-2).
export const viewOf = (text, entries) =>
  entries.reduce(
    (view, entry) => {
      if (entry.stale) return view;
      const result = applyEntry(view.text, entry);
      // A sent action that the text has already is applied (SYNC-11).
      if (result.error && entry.sent && isApplied(view.text, entry)) return view;
      return result.error ? { ...view, failed: [...view.failed, entry.id] } : { ...view, text: result.text };
    },
    { text, failed: [] },
  );

export const roadmapView = (cached, entries) => {
  if (!cached || cached.missing) return { text: null, sections: [], failed: [] };
  const { text, failed } = viewOf(cached.text, entries);
  return { text, sections: sectionsOf(text), failed };
};

export const hasSection = (sections, path) => sections.some((section) => section.path === path);

// Checks the entries of each repository against its text, in order. Either every entry that
// changes a text, or the first repository whose entry fails: one item added to several
// repositories is queued in all of them or in none (UI-3).
export const checkEach = (plans) => {
  const entries = [];
  for (const { repo, text: start, entries: planned } of plans) {
    let text = start ?? '';
    for (const entry of planned) {
      const result = applyEntry(text, entry);
      if (result.error) return { repo, error: result.error };
      if (result.text === text) continue;
      text = result.text;
      entries.push(entry);
    }
  }
  return { entries };
};

// An error of one repository that stops the sync of all of them (SYNC-7).
export const stopsSync = (type) => STOPS.includes(type);

// The part of the repositories that a sync has done, from 0 to 1 (SYNC-9).
export const syncShare = (done, total) => (total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0);

const failure = (error) => ({ type: error?.type ?? 'network' });



// Gets the file, then commits each waiting entry in order (SYNC-3 … SYNC-6). `keep` says, just
// before each commit, whether the entry is still in the queue: one that the user discarded or
// undid, or whose project was removed, during the sync is skipped (SYNC-10). `onSend` names the
// entry whose commit is on its way, then null.
export const syncRepo = async ({ client, repo, entries, path = ROADMAP_PATH, version = null, keep = () => true, onSend = () => {} }) => {
  const done = [];
  const stale = [];
  const sent = [];
  const result = (file, error = null) => ({ file, done, stale, sent, error });
  let file;
  try {
    file = await client.getFile(repo, path);
  } catch (error) {
    return result(null, failure(error));
  }
  for (const entry of entries.filter((one) => !one.stale)) {
    for (let attempt = 0; ; attempt += 1) {
      if (!keep(entry)) break;
      const applied = applyEntry(file.text, entry);
      if (applied.error) {
        // A commit sent before whose answer was lost: GitHub has it, so it is done (SYNC-11).
        if (entry.sent && isApplied(file.text, entry)) done.push(entry.id);
        else stale.push(entry.id);
        break;
      }
      if (applied.text === file.text) {
        done.push(entry.id);
        break;
      }
      onSend(entry.id);
      let sha = null;
      let sendError = null;
      try {
        sha = await client.putFile(repo, path, { text: applied.text, sha: file.sha, message: commitMessageOf(entry, version) });
      } catch (error) {
        sendError = error;
      } finally {
        onSend(null);
      }
      if (!sendError) {
        file = { text: applied.text, sha };
        done.push(entry.id);
        break;
      }
      if (sendError?.type !== 'conflict' || attempt > 0) {
        // No answer: the commit may have reached GitHub.
        if (failure(sendError).type === 'network') sent.push(entry.id);
        return result(file, failure(sendError));
      }
      try {
        file = await client.getFile(repo, path);
      } catch (again) {
        return result(file, failure(again));
      }
    }
  }
  return result(file);
};
