import { cleanItem, outlineOf } from '#roadmap';
import { makeEntry, applyEntry, enqueue, discardEntry, pendingOf, roadmapView } from '#queue';
import { $, el, ui, state, cache, syncing, t, textOf, apply, render, showToast } from '#ui/context';
import { onItem } from '#ui/projects';
import { syncAll } from '#ui/sync';

const BRANCH = '└\u00a0';

const viewText = (repo) => roadmapView(cache[repo], pendingOf(state, repo));

const findItem = (sections, ref) => sections.find((section) => section.path === ref.path)?.items.find((one) => one.title === ref.title) ?? null;

// Checks each action against the roadmap on the screen, then queues the ones that change it and
// starts a sync (SYNC-1, SYNC-2). The entries, or null on an error.
const queueAll = (repo, actions, options = {}) => {
  let { text } = viewText(repo);
  const entries = [];
  for (const [op, args] of actions) {
    const entry = makeEntry(repo, op, args);
    const result = applyEntry(text ?? '', entry);
    if (result.error) {
      showToast(textOf(result.error));
      return null;
    }
    if (result.text === text) continue;
    text = result.text;
    entries.push(entry);
  }
  if (entries.length === 0) return [];
  apply({ state: entries.reduce((next, entry) => enqueue(next, entry).state, state) }, options);
  syncAll();
  return entries;
};

export const openItemSheet = (ref = null) => {
  const { sections } = viewText(ui.repo);
  const item = ref ? findItem(sections, ref) : null;
  if (ref && !item) return;
  ui.sheetOpen = true;
  ui.editing = ref;
  $('item-sheet-title').textContent = t(ref ? 'item.editTitle' : 'item.new');
  $('item-section').replaceChildren(
    el('option', { value: '', textContent: t('item.pickSection'), disabled: true, selected: !ref }),
    // A closed select shows the text of its option, so a nested H3 carries a branch mark, not an
    // indent: the mark still reads as a child there (UI-3).
    ...outlineOf(sections).map(({ path, title, depth }) =>
      el('option', { value: path, textContent: `${depth ? BRANCH : ''}${title}`, selected: path === ref?.path }),
    ),
  );
  $('item-title').value = item?.title ?? '';
  $('item-body').value = item?.body ?? '';
  $('item-delete').hidden = !ref;
  render();
  $('item-title').focus();
};

export const closeItemSheet = () => {
  ui.sheetOpen = false;
  ui.editing = null;
  render();
};

// An edit and a changed section are two actions, so two commits (UI-7).
const save = () => {
  const path = $('item-section').value;
  if (!path) {
    showToast(t('error.sectionMissing'));
    return;
  }
  const { item, error } = cleanItem({ title: $('item-title').value, body: $('item-body').value });
  if (error) {
    showToast(textOf(error));
    return;
  }
  const ref = ui.editing;
  // The item as the phone shows it: the sync refuses the edit if GitHub has another version (SYNC-6).
  const base = ref ? findItem(viewText(ui.repo).sections, ref) : null;
  const actions = ref
    ? [['edit', { ref, base, item }], ...(path === ref.path ? [] : [['move', { ref: { path: ref.path, title: item.title }, to: path }]])]
    : [['add', { path, item }]];
  if (queueAll(ui.repo, actions)) closeItemSheet();
};

// Undo takes the delete out of the queue while it waits; once it may have reached GitHub, it
// queues the item back instead (UI-4).
const undoDelete = (repo, id, ref, item) => {
  if (!syncing && state.queue.some((entry) => entry.id === id)) apply(discardEntry(state, id));
  else queueAll(repo, [['add', { path: ref.path, item }]]);
};

const remove = () => {
  const ref = ui.editing;
  const repo = ui.repo;
  const item = findItem(viewText(repo).sections, ref);
  const entries = queueAll(repo, [['delete', { ref, base: item }]]);
  if (!entries) return;
  closeItemSheet();
  const [entry] = entries;
  showToast(t('toast.itemDeleted'), { action: { label: t('toast.undo'), run: () => undoDelete(repo, entry.id, ref, item) } });
};

export const renderItemSheet = () => {
  $('item-sheet').hidden = !ui.sheetOpen;
};

export const bind = () => {
  onItem(openItemSheet);
  $('fab').addEventListener('click', () => openItemSheet());
  $('item-veil').addEventListener('click', closeItemSheet);
  $('item-delete').addEventListener('click', remove);
  $('item-form').addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });
};
