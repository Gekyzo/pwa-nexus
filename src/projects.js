import { APP_SLUG } from '#config';
import { isEntry } from '#queue';

// The doc of the app: the projects and the queue of actions that wait for a sync (PROJ-1).
export const DOC_KEY = `${APP_SLUG}.doc`;
export const MAX_LABEL = 40;
export const REPO = /^[\w.-]+\/[\w.-]+$/;

export const DEFAULT_PROJECTS = [
  { repo: 'Gekyzo/shopping-list', label: 'Bodega' },
  { repo: 'Gekyzo/pwa-wardrobe', label: 'Attire' },
  { repo: 'Gekyzo/pwa-financial-calculator', label: 'Compound' },
  { repo: 'Gekyzo/pwa-shifts', label: 'Rota' },
  { repo: 'Gekyzo/pwa-nexus', label: 'Nexus' },
  { repo: 'Gekyzo/pwa-lists', label: 'Stash' },
  { repo: 'Gekyzo/pwa-fittings', label: 'Fittings' },
];

// The default projects that a doc saved before `defaults` existed was offered (PROJ-4).
const FIRST_DEFAULTS = ['Gekyzo/shopping-list', 'Gekyzo/pwa-wardrobe', 'Gekyzo/pwa-financial-calculator'];

export const emptyDoc = () => ({
  version: 1,
  projects: DEFAULT_PROJECTS.map((project) => ({ ...project })),
  queue: [],
  defaults: DEFAULT_PROJECTS.map((project) => project.repo),
});

export const findProject = (state, repo) => state.projects.find((project) => project.repo === repo) ?? null;

const missing = (state) => ({ state, error: { key: 'error.projectMissing' } });
const sameRepo = (a, b) => a.toLowerCase() === b.toLowerCase();

// A blank label is the name of the repository.
const checkLabel = (label, repo) => {
  const clean = String(label ?? '').trim() || repo.split('/')[1];
  if (clean.length > MAX_LABEL) return { error: { key: 'error.labelTooLong', params: { max: MAX_LABEL } } };
  return { clean };
};

// `owner/name`, from what the user pasted: a URL of GitHub or a clone name ends the same way.
const cleanRepo = (repo) =>
  String(repo ?? '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');

export const addProject = (state, repo, label = '') => {
  const clean = cleanRepo(repo);
  if (!REPO.test(clean)) return { state, error: { key: 'error.repoInvalid' } };
  if (state.projects.some((project) => sameRepo(project.repo, clean))) return { state, error: { key: 'error.repoTaken' } };
  const { clean: name, error } = checkLabel(label, clean);
  if (error) return { state, error };
  return { state: { ...state, projects: [...state.projects, { repo: clean, label: name }] } };
};

export const renameProject = (state, repo, label) => {
  if (!findProject(state, repo)) return missing(state);
  const { clean, error } = checkLabel(label, repo);
  if (error) return { state, error };
  return { state: { ...state, projects: state.projects.map((project) => (project.repo === repo ? { ...project, label: clean } : project)) } };
};

// The queued actions of the project go with it (PROJ-2): the screen asks first.
export const removeProject = (state, repo) => {
  if (!findProject(state, repo)) return missing(state);
  return {
    state: {
      ...state,
      projects: state.projects.filter((project) => project.repo !== repo),
      queue: state.queue.filter((entry) => entry.repo !== repo),
    },
  };
};

// The inverse of removeProject: the project goes back at `index`, and its actions after the
// queue as it is now, without those whose id is in `committed` (UI-10).
export const restoreProject = (state, { project, index, entries }, committed = []) => {
  if (findProject(state, project.repo)) return { state };
  const projects = [...state.projects];
  projects.splice(Math.min(index, projects.length), 0, project);
  const back = entries.filter((entry) => !committed.includes(entry.id) && !state.queue.some((one) => one.id === entry.id));
  return { state: { ...state, projects, queue: [...state.queue, ...back] } };
};

// Adds each default project that the doc was never offered, once: a default that the user removed
// stays removed, and a repository already in the list is not added twice (PROJ-4).
export const offerDefaults = (state) => {
  const offered = state.defaults ?? FIRST_DEFAULTS;
  const fresh = DEFAULT_PROJECTS.filter(
    ({ repo }) => !offered.some((other) => sameRepo(other, repo)) && !state.projects.some((project) => sameRepo(project.repo, repo)),
  );
  return {
    ...state,
    projects: [...state.projects, ...fresh.map((project) => ({ ...project }))],
    defaults: DEFAULT_PROJECTS.map((project) => project.repo),
  };
};

const validProject = (project) =>
  typeof project === 'object' &&
  project !== null &&
  typeof project.repo === 'string' &&
  REPO.test(project.repo) &&
  typeof project.label === 'string' &&
  project.label.trim() !== '';

// A clean version 1 doc, or null. Add a migration here when the version goes up.
export const normalizeDoc = (data) => {
  if (typeof data !== 'object' || data === null || data.version !== 1) return null;
  if (!Array.isArray(data.projects) || !Array.isArray(data.queue)) return null;
  if (!data.projects.every(validProject) || !data.queue.every(isEntry)) return null;
  const { defaults } = data;
  if (defaults !== undefined && !(Array.isArray(defaults) && defaults.every((repo) => typeof repo === 'string' && REPO.test(repo)))) return null;
  const projects = data.projects.map(({ repo, label }) => ({ repo, label: label.trim() }));
  if (new Set(projects.map((project) => project.repo.toLowerCase())).size !== projects.length) return null;
  const queue = data.queue.map(({ id, repo, op, args, createdAt, stale, sent }) => ({
    id,
    repo,
    op,
    args,
    createdAt,
    ...(stale ? { stale } : {}),
    ...(sent ? { sent } : {}),
  }));
  return { version: 1, projects, queue, ...(defaults ? { defaults: [...defaults] } : {}) };
};
