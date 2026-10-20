import { normalizeDoc, addProject, renameProject, removeProject } from '#projects';
import { dropEntry } from '#cache';
import { createClient } from '#github';
import { ROADMAP_PATH, pendingOf } from '#queue';
import { exportJson, exportFilename, importJson } from '#storage';
import { LANGUAGES, LANGUAGE_NAMES } from '#i18n';
import { switchModule } from '#modules';
import {
  $,
  el,
  state,
  cache,
  token,
  t,
  lang,
  chosen,
  hand,
  theme,
  off,
  isOn,
  textOf,
  showToast,
  apply,
  render,
  setLanguage,
  setHand,
  setTheme,
  setModules,
  setNavMotion,
  setToken,
  setCache,
} from '#ui/context';
import { icon } from '#ui/controls';
import { syncAll, errorKey } from '#ui/sync';
import { runUpdate } from '#ui/update';
import { renderOnboarding } from '#ui/onboarding';

// Writes the fixed text of the page, then the text that a render builds.
export const applyLanguage = () => {
  document.documentElement.lang = lang;
  document.title = t('app.title');
  // The worker answers the manifest in this language (SW-13).
  const text = { type: 'manifest', lang, name: t('app.title'), description: t('app.description') };
  navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage(text)).catch(() => {});
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((node) => {
    node.dataset.i18nAttr.split(',').forEach((pair) => {
      const [name, key] = pair.split(':');
      node.setAttribute(name, t(key));
    });
  });
  const option = (value, text) => el('option', { value, textContent: text, selected: value === (chosen ?? '') });
  $('language').replaceChildren(
    option('', t('settings.automatic')),
    ...LANGUAGES.map((code) => option(code, LANGUAGE_NAMES[code])),
  );
  const handOption = (value, key) => el('option', { value, textContent: t(key), selected: value === hand });
  $('hand').replaceChildren(handOption('right', 'settings.handRight'), handOption('left', 'settings.handLeft'));
  const themeOption = (value, key) => el('option', { value, textContent: t(key), selected: value === theme });
  $('theme').replaceChildren(
    themeOption('system', 'settings.automatic'),
    themeOption('light', 'settings.themeLight'),
    themeOption('dark', 'settings.themeDark'),
  );
  document.querySelectorAll('[data-module]').forEach((box) => {
    box.checked = isOn(box.dataset.module);
  });
  render();
  renderOnboarding();
};

// One row of the project editor: its name as a field, its repository, and Remove (UI-6).
const editorRow = (project) => {
  const label = el('input', { className: 'input raised', type: 'text', value: project.label, maxLength: 40 });
  label.setAttribute('aria-label', t('settings.label', { repo: project.repo }));
  label.addEventListener('change', () => apply(renameProject(state, project.repo, label.value)));
  const remove = el('button', { className: 'button icon danger', type: 'button', onclick: () => removeRepo(project.repo) }, [icon('trash')]);
  remove.setAttribute('aria-label', t('settings.remove', { repo: project.repo }));
  return el('li', {}, [el('div', { className: 'input-row' }, [label, remove]), el('small', { className: 'list-row-meta', textContent: project.repo })]);
};

// The actions that wait for this project go with it, so the app asks first (PROJ-2).
const removeRepo = (repo) => {
  const waiting = pendingOf(state, repo).length;
  if (waiting && !window.confirm(t('settings.removeQueued', { count: waiting }))) return;
  if (apply(removeProject(state, repo), { undoText: t('toast.projectRemoved') })) setCache(dropEntry(cache, repo));
};

export const renderSettings = () => {
  $('project-editor').replaceChildren(...state.projects.map(editorRow));
};

// Each project gets one read with the token, and the toast names the result of each one (TOK-2).
const testToken = async () => {
  if (!token) {
    showToast(t('error.githubAuth'));
    return;
  }
  const client = createClient({ token, fetch: (...args) => fetch(...args) });
  const lines = await Promise.all(
    state.projects.map(async ({ repo, label }) => {
      try {
        await client.getFile(repo, ROADMAP_PATH);
        return `${label} ✓`;
      } catch (error) {
        return `${label}: ${t(errorKey(error.type))}`;
      }
    }),
  );
  showToast(lines.join(' · '), { ms: 8000 });
};

const download = (filename, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  el('a', { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const bind = () => {
  $('token').value = token ?? '';
  $('token').addEventListener('change', (event) => {
    setToken(event.target.value);
    event.target.value = token ?? '';
    syncAll();
  });
  $('token-test').addEventListener('click', testToken);
  $('project-add').addEventListener('click', () => {
    if (!apply(addProject(state, $('project-repo').value))) return;
    $('project-repo').value = '';
    syncAll();
  });
  $('export').addEventListener('click', () => {
    download(exportFilename(new Date()), exportJson(state));
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('language').addEventListener('change', (event) => {
    setLanguage(event.target.value || null);
    applyLanguage();
  });
  $('hand').addEventListener('change', (event) => setHand(event.target.value));
  $('theme').addEventListener('change', (event) => setTheme(event.target.value));
  document.querySelectorAll('[data-module]').forEach((box) => {
    box.addEventListener('change', () => {
      setModules(switchModule(off, box.dataset.module, box.checked));
      setNavMotion(true);
      render();
      setNavMotion(false);
    });
  });
  $('update').addEventListener('click', () => runUpdate($('update')));
  $('import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    const result = importJson(await file.text(), normalizeDoc);
    if (result.error) {
      showToast(textOf(result.error));
      return;
    }
    const projects = t('projects.count', { count: result.state.projects.length });
    if (!window.confirm(t('import.confirm', { projects }))) return;
    apply(result, { undoText: t('toast.imported') });
  });
};
