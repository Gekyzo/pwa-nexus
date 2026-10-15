import { $, ui, state, storage, t, setRender, render, showToast, hideToast, toastAction, clickGuardUntil } from '#ui/context';
import { findProject } from '#projects';
import { bind as bindNav, renderNav } from '#ui/nav';
import { bind as bindProjects, renderProjects } from '#ui/projects';
import { bind as bindSync, renderSync, syncAll } from '#ui/sync';
import { bind as bindItem, renderItemSheet, closeItemSheet } from '#ui/item';
import { bind as bindSettings, applyLanguage, renderSettings } from '#ui/settings';
import { bind as bindInstall, renderInstall } from '#ui/install';
import { readVersion, renderVersion, offerUpdate } from '#ui/update';
import { bind as bindOnboarding, closeOnboarding, turnOnboarding } from '#ui/onboarding';

const renderAll = () => {
  renderNav();
  const project = ui.view === 'projects' && ui.repo !== null ? findProject(state, ui.repo) : null;
  $('title').textContent = project?.label ?? t(`nav.${ui.view}`);
  renderProjects();
  renderSync();
  renderItemSheet();
  $('settings').hidden = ui.view !== 'settings';
  renderSettings();
  renderVersion();
  renderInstall();
};
setRender(renderAll);

bindNav();
bindProjects();
bindSync();
bindItem();
bindSettings();
bindInstall();
bindOnboarding();

document.addEventListener(
  'click',
  (event) => {
    if (Date.now() >= clickGuardUntil) return;
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

document.addEventListener('keydown', (event) => {
  if (ui.onboarding !== null) {
    if (event.key === 'Escape') closeOnboarding();
    else if (event.key === 'ArrowRight') turnOnboarding(1);
    else if (event.key === 'ArrowLeft') turnOnboarding(-1);
    return;
  }
  if (event.key !== 'Escape') return;
  if (ui.sheetOpen) closeItemSheet();
  else if (ui.repo !== null) {
    ui.repo = null;
    render();
  }
});

$('toast-action').addEventListener('click', () => {
  const action = toastAction;
  hideToast();
  action?.run();
});

applyLanguage();
if (ui.onboarding !== null) $('onboarding-next').focus();
if (!storage) showToast(t('error.noStorage'));
navigator.storage?.persist?.().catch(() => {});
navigator.serviceWorker?.register('./sw.js').catch(() => {});
// Read once at the start: the worker answers from the cache, then stores the file of the next deploy.
// The first sync waits for it, so its commits name the version (SYNC-4, SYNC-8).
readVersion('./version.json').then((running) => {
  ui.version.running = running;
  renderVersion();
  syncAll();
  navigator.serviceWorker?.ready.then(offerUpdate).catch(() => {});
});
