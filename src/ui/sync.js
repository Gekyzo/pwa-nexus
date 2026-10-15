import { createClient } from '#github';
import { syncRepo, settleQueue, pendingOf, stopsSync } from '#queue';
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
  ui.syncError = null;
  render();
  const client = createClient({ token, fetch: (...args) => fetch(...args) });
  try {
    for (const { repo } of state.projects) {
      const result = await syncRepo({ client, repo, entries: pendingOf(state, repo) });
      if (result.file) setCache(putEntry(cache, repo, { ...result.file, fetchedAt: Date.now() }));
      else if (result.error?.type === 'notFound') setCache(putEntry(cache, repo, { missing: true, fetchedAt: Date.now() }));
      commit(settleQueue(state, result));
      if (result.error && result.error.type !== 'notFound') ui.syncError = result.error.type;
      if (result.error && stopsSync(result.error.type)) break;
    }
  } finally {
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
};

export const bind = () => {
  $('sync').addEventListener('click', syncAll);
  window.addEventListener('online', syncAll);
  window.addEventListener('offline', render);
};
