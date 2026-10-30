import { bindSheetDrag } from '#ds/sheet';
import { IDEAS_REPO, IDEAS_PATH, cleanName, ideasOf } from '#ideas';
import { makeEntry, enqueue, pendingOf, viewOf, applyEntry } from '#queue';
import { cacheKeyOf } from '#cache';
import { $, el, ui, state, cache, token, t, textOf, apply, render, showToast } from '#ui/context';
import { staleBanner } from '#ui/projects';
import { syncAll } from '#ui/sync';

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

// The handler of a tap on an idea row: the detail sets it.
let ideaHandler = () => {};
export const onIdea = (fn) => {
  ideaHandler = fn;
};

const ideaRow = (idea) => {
  const onclick = idea.duplicate ? null : () => ideaHandler(idea.name);
  const meta = idea.duplicate ? t('ideas.duplicate') : countLine(idea);
  const name = el('button', { className: 'item-row-name', type: 'button', disabled: Boolean(idea.duplicate), onclick }, [
    el('span', { textContent: idea.name }),
    el('small', { className: 'item-row-meta', textContent: meta }),
  ]);
  if (ui.idea === idea.name) name.setAttribute('aria-current', 'true');
  return el('li', { className: 'item-row' }, [el('div', { className: 'item-row-body' }, [name])]);
};

const isIdeaEntry = (entry) => entry.repo === IDEAS_REPO && entry.file === IDEAS_PATH;

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

// The rename of an idea; the detail sets it.
let renameHandler = () => false;
export const onRename = (fn) => {
  renameHandler = fn;
};

const saveName = () => {
  const { name, error } = cleanName($('name-input').value);
  if (error) {
    showToast(textOf(error));
    return;
  }
  if (ui.naming !== null) {
    if (renameHandler(ui.naming, name)) closeNameSheet();
    return;
  }
  if (queueIdea('addIdea', { name })) closeNameSheet();
};

// The single + of the app opens the sheet of the section in view.
let fabHandler = () => openNameSheet();
export const onFab = (fn) => {
  fabHandler = fn;
};

export const renderIdeas = () => {
  const visible = ui.view === 'ideas';
  $('ideas').hidden = !visible;
  $('name-sheet').hidden = !ui.nameOpen;
  if (!visible) return;
  const view = ideasView();
  $('idea-list').replaceChildren(...view.ideas.map(ideaRow));
  $('ideas-note').textContent = t('ideas.notLoaded');
  $('ideas-note').hidden = view.loaded;
  $('ideas-empty').hidden = !view.loaded || view.ideas.length > 0;
  $('ideas-add').disabled = !token;
  $('ideas-stale').replaceChildren(...staleOf(view.failed).map(staleBanner));
  // With no token the ideas are read-only (TOK-3).
  $('fab').hidden = !token || ui.sheetOpen || ui.nameOpen;
  $('fab').setAttribute('aria-label', t('ideas.new'));
};

export const bind = () => {
  $('fab').addEventListener('click', () => {
    if (ui.view === 'ideas') fabHandler();
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
