import { APP_SLUG } from '#config';

// The last ROADMAP.md read from each repository, so the app shows it offline (CACHE-1). It is
// not part of the doc: export and import leave it out (PROJ-3).
export const CACHE_KEY = `${APP_SLUG}.cache`;

export const emptyCache = () => ({});

const validEntry = (entry) =>
  typeof entry === 'object' &&
  entry !== null &&
  typeof entry.fetchedAt === 'number' &&
  (entry.missing === true || (typeof entry.text === 'string' && typeof entry.sha === 'string'));

export const normalizeCache = (data) => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const entries = Object.entries(data);
  if (!entries.every(([, entry]) => validEntry(entry))) return null;
  return Object.fromEntries(
    entries.map(([repo, entry]) => [
      repo,
      entry.missing ? { missing: true, fetchedAt: entry.fetchedAt } : { text: entry.text, sha: entry.sha, fetchedAt: entry.fetchedAt },
    ]),
  );
};

// Moves the entry of each renamed repository to its new name; an entry of the new name wins
// (PROJ-6). `renamed` maps the old name, in lower case, to the new one.
export const renameEntries = (cache, renamed) =>
  Object.fromEntries(
    Object.entries(cache)
      .map(([key, entry]) => {
        const [repo, ...file] = key.split(':');
        const name = renamed[repo.toLowerCase()];
        return [name && [name, ...file].join(':'), key, entry];
      })
      .filter(([name]) => !name || !(name in cache))
      .map(([name, repo, entry]) => [name ?? repo, entry]),
  );

// The key of a file of a repository: the repository for its ROADMAP.md, `<repo>:<file>` for another.
export const cacheKeyOf = (repo, file = 'ROADMAP.md') => (file === 'ROADMAP.md' ? repo : `${repo}:${file}`);

export const putEntry = (cache, repo, entry) => ({ ...cache, [repo]: entry });

export const dropEntry = (cache, repo) => Object.fromEntries(Object.entries(cache).filter(([key]) => key !== repo));
