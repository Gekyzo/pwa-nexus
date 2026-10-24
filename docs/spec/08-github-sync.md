# GitHub sync

How the app reads each `ROADMAP.md` from GitHub and commits the actions of the user back.

## Client

- **GH-1** `createClient({ token, fetch })` of `src/github.js`. `fetch` is injected, so the tests
  need no network.
- **GH-2** `getFile(repo, 'ROADMAP.md')` calls `GET /repos/{repo}/contents/ROADMAP.md` past the
  HTTP cache and returns `{ text, sha }`. The base64 decode is UTF-8 safe (accents, emoji), and
  ignores the line breaks of the content.
- **GH-3** `putFile(repo, path, { text, sha, message })` calls `PUT` on the same URL and returns
  the new `sha`.
- **GH-4** The errors are a `GitHubError` with a type: `auth` (401), `forbidden` (403 for a
  repository that the token cannot reach or write), `notFound` (404), `conflict` (409, or 422
  for a stale sha), `rateLimit` (403 with `x-ratelimit-remaining: 0` or `retry-after`), and
  `network` (fetch throws, any other status, or a body that is
  not JSON).
- **GH-5** The token goes only to `https://api.github.com`, in the `Authorization` header. The
  client sends no other header that identifies the user.

## Queue and sync

- **SYNC-1** Every action is first an entry of the queue, `{ id, repo, op, args, createdAt }`, in
  the doc (PROJ-1). `op` is `add`, `edit`, `move` or `delete`. An entry that a sync could not apply has
  `stale: true`. A stored entry whose arguments do not fit its `op` makes the doc not valid, and
  an action that throws fails like a missing item.
- **SYNC-2** The screen shows the cached text of a repository with its queued actions applied on
  top, in their order. An action shows at once, online or offline.
- **SYNC-3** `syncRepo` of `src/queue.js` gets the file, then for each queued action in order:
  it applies the action, puts the file with the last sha, and the action leaves the queue. One
  action is one commit. An action that changes no byte leaves the queue with no commit.
- **SYNC-4** The commit messages are `Add roadmap item: <title>`, `Edit roadmap item: <title>`,
  `Move roadmap item to <path>: <title>` and `Delete roadmap item: <title>`. An edit or a move
  names the title before the action. The commit puts ` [pwa-nexus]` after this subject, and a
  body with the trailer `Via: pwa-nexus <version>`; with no known version, `Via: pwa-nexus`. The
  banner of UI-5 shows the subject with no tag.
- **SYNC-5** On a `conflict`, the sync gets the file again and retries that action once. A
  second conflict stops the sync of that repository and keeps the action.
- **SYNC-6** An action whose item or section no longer exists on GitHub is marked stale. It stays
  in the queue until the user discards it, and the sync goes on with the next action. A sync
  never drops an action silently, and never sends a stale one again. An `edit` or a `delete`
  carries the item as the phone saw it (`base`); if the item on GitHub has another title or body,
  the action is stale (`error.itemChanged`), so text written elsewhere is never overwritten.
- **SYNC-7** A `network` error stops the sync and keeps the queue as it is; the header says
  `sync.offline` or `sync.offlinePending`. An `auth` or `rateLimit` error stops the sync of all
  repositories, and the toast names the cause (`error.githubAuth`, `error.githubRateLimit`). A
  `notFound` marks the repository as having no `ROADMAP.md`, a `forbidden` shows
  `error.githubForbidden`, and a second `conflict` shows `error.githubConflict`; in these cases
  the sync goes on with the next repository.
- **SYNC-8** A sync runs when the app opens, once it has read its version (SYNC-4), on the
  `online` event and on the **Sync** button.
  The repositories sync one after the other, never two at a time. A sync asked for while one
  runs runs once more at its end. With no token or no network, no sync runs.
- **SYNC-9** While a sync runs, a bar on the bottom edge of the header (`sync-progress`, a
  `progressbar` named `sync.progress`) shows the part of the repositories that it has done,
  `syncShare` of `src/queue.js`: it starts empty and fills one step at the end of each
  repository. The bar hides when the sync ends, also when an error stops it.
- **SYNC-10** A sync reads the queue and the projects as they are at each step, not as they were
  when it started. Just before each commit it checks that the action is still in the queue: an
  action that the user discarded or undid, or whose project was removed, is not sent. A project
  removed during the sync is not synced, and its cache entry is not written back.

## Cache, projects and token

- **CACHE-1** `pwa-nexus.cache` holds `{ [repo]: { text, sha, fetchedAt } }`, or
  `{ missing: true, fetchedAt }` for a repository with no `ROADMAP.md`. The app reads a roadmap
  offline from it, and a sync replaces the entry. A stored cache that is not valid is kept under
  `pwa-nexus.cache.corrupt`.
- **PROJ-1** The doc `pwa-nexus.doc` is `{ version: 1, projects: [{ repo, label }], queue, defaults }`. A
  new install gets the six default projects: `Gekyzo/shopping-list`, `Gekyzo/pwa-wardrobe`,
  `Gekyzo/pwa-financial-calculator`, `Gekyzo/pwa-shifts`, `Gekyzo/pwa-nexus` and `Gekyzo/pwa-lists`,
  labelled Bodega, Attire, Compound, Rota, Nexus and Stash. A stored doc
  keeps its own list. `repo` is `owner/name`, also when pasted as a GitHub URL or
  with `.git` (`error.repoInvalid`); one repository two times, in any case, is `error.repoTaken`.
  A blank label is the name of the repository, and a label has at most 40 characters
  (`error.labelTooLong`). A stored doc that is not valid is kept under `pwa-nexus.doc.corrupt`,
  and the app starts with the defaults.
- **PROJ-2** Removing a project drops its queued actions and its cache entry. If it has queued
  actions, the screen asks first, because they are lost. A project that is gone is
  `error.projectMissing`.
- **PROJ-4** `defaults` lists the default projects that the doc was offered; a doc saved before
  it existed was offered the first three. At each start, a default project that the doc was never
  offered joins the end of the list, once. A default that the user removed is not added again,
  and a repository already in the list, in any case, is not added twice.
- **PROJ-3** Export and import carry the doc: the projects and the queue. They never carry the
  token or the cache.
- **TOK-1** The token is a fine-grained personal access token with **Contents: read and write**
  on the listed repositories only. Settings and the README tell the user how to make it.
- **TOK-2** The token is a preference of the device under `pwa-nexus.token`, not part of the doc.
  A blank token is no token. The field of Settings shows it masked. **Test the token**
  (`settings.tokenTest`) reads `ROADMAP.md` of each project and names the result of each one.
- **TOK-3** With no token, the app shows the cache read-only, the header says `sync.noToken`,
  and **Sync** is off.
