import { createClient } from '#github';
import { syncRepo, settleQueue, pendingOf, stopsSync, syncShare } from '#queue';
import { putEntry } from '#cache';
import { $, ui, state, cache, token, syncing, t, render, commit, setCache, setSyncing, showToast } from '#ui/context';

const ERROR_KEYS = {
  auth: 'error.githubAuth',
  rateLimit: 'error.githubRateLimit',
  conflict: 'error.githubConflict',
  notFound: 'error.githubNotFound',
  forbidden: 'error.githubForbidden',
  network: 'error.offline',
};
export const errorKey = (type) => ERROR_KEYS[type] ?? 'error.offline';

// A sync asked for while one runs runs once more at its end, with the actions queued meanwhile.
let again = false;
// The entries whose commit went out in the sync of the repository that runs now, until the
// queue is settled: GitHub may have them (UI-4).
const maybeSent = new Set();

export const isMaybeSent = (id) => maybeSent.has(id);

// The entries that GitHub has, from the syncs of this start: an undo leaves them out (UI-10).
export const committed = new Set();

const inQueue = ({ id }) => state.queue.some((entry) => entry.id === id);
const listed = (repo) => state.projects.some((project) => project.repo === repo);

// One repository after the other, never two at a time (SYNC-8).
export const syncAll = async () => {
  if (syncing) {
    again = true;
    return;
  }
  if (!token || !navigator.onLine) {
    render();
    return;
  }
  setSyncing(true);
  const { projects } = state;
  Object.assign(ui, { syncError: null, syncProgress: { done: 0, total: projects.length } });
  render();
  const client = createClient({ token, fetch: (...args) => fetch(...args) });
  try {
    for (const { repo } of projects) {
      // A project removed during the sync is not synced, and its cache entry is not written back (SYNC-10).
      if (!listed(repo)) {
        ui.syncProgress = { ...ui.syncProgress, done: ui.syncProgress.done + 1 };
        continue;
      }
      const result = await syncRepo({
        client,
        repo,
        entries: pendingOf(state, repo),
        version: ui.version.running?.version,
        keep: inQueue,
        onSend: (id) => {
          if (id) maybeSent.add(id);
        },
      });
      // A project removed while its sync ran keeps no cache entry.
      if (listed(repo) && result.file) setCache(putEntry(cache, repo, { ...result.file, fetchedAt: Date.now() }));
      else if (listed(repo) && result.error?.type === 'notFound') setCache(putEntry(cache, repo, { missing: true, fetchedAt: Date.now() }));
      ui.syncProgress = { ...ui.syncProgress, done: ui.syncProgress.done + 1 };
      result.done.forEach((id) => committed.add(id));
      commit(settleQueue(state, result));
      // Settled: a done entry left the queue, one with no answer is marked `sent`.
      maybeSent.clear();
      if (result.error && result.error.type !== 'notFound') ui.syncError = result.error.type;
      if (result.error && stopsSync(result.error.type)) break;
    }
  } finally {
    maybeSent.clear();
    setSyncing(false);
    render();
  }
  if (ui.syncError && ui.syncError !== 'network') showToast(t(errorKey(ui.syncError)));
  if (again) {
    again = false;
    syncAll();
  }
};

// The state of the sync in the subtitle of the header (SYNC-7).
export const renderSync = () => {
  const waiting = state.queue.filter((entry) => !entry.stale).length;
  let text = '';
  if (syncing) text = t('sync.running');
  else if (!token) text = t('sync.noToken');
  else if (!navigator.onLine || ui.syncError === 'network') text = waiting ? t('sync.offlinePending', { count: waiting }) : t('sync.offline');
  else if (waiting) text = t('sync.pending', { count: waiting });
  $('subtitle').textContent = text;
  $('sync').disabled = syncing || !token;
  // The bar of the sync fills one step for each repository (SYNC-9).
  const share = syncShare(ui.syncProgress.done, ui.syncProgress.total);
  const bar = $('sync-progress');
  bar.hidden = !syncing;
  bar.style.setProperty('--share', share);
  bar.setAttribute('aria-valuenow', Math.round(share * 100));
};

export const bind = () => {
  $('sync').addEventListener('click', syncAll);
  window.addEventListener('online', syncAll);
  window.addEventListener('offline', render);
};
