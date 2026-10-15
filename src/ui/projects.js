import { findProject } from '#projects';
import { treeOf } from '#roadmap';
import { roadmapView, pendingOf, discardEntry, messageOf } from '#queue';
import { intlTag } from '#i18n';
import { $, el, ui, state, cache, t, lang, render, apply } from '#ui/context';

// The handler of a tap on an item row: the item sheet sets it (UI-2).
let itemHandler = () => {};
export const onItem = (fn) => {
  itemHandler = fn;
};

export const openProject = (repo) => {
  ui.repo = repo;
  render();
};

const roadmapOf = (repo) => roadmapView(cache[repo], pendingOf(state, repo));

const timeOf = (ms) => new Intl.DateTimeFormat(intlTag(lang), { dateStyle: 'short', timeStyle: 'short' }).format(ms);

// Items, waiting actions and the last sync, on one line (UI-1).
const metaOf = (project) => {
  const entry = cache[project.repo];
  const { sections } = roadmapOf(project.repo);
  const count = sections.reduce((sum, section) => sum + section.items.length, 0);
  const waiting = pendingOf(state, project.repo).length;
  const status = !entry ? t('projects.notLoaded') : entry.missing ? t('projects.noRoadmap') : t('projects.synced', { time: timeOf(entry.fetchedAt) });
  return [entry && !entry.missing ? t('projects.items', { count }) : null, waiting ? t('projects.pending', { count: waiting }) : null, status]
    .filter(Boolean)
    .join(' · ');
};

const projectRow = (project) => {
  const name = el('button', { className: 'item-row-name', type: 'button', onclick: () => openProject(project.repo) }, [
    el('span', { textContent: project.label }),
    el('small', { className: 'item-row-meta', textContent: metaOf(project) }),
  ]);
  const node = el('li', { className: 'item-row' }, [el('div', { className: 'item-row-body' }, [name])]);
  if (ui.repo === project.repo) node.setAttribute('aria-current', 'true');
  return node;
};

const keyOf = (repo, path) => `${repo}\n${path}`;

const fold = (key) => {
  ui.folded = ui.folded.includes(key) ? ui.folded.filter((other) => other !== key) : [...ui.folded, key];
  render();
};

const itemRow = (path, item) => {
  const name = el('button', { className: 'item-row-name', type: 'button', onclick: () => itemHandler({ path, title: item.title }) }, [
    el('span', { textContent: item.title }),
    ...(item.body ? [el('small', { className: 'item-row-meta', textContent: item.body })] : []),
  ]);
  return el('li', { className: 'item-row' }, [el('div', { className: 'item-row-body' }, [name])]);
};

// A section is a head that folds, then its rows and its H3 sections, nested one level (UI-2).
const sectionNodes = (repo, section, nested = false) => {
  const key = keyOf(repo, section.path);
  const open = !ui.folded.includes(key);
  const button = el('button', { className: 'section-head-button', type: 'button', onclick: () => fold(key) }, [
    el('span', { textContent: `${nested ? section.title : section.path} · ${section.total}` }),
    el('span', { className: 'chevron', textContent: open ? '▾' : '▸' }),
  ]);
  button.setAttribute('aria-expanded', String(open));
  const head = el('li', { className: nested ? 'section-head nested' : 'section-head' }, [button]);
  if (!open) return [head];
  const rows = section.items.map((item) => itemRow(section.path, item));
  if (nested) rows.forEach((row) => row.classList.add('nested'));
  return [head, ...rows, ...section.children.flatMap((child) => sectionNodes(repo, child, true))];
};

// An action that no longer applies stays until the user discards it (SYNC-6, UI-5).
const staleBanner = (entry) =>
  el('section', { className: 'banner' }, [
    el('strong', { textContent: t('sync.staleTitle') }),
    el('p', { className: 'banner-text', textContent: messageOf(entry) }),
    el('button', {
      className: 'button outline',
      type: 'button',
      textContent: t('sync.discard'),
      onclick: () => apply(discardEntry(state, entry.id), { undoText: t('toast.discarded') }),
    }),
  ]);

const emptyText = (project, roadmap) => {
  if (!project) return t('projects.pick');
  const entry = cache[project.repo];
  if (!entry) return t('roadmap.notLoaded');
  if (entry.missing) return t('roadmap.missing');
  return roadmap.sections.length ? '' : t('roadmap.noSections');
};

export const renderProjects = () => {
  const visible = ui.view === 'projects';
  $('projects').hidden = !visible;
  if (ui.repo !== null && !findProject(state, ui.repo)) ui.repo = null;
  $('project-list').replaceChildren(...state.projects.map(projectRow));
  $('projects-empty').hidden = state.projects.length > 0;
  const project = ui.repo === null ? null : findProject(state, ui.repo);
  const roadmap = project ? roadmapOf(project.repo) : { sections: [] };
  // The pane shows the roadmap alone below 840px, and beside the list from 840px (LAY-3).
  if (project) $('projects').dataset.detail = '';
  else delete $('projects').dataset.detail;
  const empty = emptyText(project, roadmap);
  $('roadmap-empty').textContent = empty;
  $('roadmap-empty').hidden = !empty;
  const failed = project ? roadmap.failed : [];
  const stale = project ? pendingOf(state, project.repo).filter((entry) => entry.stale || failed.includes(entry.id)) : [];
  $('roadmap-stale').replaceChildren(...stale.map(staleBanner));
  $('roadmap-list').replaceChildren(...treeOf(roadmap.sections).flatMap((section) => sectionNodes(project.repo, section)));
  $('fab').hidden = !visible || !project || roadmap.sections.length === 0 || ui.sheetOpen;
};

export const bind = () => {
  $('roadmap-back').addEventListener('click', () => openProject(null));
};
