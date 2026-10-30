import { bindSheetDrag } from '#ds/sheet';
import { IDEAS_REPO, IDEAS_PATH, cleanName, ideasOf, ideaText } from '#ideas';
import { filterTree } from '#roadmap';
import { makeEntry, enqueue, discardEntry, pendingOf, viewOf, applyEntry, undoDeleteOf } from '#queue';
import { cacheKeyOf } from '#cache';
import { $, el, ui, state, cache, token, t, textOf, apply, render, showToast } from '#ui/context';
import { staleBanner, sectionNodes } from '#ui/projects';
import { syncAll, isMaybeSent } from '#ui/sync';

export const IDEAS_KEY = cacheKeyOf(IDEAS_REPO, IDEAS_PATH);

// The ideas as the screen shows them: the cached IDEAS.md with the waiting actions on top. With no
// IDEAS.md yet, or none read on this device, the text starts empty, so an idea is caught offline
// before the first sync (IDEA-9).
export const ideasView = () => {
  const cached = cache[IDEAS_KEY];
  const { text, failed } = viewOf(cached && !cached.missing ? cached.text : '', pendingOf(state, IDEAS_REPO, IDEAS_PATH));
  return { text, ideas: ideasOf(text), failed, loaded: Boolean(cached) };
};

export const ideaEntry = (op, args) => makeEntry(IDEAS_REPO, op, args, { file: IDEAS_PATH });

// Checks the action against the ideas on the screen, then queues it and starts a sync. False on
// an error, which the toast shows, and nothing is queued.
export const queueIdea = (op, args, options = {}) => {
  const entry = ideaEntry(op, args);
  const { error } = applyEntry(ideasView().text, entry);
  if (error) {
    showToast(textOf(error));
    return null;
  }
  apply({ state: enqueue(state, entry).state }, options);
  syncAll();
  return entry;
};

// The parts of the count line, the three fixed parts that have entries (IDEA-8).
const countLine = ({ counts }) => {
  const parts = ['features', 'specs', 'notes'].filter((key) => counts[key] > 0).map((key) => t(`ideas.${key}`, { count: counts[key] }));
  return parts.length ? parts.join(' · ') : t('ideas.nameOnly');
};

// The handler of a tap on an entry, or of + in an idea: the item sheet sets it (IDEA-12).
let entryHandler = () => {};
export const onEntry = (fn) => {
  entryHandler = fn;
};

export const openIdea = (name) => {
  ui.idea = name;
  ui.query = '';
  render();
};

const ideaRow = (idea) => {
  const onclick = idea.duplicate ? null : () => openIdea(idea.name);
  const meta = idea.duplicate ? t('ideas.duplicate') : countLine(idea);
  const name = el('button', { className: 'item-row-name', type: 'button', disabled: Boolean(idea.duplicate), onclick }, [
    el('span', { textContent: idea.name }),
    el('small', { className: 'item-row-meta', textContent: meta }),
  ]);
  if (ui.idea === idea.name) name.setAttribute('aria-current', 'true');
  return el('li', { className: 'item-row' }, [el('div', { className: 'item-row-body' }, [name])]);
};

const isIdeaEntry = (entry) => entry.repo === IDEAS_REPO && entry.file === IDEAS_PATH;

// True for an action on the idea `name` or on one of its entries.
const ofIdea = ({ op, args }, name) => {
  const inside = (path) => typeof path === 'string' && path.startsWith(`${name} / `);
  if (op === 'renameIdea') return args.name === name || args.to === name;
  if (op === 'add') return inside(args.path);
  if (args.ref) return inside(args.ref.path) || inside(args.to);
  return args.name === name;
};

// The actions of IDEAS.md that a sync marked stale or that no longer apply, above the list (UI-5).
const staleOf = (failed) => state.queue.filter((entry) => isIdeaEntry(entry) && (entry.stale || failed.includes(entry.id)));

// The sheet of a name: a new idea, or the new name of the idea in `ui.naming` (IDEA-9).
export const openNameSheet = (name = null) => {
  ui.nameOpen = true;
  ui.naming = name;
  $('name-sheet-title').textContent = t(name === null ? 'ideas.new' : 'ideas.renameTitle');
  $('name-input').value = name ?? '';
  render();
  $('name-input').focus();
};

export const closeNameSheet = () => {
  ui.nameOpen = false;
  ui.naming = null;
  render();
};

export const isNameOpen = () => ui.nameOpen;

// A rename carries the idea as the screen shows it: the sync refuses it if GitHub has another
// version (IDEA-7, IDEA-13). The open idea follows its new name.
const rename = (from, to) => {
  if (to === from) return true;
  // The render of the queued rename no longer finds the old name and closes the idea: ask first.
  const reopen = ui.idea === from;
  const entry = queueIdea('renameIdea', { name: from, to, base: ideaText(ideasView().text, from) });
  if (entry && reopen) openIdea(to);
  return Boolean(entry);
};

const saveName = () => {
  const { name, error } = cleanName($('name-input').value);
  if (error) {
    showToast(textOf(error));
    return;
  }
  const done = ui.naming === null ? queueIdea('addIdea', { name }) : rename(ui.naming, name);
  if (done) closeNameSheet();
};

