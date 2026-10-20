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
  (value.stale === undefined || typeof value.stale === 'boolean');

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

export const pendingOf = (state, repo) => state.queue.filter((entry) => entry.repo === repo);

export const settleQueue = (state, { done, stale }) => ({
  ...state,
  queue: state.queue
    .filter((entry) => !done.includes(entry.id))
    .map((entry) => (stale.includes(entry.id) ? { ...entry, stale: true } : entry)),
});

// The text that the screen shows: the cached text with the waiting entries on top (SYNC-2).
export const viewOf = (text, entries) =>
  entries.reduce(
    (view, entry) => {
      if (entry.stale) return view;
      const result = applyEntry(view.text, entry);
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

// Gets the file, then commits each waiting entry in order (SYNC-3 … SYNC-6).
export const syncRepo = async ({ client, repo, entries, path = ROADMAP_PATH, version = null }) => {
  const done = [];
  const stale = [];
  const result = (file, error = null) => ({ file, done, stale, error });
  let file;
  try {
    file = await client.getFile(repo, path);
  } catch (error) {
    return result(null, failure(error));
  }
  for (const entry of entries.filter((one) => !one.stale)) {
    for (let attempt = 0; ; attempt += 1) {
      const applied = applyEntry(file.text, entry);
      if (applied.error) {
        stale.push(entry.id);
        break;
      }
      if (applied.text === file.text) {
        done.push(entry.id);
        break;
      }
      try {
        const sha = await client.putFile(repo, path, { text: applied.text, sha: file.sha, message: commitMessageOf(entry, version) });
        file = { text: applied.text, sha };
        done.push(entry.id);
        break;
      } catch (error) {
        if (error?.type !== 'conflict' || attempt > 0) return result(file, failure(error));
        try {
          file = await client.getFile(repo, path);
        } catch (again) {
          return result(file, failure(again));
        }
      }
    }
  }
  return result(file);
};
