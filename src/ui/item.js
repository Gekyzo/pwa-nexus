import { bindSheetDrag } from '#ds/sheet';
import { cleanItem, outlineOf, sectionsOf } from '#roadmap';
import { ROADMAP_PATH, makeEntry, enqueue, discardEntry, pendingOf, roadmapView, hasSection, checkEach, undoDeleteOf } from '#queue';
import { $, el, ui, state, cache, t, textOf, apply, render, showToast } from '#ui/context';
import { onItem } from '#ui/projects';
import { ideasView, onEntry } from '#ui/ideas';
import { syncAll, isMaybeSent } from '#ui/sync';

const BRANCH = '└\u00a0';

// The file that the sheet changes: a roadmap of a project, or IDEAS.md with the parts of one idea
// in `paths` (IDEA-12).
const roadmapOf = (repo) => ({ repo, file: ROADMAP_PATH, paths: null, label: null });

// The text and the sections of a file as the screen shows them (SYNC-2).
const viewOf = ({ repo, file }) => {
  if (file === ROADMAP_PATH) return roadmapView(cache[repo], pendingOf(state, repo));
  const { text } = ideasView();
  return { text, sections: sectionsOf(text) };
};

const viewText = (repo) => viewOf(roadmapOf(repo));

const findItem = (sections, ref) => sections.find((section) => section.path === ref.path)?.items.find((one) => one.title === ref.title) ?? null;

const labelOf = (repo) => state.projects.find((project) => project.repo === repo)?.label ?? repo;

// Checks the actions of each repository against its roadmap on the screen, then queues the ones
// that change it and starts a sync (SYNC-1, SYNC-2). An error in one queues nothing in any (UI-3).
// The entries, or null on an error.
const queueEach = (plans, options = {}) => {
  const checked = checkEach(
    plans.map(({ repo, file = ROADMAP_PATH, actions }) => ({
      repo,
      text: viewOf({ repo, file }).text,
      entries: actions.map(([op, args]) => makeEntry(repo, op, args, { file })),
    })),
  );
  if (checked.error) {
    const message = textOf(checked.error);
    showToast(plans.length > 1 ? t('item.failedIn', { project: labelOf(checked.repo), message }) : message);
    return null;
  }
  const { entries } = checked;
  if (entries.length === 0) return [];
  apply({ state: entries.reduce((next, entry) => enqueue(next, entry).state, state) }, options);
  syncAll();
  return entries;
};

const queueAll = ({ repo, file }, actions, options) => queueEach([{ repo, file, actions }], options);

// The other projects that a new item can go to as well: only those whose roadmap on the screen has
// the picked section, by its exact path (UI-3). A pressed chip stays pressed while it still fits.
const renderAlso = () => {
  const { repo, file } = ui.sheetTarget;
  const others = state.projects.filter((project) => project.repo !== repo);
  $('item-also').hidden = ui.editing !== null || others.length === 0 || file !== ROADMAP_PATH;
  const path = $('item-section').value;
  const pressed = pickedRepos();
  $('item-also-list').replaceChildren(
    ...others.map(({ repo, label }) => {
      const fits = path !== '' && hasSection(viewText(repo).sections, path);
      return el('button', {
        type: 'button',
        className: 'chip',
        value: repo,
        textContent: label,
        disabled: !fits,
        title: fits ? '' : t('item.noSection'),
        ariaPressed: String(fits && pressed.includes(repo)),
      });
    }),
  );
};

const pickedRepos = () => [...$('item-also-list').querySelectorAll('[aria-pressed="true"]')].map((chip) => chip.value);

export const openItemSheet = (ref = null, target = roadmapOf(ui.repo)) => {
  const { sections } = viewOf(target);
  const item = ref ? findItem(sections, ref) : null;
  if (ref && !item) return;
  ui.sheetTarget = target;
  ui.sheetOpen = true;
  ui.editing = ref;
  $('item-sheet-title').textContent = t(ref ? 'item.editTitle' : 'item.new');
  $('item-section').replaceChildren(
    el('option', { value: '', textContent: t('item.pickSection'), disabled: true, selected: !ref }),
    // A closed select shows the text of its option, so a nested H3 carries a branch mark, not an
    // indent: the mark still reads as a child there (UI-3).
    ...outlineOf(sections)
      .filter(({ path }) => target.paths === null || target.paths.includes(path))
      // The parts of an idea go by their label, with no branch mark: they are all of one idea.
      .map(({ path, title, depth }) =>
        el('option', { value: path, textContent: target.label ? target.label(title) : `${depth ? BRANCH : ''}${title}`, selected: path === ref?.path }),
      ),
  );
  $('item-title').value = item?.title ?? '';
  $('item-body').value = item?.body ?? '';
  $('item-delete').hidden = !ref;
  $('item-also-list').replaceChildren();
  renderAlso();
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
  const target = ui.sheetTarget;
  // The item as the phone shows it: the sync refuses the edit if GitHub has another version (SYNC-6).
  const base = ref ? findItem(viewOf(target).sections, ref) : null;
  const actions = ref
    ? [['edit', { ref, base, item }], ...(path === ref.path ? [] : [['move', { ref: { path: ref.path, title: item.title }, to: path }]])]
    : [['add', { path, item }]];
  const others = ref || target.file !== ROADMAP_PATH ? [] : pickedRepos().map((repo) => ({ repo, actions }));
  if (queueEach([{ repo: target.repo, file: target.file, actions }, ...others])) closeItemSheet();
};

// Undo takes a delete that surely was not sent out of the queue. One that may have reached GitHub
// leaves the queue too, and the item is queued back as an `add` marked `sent`, which the sync adds
// or finds there (UI-4, SYNC-11).
const undoDelete = ({ repo, file }, entry, item) => {
  const { discard, readd } = undoDeleteOf(state, entry, { maybeSent: isMaybeSent(entry.id) });
  let next = discard ? discardEntry(state, entry.id).state : state;
  if (readd) next = enqueue(next, { ...makeEntry(repo, 'add', { path: entry.args.ref.path, item }, { file }), sent: true }).state;
  apply({ state: next });
  if (readd) syncAll();
};

const remove = () => {
  const ref = ui.editing;
  const target = ui.sheetTarget;
  const item = findItem(viewOf(target).sections, ref);
  const entries = queueAll(target, [['delete', { ref, base: item }]]);
  if (!entries) return;
  closeItemSheet();
  const [entry] = entries;
  showToast(t('toast.itemDeleted'), { action: { label: t('toast.undo'), run: () => undoDelete(target, entry, item) } });
};

export const renderItemSheet = () => {
  $('item-sheet').hidden = !ui.sheetOpen;
};

export const bind = () => {
  onItem(openItemSheet);
  onEntry(openItemSheet);
  $('fab').addEventListener('click', () => {
    if (ui.view === 'projects') openItemSheet();
  });
  $('item-veil').addEventListener('click', closeItemSheet);
  $('item-close').addEventListener('click', closeItemSheet);
  bindSheetDrag($('item-sheet'), { close: closeItemSheet });
  $('item-delete').addEventListener('click', remove);
  $('item-section').addEventListener('change', renderAlso);
  $('item-also-list').addEventListener('click', ({ target }) => {
    const chip = target.closest('.chip');
    if (chip && !chip.disabled) chip.ariaPressed = String(chip.ariaPressed !== 'true');
  });
  $('item-form').addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });
};