// Undo of a delete, as UI-4 for an item: one that surely was not sent leaves the queue; one that
// may have reached GitHub leaves it too, and the idea is queued back as a `restoreIdea` marked
// `sent`, which the sync puts back or finds there (SYNC-11, IDEA-14).
const undoRemove = (entry, name, lines) => {
  const { discard, readd } = undoDeleteOf(state, entry, { maybeSent: isMaybeSent(entry.id) });
  let next = discard ? discardEntry(state, entry.id).state : state;
  if (readd) next = enqueue(next, { ...ideaEntry('restoreIdea', { name, lines }), sent: true }).state;
  apply({ state: next });
  if (readd) syncAll();
};

const removeIdea = () => {
  const name = ui.idea;
  const lines = ideaText(ideasView().text, name);
  const entry = queueIdea('deleteIdea', { name, base: lines });
  if (!entry) return;
  Object.assign(ui, { idea: null, query: '' });
  render();
  showToast(t('toast.ideaDeleted'), { action: { label: t('toast.undo'), run: () => undoRemove(entry, name, lines) } });
};

const PART_KEYS = { Features: 'ideas.part.features', Specs: 'ideas.part.specs', Notes: 'ideas.part.notes' };
const partLabel = (title) => (PART_KEYS[title] ? t(PART_KEYS[title]) : title);

// The file that the item sheet changes for an idea: IDEAS.md, with the parts of that idea only.
const targetOf = (idea) => ({ repo: IDEAS_REPO, file: IDEAS_PATH, paths: idea.parts.map((part) => part.path), label: partLabel });

const openIdeaOf = (view) => view.ideas.find((idea) => idea.name === ui.idea && !idea.duplicate) ?? null;

// The detail of the open idea: its head, its parts as the sections of UI-2 and the search of UI-8
// (IDEA-11).
const renderDetail = (view, idea) => {
  if (idea) $('ideas').dataset.detail = '';
  else delete $('ideas').dataset.detail;
  $('idea-head').hidden = !idea;
  const tree = idea ? filterTree(idea.parts, ui.query) : [];
  const search = $('idea-search');
  search.hidden = !idea || idea.parts.length === 0;
  if (search.value !== ui.query) search.value = ui.query;
  let empty = '';
  if (!idea) empty = t('ideas.pick');
  else if (idea.parts.length === 0) empty = t('ideas.noParts');
  else if (tree.length === 0) empty = t('roadmap.noMatch');
  $('idea-empty').textContent = empty;
  $('idea-empty').hidden = !empty;
  const stale = idea ? staleOf(view.failed).filter((entry) => ofIdea(entry, idea.name)) : [];
  $('idea-stale').replaceChildren(...stale.map(staleBanner));
  const onItem = (ref) => entryHandler(ref, targetOf(idea));
  $('idea-parts').replaceChildren(...tree.flatMap((part) => sectionNodes(IDEAS_KEY, part, { onItem, label: partLabel(part.title) })));
};

export const renderIdeas = () => {
  const visible = ui.view === 'ideas';
  $('ideas').hidden = !visible;
  $('name-sheet').hidden = !ui.nameOpen;
  if (!visible) return;
  const view = ideasView();
  // An idea that left the file, by a sync or a discard, closes.
  const idea = openIdeaOf(view);
  if (!idea) ui.idea = null;
  $('idea-list').replaceChildren(...view.ideas.map(ideaRow));
  $('ideas-note').textContent = t('ideas.notLoaded');
  $('ideas-note').hidden = view.loaded;
  $('ideas-empty').hidden = !view.loaded || view.ideas.length > 0;
  $('ideas-add').disabled = !token;
  // The banners of the open idea show in its detail.
  $('ideas-stale').replaceChildren(...staleOf(view.failed).filter((entry) => !idea || !ofIdea(entry, idea.name)).map(staleBanner));
  renderDetail(view, idea);
  // With no token the ideas are read-only (TOK-3). In an idea, + adds an entry to one of its parts.
  $('fab').hidden = !token || ui.sheetOpen || ui.nameOpen || (idea !== null && idea.parts.length === 0);
  $('fab').setAttribute('aria-label', t(idea ? 'item.add' : 'ideas.new'));
};

export const bind = () => {
  $('fab').addEventListener('click', () => {
    if (ui.view !== 'ideas') return;
    const idea = openIdeaOf(ideasView());
    if (idea) entryHandler(null, targetOf(idea));
    else openNameSheet();
  });
  $('idea-back').addEventListener('click', () => openIdea(null));
  $('idea-rename').addEventListener('click', () => openNameSheet(ui.idea));
  $('idea-delete').addEventListener('click', removeIdea);
  $('idea-search').addEventListener('input', (event) => {
    ui.query = event.target.value;
    render();
  });
  $('ideas-add').addEventListener('click', () => openNameSheet());
  $('name-veil').addEventListener('click', closeNameSheet);
  $('name-close').addEventListener('click', closeNameSheet);
  bindSheetDrag($('name-sheet'), { close: closeNameSheet });
  $('name-form').addEventListener('submit', (event) => {
    event.preventDefault();
    saveName();
  });
};
