import { APP_SLUG } from '#config';
import { isEntry } from '#queue';

// The doc of the app: the projects and the queue of actions that wait for a sync (PROJ-1).
export const DOC_KEY = `${APP_SLUG}.doc`;
export const MAX_LABEL = 40;
export const REPO = /^[\w.-]+\/[\w.-]+$/;

export const DEFAULT_PROJECTS = [
  { repo: 'Gekyzo/shopping-list', label: 'Shopping' },
  { repo: 'Gekyzo/pwa-wardrobe', label: 'Wardrobe' },
  { repo: 'Gekyzo/pwa-financial-calculator', label: 'Financial calculator' },
  { repo: 'Gekyzo/pwa-shifts', label: 'Shifts' },
  { repo: 'Gekyzo/pwa-nexus', label: 'Nexus' },
];

export const emptyDoc = () => ({ version: 1, projects: DEFAULT_PROJECTS.map((project) => ({ ...project })), queue: [] });

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
  const projects = data.projects.map(({ repo, label }) => ({ repo, label: label.trim() }));
  if (new Set(projects.map((project) => project.repo.toLowerCase())).size !== projects.length) return null;
  const queue = data.queue.map(({ id, repo, op, args, createdAt, stale }) => ({ id, repo, op, args, createdAt, ...(stale ? { stale } : {}) }));
  return { version: 1, projects, queue };
};
